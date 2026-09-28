window.LiveDetection=(()=>{
  const Model=LiveDetectionModel,gate=Model.sceneGate(2),stable=OCRRuntime.stability();
  const hudFields=new Set(['resultStatus','gameTime','blue.kills','red.kills','blue.gold','red.gold','blue.turrets','red.turrets','draftPhase','draftTimer.remaining']);
  let session=null,lastMode=null,lastVisualMode=null,rowIndex=0,epoch=0,lastSeenAt=0;
  let lastClock=null,detailJob=null,hudMs=0,detailMs=0,detailError='',lastSceneProbeAt=0;
  const values=new Map(),queries=new Map(),highWater=new Map(),identities=new Map(),goldAt=new Map();
  let catalog=[],lastAccepted=[],lastAcceptedAt=0,learningQuery=null,postgameTriggeredEpoch=0;
  let catalogItems=[]; fetch('/assets/catalog.json').then(r=>r.json()).then(c=>{catalog=c.heroes||[]; catalogItems=c.items||[];}).catch(()=>{});
  function regions(mode){
    try{
      const saved=JSON.parse(localStorage.getItem('liveRegions:'+mode)||'null');
      if(mode==='game'){
        const gt=saved?.find?.(r=>r.field==='gameTime');
        const bName=saved?.find?.(r=>r.field==='blue.players.0.name');
        if(!gt||gt.y<25||bName?.y<360||JSON.stringify(saved)===JSON.stringify(Model.legacyGame)){
          localStorage.removeItem('liveRegions:game');
          return structuredClone(Model.profiles.game);
        }
      }
      return Model.validateRegions(saved,mode);
    }catch{
      return structuredClone(Model.profiles[mode]);
    }
  }
  function reset(){epoch++;gate.reset();stable.clear();values.clear();queries.clear();highWater.clear();identities.clear();goldAt.clear();lastMode=null;lastVisualMode=null;rowIndex=0;lastClock=null;lastSeenAt=0;lastAccepted=[];lastAcceptedAt=0;learningQuery=null;detailError='';postgameTriggeredEpoch=0;}
  async function start(current){
    reset();HeroRecognition.clearReferences();const d=await api('/api/detection/start',{});
    if(!current()){await api('/api/detection/stop',{session:d.session});return;}
    session=d.session;
  }
  function stop(){stopAiLoop();const old=session;session=null;reset();if(old)api('/api/detection/stop',{session:old}).catch(()=>{});if($('#detectStatus'))$('#detectStatus').textContent='Local detection stopped';}
  function status(text){$('#detectStatus').textContent=text;}
  function health(){$('#ocrSpeed').textContent=`Scoreboard: ${hudMs} ms · Statistics: ${detailMs||'preparing'}${detailMs?' ms':''}`;}
  function paint(){
    const readings=[...values.values()];
    $('#ocrResults').innerHTML=readings.map(r=>`<div class="ocrrow"><span>${esc(r.field)}</span><b>${esc(r.value??'Unknown')}</b><span>${esc(r.reason)}${r.similarity!==undefined?' · '+r.similarity+'% similarity':' · '+Math.round(r.confidence||0)+'%'}</span></div>`).join('');
    lastAccepted=readings.filter(r=>r.accepted&&Date.now()-r.at<5000).map(({field,value})=>({field,value}));
    lastAcceptedAt=Date.now();$('#applyOcr').disabled=!lastAccepted.length;
    const unknown=readings.filter(r=>Model.isHero(r.field)&&!r.accepted);
    if(!$('#learnSlot').closest('details').open){const selection=$('#learnSlot').value;$('#learnSlot').innerHTML=unknown.map(r=>`<option value="${esc(r.field)}">${esc(r.field)}</option>`).join('');if(unknown.some(r=>r.field===selection))$('#learnSlot').value=selection;}
    if($('#learnHero').options.length<2)$('#learnHero').innerHTML='<option value="">Select the hero shown</option>'+catalog.map(h=>`<option>${esc(h.name)}</option>`).join('');
  }
  async function read(worker,r,frame,min,current,{fast=false}={}){
    const kind=r.field==='draftPhase'?'text':r.field==='draftTimer.remaining'?'clock':OCRModel.kind(r.field),parse=data=>r.field==='draftPhase'?Model.draftPhase(data.text):r.field==='draftTimer.remaining'?Model.draftClock(data.text):r.field==='resultStatus'?(Model.resultOutcome(data.text)?data.text.trim():null):OCRModel.parse(data.text,r.field);
    const whitelist=['resultStatus','draftPhase'].includes(r.field)?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ':r.field.endsWith('.name')?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[] _-.':kind==='text'?'':kind==='kda'?'0123456789/ ':kind==='clock'?'0123456789Oo:':r.field.endsWith('gold')?'0123456789Oo.kK':'0123456789Oo';
    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:whitelist});
    if(!current())return null;
    const prepared=prepareOcrCrop(r,frame,kind),raw=crop(r,frame).canvas;let {data}=await worker.recognize(prepared);if(!current())return null;
    const poor=()=>data.confidence<min||parse(data)===null;
    const consider=next=>{if(parse(next)!==null&&(parse(data)===null||next.confidence>data.confidence))data=next;};
    if(poor()){const retry=await worker.recognize(raw);if(!current())return null;consider(retry.data);}
    if(!fast&&poor()&&kind!=='text'){
      const retry=await worker.recognize(prepareOcrCrop(r,frame,kind,'threshold'));if(!current())return null;consider(retry.data);
    }
    if(!fast&&poor()&&kind==='number'&&!r.field.endsWith('gold')){
      await worker.setParameters({tessedit_pageseg_mode:'10'});const retry=await worker.recognize(raw);if(!current())return null;consider(retry.data);
    }
    if(!fast&&poor()&&r.field==='draftTimer.remaining'){
      await worker.setParameters({tessedit_pageseg_mode:'10'});const retry=await worker.recognize(prepared);if(!current())return null;consider(retry.data);
    }
    if(!fast&&poor()&&kind==='kda'){
      await worker.setParameters({tessedit_pageseg_mode:'6'});const retry=await worker.recognize(raw);if(!current())return null;consider(retry.data);
    }
    if(!fast&&poor()&&(kind==='kda'||r.field.endsWith('.level'))){
      await worker.setParameters({tessedit_pageseg_mode:'13'});const retry=await worker.recognize(prepared);if(!current())return null;consider(retry.data);
    }
    return {field:r.field,value:parse(data),confidence:data.confidence,text:data.text.trim()};
  }
  function prepareOcrCrop(r,frame,kind,variant='adaptive'){
    // crop() already scales the text to OCR size. Scaling again made a tiny
    // clock hundreds of pixels tall and multiplied every recognition/retry cost.
    const isolated=crop(r,frame,true).canvas,scale=1,w=isolated.width,h=isolated.height;
    const out=document.createElement('canvas');out.width=w*scale;out.height=h*scale;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
    const src=isolated.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h),gray=new Uint8Array(w*h);
    for(let i=0;i<gray.length;i++){const p=i*4;gray[i]=Math.round(src.data[p]*.299+src.data[p+1]*.587+src.data[p+2]*.114);}
    // Local adaptive threshold retains thin HUD strokes while rejecting colored
    // backgrounds and gradients. A global threshold remains a retry for hard crops.
    const radius=Math.max(3,Math.min(12,Math.round(Math.min(w,h)*.12))),integral=new Uint32Array((w+1)*(h+1)),stride=w+1;
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=gray[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
    const pix=ctx.createImageData(w,h),threshold=variant==='threshold';
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const x0=Math.max(0,x-radius),x1=Math.min(w-1,x+radius),y0=Math.max(0,y-radius),y1=Math.min(h-1,y+radius),area=(x1-x0+1)*(y1-y0+1);
      const mean=(integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0])/area;
      const cut=threshold?190:Math.min(220,Math.max(125,mean-12)),v=gray[y*w+x]<cut?0:255;
      const q=(y*w+x)*4;pix.data[q]=pix.data[q+1]=pix.data[q+2]=v;pix.data[q+3]=255;
    }
    const binary=document.createElement('canvas');binary.width=w;binary.height=h;binary.getContext('2d').putImageData(pix,0,0);ctx.drawImage(binary,0,0,out.width,out.height);return out;
  }
  function accept(result,min,continuous,sampledAt){
    const {field,value,confidence}=result,clock=field==='gameTime'||field==='draftTimer.remaining';
    const confirmed=stable.observe(field,value!==null&&confidence>=min?value:null,continuous&&!clock&&!field.endsWith('.gold')?Math.max(1,Number($('#ocrStability')?.value||3)):1);
    const previous=highWater.get(field),gold=field.endsWith('.gold');
    const correction=gold&&previous!==undefined&&value!==null&&value*5<=previous&&stable.observe(field+':correction',confidence>=min?value:null,3);
    const spike=continuous&&gold&&value!==null&&OCRRuntime.goldJump(previous,value,sampledAt-(goldAt.get(field)||sampledAt));
    const decreased=continuous&&previous!==undefined&&typeof value==='number'&&!clock&&value<previous&&!correction;
    const kdaDecrease=continuous&&previous!==undefined&&field.endsWith('.kda')&&value&&value.split('/').some((n,i)=>Number(n)<Number(previous.split('/')[i]));
    values.set(field,{...result,at:sampledAt,accepted:confirmed&&!spike&&!decreased&&!kdaDecrease,reason:spike?'Gold spike held':decreased||kdaDecrease?'Decrease held':confirmed?'Ready':value===null||confidence<min?'Unreadable':'Confirming'});
    if(confirmed&&!spike&&!decreased&&!kdaDecrease){highWater.set(field,value);if(gold)goldAt.set(field,sampledAt);}
  }
  async function deliver(rows,{ownSession,mode,sampledAt,live,current,switchScene}){
    if(!$('#ocrAutoApply').checked||!current())return;
    const readings=rows.map(r=>values.get(r.field)).filter(r=>r?.accepted&&r.at===sampledAt).map(({field,value})=>({field,value}));
    const sentAt=performance.now(),result=await api('/api/detection',{session:ownSession,mode,readings,sampledAt,live,switchScene});
    if(!current())return;
    if(result.expired)throw Error('Another control tab owns live detection. Restart here to take control.');
    $('#ocrDelivery').textContent='Delivery: '+Math.round(performance.now()-sentAt)+' ms';
    $('#sourceSummary').textContent='Live capture · '+(mode==='result'?'Match result':mode==='draft'?'Draft picks and bans':'In-game scoreboard');
    if(result.playoffs?.status==='applied')toast(result.playoffs.message);
    const playoffStatus=$('#playoffResultStatus');if(playoffStatus&&result.playoffs?.message)playoffStatus.textContent=result.playoffs.message;
  }
  async function details({pool,frame,sampledAt,continuous,current,ownSession,mode,layout,min}){
    const started=performance.now(),row=rowIndex++%5;
    // Scoreboard statistics run separately so they never delay clock and kills.
    const batch=layout.filter(r=>!hudFields.has(r.field)&&(['game','result'].includes(mode)?!r.field.includes('.players.')||Number(r.field.split('.')[2])===row:!r.field.endsWith('.name')||$('#detectDraftNames').checked));
    const readings=[];
    await OCRRuntime.parallel(batch.filter(r=>!Model.isHero(r.field)),pool,async(worker,r)=>{const result=await read(worker,r,frame,min,current,{fast:continuous});if(result)readings.push(result);},current);
    if(!current())return;
    // Publish readable player names/levels before loading or matching portraits.
    // A recognized name can already establish the row identity on the server.
    if(mode==='game'&&Date.now()-sampledAt<=2500){
      for(const result of readings)accept(result,min,continuous,sampledAt);
      paint();await deliver(batch,{ownSession,mode,sampledAt,live:false,current,switchScene:false});
    }
    const freshQueries=batch.filter(r=>Model.isHero(r.field)).map(r=>HeroRecognition.query(frame,r,mode));
    freshQueries.forEach(q=>queries.set(q.field,q));
    // Bot spectator labels explicitly name the hero. Confirm those labels and
    // use their current portraits as session-only references for matching skins.
    const labeled=new Map(),references=[];
    if(mode==='game')for(const r of readings.filter(r=>r.field.endsWith('.name'))){
      const hero=r.confidence>=min?Model.spectatorHero(r.value,catalog):null;
      const field=r.field.replace(/name$/,'hero'),q=queries.get(field);
      const confirmed=stable.observe(r.field+':label',hero,continuous?2:1);
      if(hero){labeled.set(field,{hero,confidence:r.confidence});if(confirmed&&q)references.push({hero,kind:q.kind,pixels:q.pixels});}
    }
    let matches=[];
    try{if(freshQueries.length){await HeroRecognition.reference(references);matches=await HeroRecognition.match(freshQueries);}if(current())detailError='';}catch(e){if(current())detailError='Portrait matching: '+e.message;}
    if(!current()||Date.now()-sampledAt>2500)return;
    for(const [field,label]of labeled){const reading={field,value:label.hero,similarity:label.confidence,reason:'Hero read from spectator label'};const i=matches.findIndex(r=>r.field===field);if(i>=0)matches[i]=reading;else matches.push(reading);}
    for(const r of matches){
      if(mode==='game'&&r.field.endsWith('.hero')&&r.value&&identities.get(r.field)!==r.value){
        const prefix=r.field.slice(0,-4);for(const field of values.keys())if(field.startsWith(prefix)){values.delete(field);highWater.delete(field);stable.observe(field,null);}identities.set(r.field,r.value);
      }
      const confirmed=stable.observe(r.field,r.value,continuous?Math.max(2,Number($('#ocrStability')?.value||3)):1);values.set(r.field,{...r,at:sampledAt,confidence:r.similarity,accepted:confirmed,reason:r.value&&!confirmed?'Confirming':r.reason});
    }
    if(mode!=='game')for(const result of readings)accept(result,min,continuous,sampledAt);
    paint();
    await deliver(batch,{ownSession,mode,sampledAt,live:false,current,switchScene:false});
    if(current()){detailMs=Math.round(performance.now()-started);health();}
  }
  async function scan({pool,frame,sampledAt,live,current,continuous}){
    frame=DraftCapture.normalize(frame);
    if(!session){await start(current);if(!current())return;}
    const ownSession=session,started=performance.now(),min=Number($('#confidence').value),probes=[];
    const gr=regions('game'),rr=regions('result'),dr=regions('draft');
    const checkScene=lastMode!=='game'||sampledAt-lastSceneProbeAt>=750;
    if(checkScene)lastSceneProbeAt=sampledAt;
    // Check the explicit draft heading first; it also prevents a draft countdown
    // from being mistaken for the gameplay clock.
    const phase=dr.find(r=>r.field==='draftPhase'),draftProbe=checkScene&&phase?await read(pool[0],phase,frame,min,current,{fast:continuous}):null;
    if(draftProbe?.value)probes.push(draftProbe);
    const probeRegions=draftProbe?.value?[dr.find(r=>r.field==='draftTimer.remaining')]:[...(checkScene?[rr.find(r=>r.field==='resultStatus')]:[]),...gr.filter(r=>hudFields.has(r.field))];
    // Two HUD workers run independently from the two statistics workers.
    await OCRRuntime.parallel(probeRegions.filter(Boolean),pool.slice(0,2),async(worker,r)=>{
      const result=await read(worker,r,frame,min,current,{fast:continuous});
      if(result)probes.push(result);
    },current);
    if(!current())return;
    const visualMode=Model.classify(probes,65),mode=continuous?gate.observe(visualMode):visualMode;
    if(visualMode!==lastVisualMode){epoch++;stable.clear();values.clear();highWater.clear();goldAt.clear();lastVisualMode=visualMode;paint();}
    if(!mode){
      status(visualMode?'Confirming '+(visualMode==='result'?'match result':visualMode==='draft'?'draft':'in-game scoreboard')+'…':'Waiting for a draft, in-game scoreboard or match-result screen');$('#applyOcr').disabled=true;
      if(lastSeenAt&&Date.now()-lastSeenAt>1200){await api('/api/detection/hold',{session:ownSession});lastClock=null;lastSeenAt=0;}
      return;
    }
    if(Date.now()-sampledAt>2500)return;
    lastSeenAt=Date.now();
    if(mode!==lastMode){epoch++;stable.clear();values.clear();queries.clear();highWater.clear();goldAt.clear();identities.clear();rowIndex=0;lastClock=null;lastMode=mode;}
    const ownEpoch=epoch,valid=()=>current()&&ownSession===session&&ownEpoch===epoch;
    const layout=mode==='result'?rr:mode==='draft'?dr:gr;
    if($('#detectCalibration').value!==mode){$('#detectCalibration').value=mode;loadRegions();drawCapture();}
    const core=probes.filter(r=>mode==='result'?r.field==='resultStatus':mode==='draft'?r.field.startsWith('draft'):!r.field.startsWith('draft')&&r.field!=='resultStatus');
    if(mode==='result')for(const field of ['blue.kills','red.kills','gameTime']){const r=rr.find(row=>row.field===field);if(r){const result=await read(pool[0],r,frame,min,valid);if(result)core.push(result);}}
    if(mode==='result'&&postgameTriggeredEpoch!==ownEpoch&&typeof PostgameOCR!=='undefined'){postgameTriggeredEpoch=ownEpoch;PostgameOCR.scanSource(frame).then(data=>{if($('#ocrAutoApply')?.checked&&data){PostgameOCR.applyPostgameResult(data);}}).catch(e=>console.warn('Auto postgame OCR:',e.message));}
    if(!valid())return;
    for(const result of core)accept(result,min,continuous,sampledAt);
    let ticking=mode==='result'?false:live;
    if(mode==='game'){
      const clock=values.get('gameTime');
      if(clock?.accepted){let previous=lastClock;if(!previous||previous.value!==clock.value)previous={value:clock.value,at:sampledAt};if(sampledAt-previous.at>1500)ticking=false;lastClock=previous;ticking=ticking&&$('#ocrSmoothClock').checked;}
      else if(lastClock&&sampledAt-lastClock.at>1500){await api('/api/detection/hold',{session:ownSession});if(!valid())return;}
    }
    await deliver(core,{ownSession,mode,sampledAt,live:ticking,current:valid,switchScene:$('#detectSwitchScene').checked});
    if(!valid())return;
    hudMs=Math.round(performance.now()-started);health();paint();
    if(typeof state!=='undefined'){
      renderAiHud({mode,engine:'Local Neural OCR (100% Offline)',applied:$('#ocrAutoApply')?.checked,patch:state},hudMs);
    }
    status((mode==='result'?'Match result detected':mode==='draft'?'Draft detected':'In-game scoreboard detected')+' · '+lastAccepted.length+' readings'+($('#ocrAutoApply').checked?' · Live':' · Review mode'));
    $('#ocrStatus').textContent=detailError||(mode==='draft'?'Reading the draft phase, timer, five picks and this round\'s ban slots. Covered or uncertain portraits stay pending.':'Reading the spectator scoreboard and player levels.');
    if(!continuous&&detailJob)await detailJob;
    if(!valid())return;
    if(!detailJob){
      const work=details({pool:pool.slice(2),frame,sampledAt,continuous,current:valid,ownSession,mode,layout,min});
      const tracked=work.catch(e=>{if(valid()){detailError='Statistics detection: '+e.message;$('#ocrStatus').textContent=detailError;}}).finally(()=>{if(detailJob===tracked)detailJob=null;});
      detailJob=tracked;
    }
    if(!continuous)await detailJob;
  }
  // Stop clock extrapolation and keep the last confirmed statistics on the
  // overlay when the capture stops delivering usable frames. Nothing is
  // cleared, so a recovered feed resumes from the last confirmed values.
  async function hold(){
    if(!session)return;
    lastClock=null;lastSeenAt=0;
    await api('/api/detection/hold',{session}).catch(()=>{});
  }
  async function apply(){if(!session||!lastMode)throw Error('Detect a frame first');const readings=Date.now()-lastAcceptedAt<5000?lastAccepted:[];if(!readings.length)throw Error('Readings expired; scan again');await api('/api/detection',{session,mode:lastMode,readings,sampledAt:Date.now(),live:false,switchScene:$('#detectSwitchScene').checked});}
  function grab(){learningQuery=queries.get($('#learnSlot').value);if(learningQuery)$('#learnPreview').src=learningQuery.thumbnail;}
  async function learn(){const q=learningQuery,hero=$('#learnHero').value;if(!q||!hero)throw Error('Capture a portrait and choose its hero');await HeroRecognition.learn(q,hero);stable.clear();toast('Portrait sample saved. Matching continues on the live feed.');}

  // =========================================================================
  // Local HUD recognition continues independently of the selected AI provider.
  // =========================================================================
  let aiLoopActive = false;
  let aiLoopTimer = null;
  let aiClockTicker = null;
  let aiConsecutiveErrors = 0;
  let aiInFlight = null;
  let aiEpoch = 0;
  let aiSession = null;
  let aiClockExpiresAt = 0;
  let aiSessionPromise = null, aiHud = null, aiScheduler = null, aiLastResult = null, aiLastLatency = 0;

  let localGameSeconds = 0;
  let localGameSyncedAt = 0;
  let localGameRunning = false;
  let localDraftEndAt = 0;
  let localDraftRunning = false;

  function heroIconUrl(heroName) {
    if (!heroName) return '';
    const h = catalog.find(item => item.name.toLowerCase() === String(heroName).toLowerCase());
    return h?.icon || h?.wikiIcon || h?.face || '';
  }

  function itemIconUrl(itemName) {
    if (!itemName) return '';
    const clean = str => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = clean(itemName);
    const found = catalogItems.find(i => clean(i.name) === target || clean(i.name).startsWith(target));
    return found?.icon || '';
  }

  function normalizeSourceForAI(source) {
    if (typeof document === 'undefined') return source;
    const sw = source.videoWidth || source.naturalWidth || source.width || 1920;
    const sh = source.videoHeight || source.naturalHeight || source.height || 1080;
    const maxDim = 1920;
    let dw = sw, dh = sh;
    if (dw > maxDim || dh > maxDim) {
      if (dw >= dh) {
        dh = Math.round((dh * maxDim) / dw);
        dw = maxDim;
      } else {
        dw = Math.round((dw * maxDim) / dh);
        dh = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, dw, dh);
    return canvas;
  }

  function renderAiClock() {
    const clockEl = document.getElementById('aiLiveClock');
    const now = Math.min(Date.now(), aiClockExpiresAt);
    let seconds;
    if (localGameRunning) {
      seconds = Math.min(86400, localGameSeconds + Math.max(0, Math.floor((now - localGameSyncedAt) / 1000)));
    } else if (localDraftRunning) {
      seconds = Math.max(0, Math.ceil((localDraftEndAt - now) / 1000));
    }
    if (clockEl && seconds !== undefined) {
      const next = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      if (clockEl.textContent !== next) clockEl.textContent = next;
    }
    if (Date.now() >= aiClockExpiresAt) {
      const wasRunning = localGameRunning || localDraftRunning;
      stopClockTicker();
      const statusEl = document.getElementById('aiLiveStatus');
      if (wasRunning && statusEl) statusEl.textContent = 'AI updates delayed; clock held pending a fresh frame.';
    }
  }

  function startClockTicker() {
    renderAiClock();
    if (!aiClockTicker && (localGameRunning || localDraftRunning)) {
      aiClockTicker = setInterval(renderAiClock, 100);
    }
  }

  function stopClockTicker() {
    if (aiClockTicker) {
      clearInterval(aiClockTicker);
      aiClockTicker = null;
    }
    localGameRunning = false;
    localDraftRunning = false;
  }

  function renderAiHud(res, latencyMs = 0) {
    const container = document.getElementById('aiLiveDisplay');
    const badge = document.getElementById('aiLiveModeBadge');
    if (!container) return;

    const mode = res.mode || 'other';
    const modelUsed = res.model ? `${res.model}${res.speedTier === 'fast' ? ' Fast' : ''}${res.effort ? ' / ' + res.effort : ''}` : String(res.engine || '').match(/gemini-[a-z0-9.-]+/i)?.[0] || res.engine || 'AI Vision';
    const modeLabels = {
      draft: '★ LIVE DRAFT',
      game: '★ IN-GAME LIVE',
      result: '★ MATCH RESULT',
      other: '○ STANDBY / LOBBY'
    };
    const modeColors = {
      draft: { bg: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: 'rgba(139,92,246,0.4)' },
      game: { bg: 'rgba(16,185,129,0.2)', color: '#34d399', border: 'rgba(16,185,129,0.4)' },
      result: { bg: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: 'rgba(245,158,11,0.4)' },
      other: { bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)' }
    };
    const c = modeColors[mode] || modeColors.other;
    if (badge) {
      badge.textContent = modeLabels[mode] || mode.toUpperCase();
      badge.style.background = c.bg;
      badge.style.color = c.color;
      badge.style.border = '1px solid ' + c.border;
    }

    let bodyHtml = '';

    if (mode === 'draft') {
      const draft = res.data?.draft || res.data || {};
      const patch = res.patch || {};
      const blueBans = patch.blue?.bans || draft.blue?.bans || [];
      const redBans = patch.red?.bans || draft.red?.bans || [];
      const bluePicks = patch.blue?.players || draft.blue?.picks || [];
      const redPicks = patch.red?.players || draft.red?.picks || [];
      const phase = patch.phase || draft.phase || 'LIVE DRAFT';
      const timerSec = Number.isInteger(draft.timer) ? draft.timer : (patch.draftTimer?.remaining ?? 30);

      bodyHtml = `
        <div style="background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.25); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:10px; font-weight:700; color:#a78bfa; letter-spacing:1px; text-transform:uppercase;">${esc(phase)}</span>
              <strong style="display:block; font-size:14px; margin-top:2px;">Tournament Draft Mode</strong>
            </div>
            <div style="text-align:right;">
              <span style="font-size:10px; color:#94a3b8; display:block;">TIMER</span>
              <span id="aiLiveClock" style="font-size:22px; font-weight:800; color:var(--lime); font-variant-numeric:tabular-nums;">00:${String(timerSec).padStart(2,'0')}</span>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">
            <div>
              <span style="font-size:10px; font-weight:700; color:#60a5fa;">BLUE BANS</span>
              <div style="display:flex; gap:4px; margin-top:4px;">
                ${Array.from({length:5}, (_,i)=>{
                  const b = blueBans[i] || '';
                  const icon = heroIconUrl(b);
                  return icon ? `<img src="${esc(icon)}" title="${esc(b)}" style="width:26px; height:26px; border-radius:3px; border:1px solid rgba(59,130,246,0.4);" alt="${esc(b)}">` : `<div style="width:26px; height:26px; border-radius:3px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-size:9px; color:#64748b;">${b ? esc(b.slice(0,3)) : '-'}</div>`;
                }).join('')}
              </div>
            </div>
            <div>
              <span style="font-size:10px; font-weight:700; color:#f87171;">RED BANS</span>
              <div style="display:flex; gap:4px; margin-top:4px;">
                ${Array.from({length:5}, (_,i)=>{
                  const b = redBans[i] || '';
                  const icon = heroIconUrl(b);
                  return icon ? `<img src="${esc(icon)}" title="${esc(b)}" style="width:26px; height:26px; border-radius:3px; border:1px solid rgba(239,68,68,0.4);" alt="${esc(b)}">` : `<div style="width:26px; height:26px; border-radius:3px; background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-size:9px; color:#64748b;">${b ? esc(b.slice(0,3)) : '-'}</div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div style="background:rgba(59,130,246,0.04); border:1px solid rgba(59,130,246,0.2); border-radius:6px; padding:10px;">
            <strong style="font-size:12px; color:#60a5fa; display:block; margin-bottom:8px;">BLUE PICKS (5)</strong>
            ${Array.from({length:5}, (_,i)=>{
              const p = bluePicks[i] || {};
              const hero = p.hero || '';
              const icon = heroIconUrl(hero);
              const name = p.name || p.rawIgn || ('Player ' + (i+1));
              return `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:4px 6px; background:rgba(0,0,0,0.2); border-radius:4px;">
                  ${icon ? `<img src="${esc(icon)}" style="width:26px; height:26px; border-radius:4px; object-fit:cover;" alt="${esc(hero)}">` : `<div style="width:26px; height:26px; border-radius:4px; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:#60a5fa;">${i+1}</div>`}
                  <div style="flex:1; min-width:0; overflow:hidden;">
                    <strong style="display:block; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</strong>
                    <small style="font-size:9px; color:#94a3b8;">${esc(hero || 'Picking...')}</small>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="background:rgba(239,68,68,0.04); border:1px solid rgba(239,68,68,0.2); border-radius:6px; padding:10px;">
            <strong style="font-size:12px; color:#f87171; display:block; margin-bottom:8px;">RED PICKS (5)</strong>
            ${Array.from({length:5}, (_,i)=>{
              const p = redPicks[i] || {};
              const hero = p.hero || '';
              const icon = heroIconUrl(hero);
              const name = p.name || p.rawIgn || ('Player ' + (i+1));
              return `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:4px 6px; background:rgba(0,0,0,0.2); border-radius:4px;">
                  ${icon ? `<img src="${esc(icon)}" style="width:26px; height:26px; border-radius:4px; object-fit:cover;" alt="${esc(hero)}">` : `<div style="width:26px; height:26px; border-radius:4px; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:#f87171;">${i+1}</div>`}
                  <div style="flex:1; min-width:0; overflow:hidden;">
                    <strong style="display:block; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</strong>
                    <small style="font-size:9px; color:#94a3b8;">${esc(hero || 'Picking...')}</small>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (mode === 'game') {
      const g = res.data?.game || res.data || {};
      const patch = res.patch || {};
      const gameTime = patch.gameTime || g.gameTime || '00:00';
      const bKills = patch.blue?.kills ?? g.blue?.kills ?? 0;
      const rKills = patch.red?.kills ?? g.red?.kills ?? 0;
      const bGold = patch.blue?.gold ?? g.blue?.gold ?? 0;
      const rGold = patch.red?.gold ?? g.red?.gold ?? 0;
      const bTurrets = patch.blue?.turrets ?? g.blue?.turrets ?? 0;
      const rTurrets = patch.red?.turrets ?? g.red?.turrets ?? 0;
      const bPlayers = patch.blue?.players || g.blue?.players || [];
      const rPlayers = patch.red?.players || g.red?.players || [];

      const renderPlayerCard = (p, i, side) => {
        const isRed = side === 'red';
        const hero = p.hero || '';
        const hIcon = heroIconUrl(hero);
        const name = p.name || p.rawIgn || ('Player ' + (i+1));
        const kda = p.kda || '0/0/0';
        const level = p.level || '?';
        const gold = p.gold || 0;
        const items = Array.isArray(p.items) ? p.items : [];

        return `
          <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:6px 8px; margin-bottom:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                ${hIcon ? `<img src="${esc(hIcon)}" style="width:24px; height:24px; border-radius:4px; object-fit:cover;" alt="${esc(hero)}">` : `<div style="width:24px; height:24px; border-radius:4px; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold;">${p.role||(i+1)}</div>`}
                <div>
                  <strong style="font-size:11px; display:block; line-height:1.2; color:${isRed?'#fca5a5':'#93c5fd'};">${esc(name)}</strong>
                  <span style="font-size:9px; color:rgba(255,255,255,0.5);">${esc(hero || 'Unknown')}</span>
                </div>
              </div>
              <div style="text-align:right;">
                <span style="font-size:9px; font-weight:bold; padding:1px 4px; border-radius:3px; background:rgba(234,179,8,0.18); color:#fbbf24; border:1px solid rgba(234,179,8,0.3); margin-right:4px;">Lvl ${level}</span>
                <strong style="font-size:11px; letter-spacing:0.5px;">${esc(kda)}</strong>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px; border-top:1px solid rgba(255,255,255,0.04);">
              <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap;">
                ${items.map(it=>{
                  const icon = it?.icon || itemIconUrl(typeof it === 'string' ? it : it?.name);
                  const iname = typeof it === 'string' ? it : (it?.name || 'Unreadable slot');
                  return icon ? `<img src="${esc(icon)}" title="${esc(iname)}" alt="${esc(iname)}" style="width:18px; height:18px; border-radius:2px; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1);">` : `<span style="font-size:8px; padding:1px 3px; background:rgba(255,255,255,0.06); border-radius:2px; color:rgba(255,255,255,0.6);" title="${esc(iname)}">${esc(iname.slice(0,5))}</span>`;
                }).join('')}
                ${items.length === 0 ? `<span style="font-size:9px; color:rgba(255,255,255,0.55);">${p.itemsKnown ? 'Empty equipment slots' : 'Open the equipment table to read items'}</span>` : p.itemsVisible === false ? '<small>Last visible build</small>' : ''}
              </div>
              <span style="font-size:10px; color:#94a3b8; font-weight:600;">${gold ? gold.toLocaleString() + 'g' : ''}</span>
            </div>
          </div>
        `;
      };

      bodyHtml = `
        <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.25); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; text-align:center;">
            <div style="flex:1;">
              <strong style="font-size:22px; color:#60a5fa;">${bKills}</strong>
              <span style="display:block; font-size:10px; color:#93c5fd;">BLUE KILLS · ${bGold ? Math.round(bGold/100)/10 + 'k' : '0k'}</span>
              <small style="font-size:9px; color:#64748b;">${bTurrets} Turrets</small>
            </div>
            <div style="padding:0 14px;">
              <span id="aiLiveClock" style="font-size:26px; font-weight:800; color:var(--lime); font-variant-numeric:tabular-nums; display:block;">${esc(gameTime)}</span>
              <span style="font-size:9px; font-weight:700; color:#34d399; letter-spacing:1px;">LIVE SCOREBOARD</span>
            </div>
            <div style="flex:1;">
              <strong style="font-size:22px; color:#f87171;">${rKills}</strong>
              <span style="display:block; font-size:10px; color:#fca5a5;">RED KILLS · ${rGold ? Math.round(rGold/100)/10 + 'k' : '0k'}</span>
              <small style="font-size:9px; color:#64748b;">${rTurrets} Turrets</small>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <span style="font-size:11px; font-weight:700; color:#60a5fa; display:block; margin-bottom:6px;">BLUE ROSTER &amp; EQUIPMENT</span>
            ${Array.from({length:5}, (_,i)=>renderPlayerCard(bPlayers[i]||{}, i, 'blue')).join('')}
          </div>
          <div>
            <span style="font-size:11px; font-weight:700; color:#f87171; display:block; margin-bottom:6px;">RED ROSTER &amp; EQUIPMENT</span>
            ${Array.from({length:5}, (_,i)=>renderPlayerCard(rPlayers[i]||{}, i, 'red')).join('')}
          </div>
        </div>
      `;
    } else if (mode === 'result') {
      const resData = res.data?.result || res.data || {};
      const patch = res.patch || {};
      const winner = patch.winner || resData.winner || 'blue';
      const bKills = patch.blue?.kills ?? resData.blue?.kills ?? 0;
      const rKills = patch.red?.kills ?? resData.red?.kills ?? 0;
      const duration = patch.gameTime || resData.gameTime || '11:00';
      const mvp = patch.mvp || resData.mvp || {};

      bodyHtml = `
        <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:10px; font-weight:700; color:#fbbf24; letter-spacing:1px;">MATCH RESULT DETECTED</span>
              <strong style="font-size:16px; display:block; color:${winner==='red'?'#f87171':'#60a5fa'}; margin-top:2px;">
                ${winner.toUpperCase()} SIDE VICTORY (${duration})
              </strong>
            </div>
            <div style="text-align:right;">
              <span style="font-size:11px; font-weight:bold; color:var(--lime);">${bKills} - ${rKills}</span>
              ${mvp.name ? `<small style="display:block; font-size:10px; color:#fbbf24;">👑 MVP: ${esc(mvp.name)} (${esc(mvp.hero||'')})</small>` : ''}
            </div>
          </div>
          ${res.playoffs?.message ? `<div style="margin-top:8px; font-size:11px; color:#34d399; font-weight:600;">✓ ${esc(res.playoffs.message)}</div>` : ''}
        </div>
        <p class="hint" style="margin:4px 0 0 0;">Scoreboard data with 10 player items, levels and KDAs has been synchronized to postgame and broadcast overlays.</p>
      `;
    } else {
      bodyHtml = `
        <div style="text-align:center; padding:30px 16px; color:rgba(255,255,255,0.4);">
          <div style="font-size:20px; margin-bottom:6px;">📡</div>
          <strong style="color:#94a3b8;">Monitoring Game Screen</strong>
          <p style="font-size:11px; margin-top:4px;">Feed active. AI Vision is monitoring for Draft picks &amp; bans, In-Game spectator HUD, or Match Result screens.</p>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
        <small style="color:#94a3b8; font-size:11px;">
          ⚡ AI Latency: <strong style="color:#e2e8f0;">${latencyMs} ms</strong> · Model: <code style="color:#a78bfa;">${esc(modelUsed)}</code>
        </small>
        <span style="font-size:10px; color:${res.applied?'#34d399':'#94a3b8'}; font-weight:600;">
          ${res.applied ? '● Live broadcast synced' : '○ Review mode'}
        </span>
      </div>
      ${bodyHtml}
    `;

    const statusEl = document.getElementById('aiLiveStatus');
    if (statusEl) {
      statusEl.textContent = 'AI Vision update: ' + (modeLabels[mode] || mode) + ' · ' + latencyMs + ' ms latency · ' + new Date().toLocaleTimeString();
    }
  }

  async function aiPost(url, body, options = {}) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), ...options
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || response.statusText);
    return result;
  }

  async function ensureAiSession(ownEpoch) {
    if (aiSession) return aiSession;
    if (!aiSessionPromise) {
      const pending = aiPost('/api/detection/start', { source: 'ai' }).then(async result => {
        if (ownEpoch !== aiEpoch) {
          await aiPost('/api/detection/stop', { session: result.session });
          return null;
        }
        aiSession = result.session;
        return aiSession;
      }).finally(() => { if (aiSessionPromise === pending) aiSessionPromise = null; });
      aiSessionPromise = pending;
    }
    return aiSessionPromise;
  }

  function updateAiClock(res) {
    stopClockTicker();
    aiClockExpiresAt = res.clockExpiresAt;
    if (res.mode === 'game' && res.patch?.gameClock?.running) {
      localGameSeconds = res.patch.gameClock.seconds;
      localGameSyncedAt = res.patch.gameClock.syncedAt;
      localGameRunning = true;
    } else if (res.mode === 'draft' && res.patch?.draftTimer?.endAt != null) {
      localDraftEndAt = res.patch.draftTimer.endAt;
      localDraftRunning = true;
    }
    startClockTicker();
  }

  function renderLocalHud(res) {
    if (!res.patch) return;
    const previous = aiLastResult?.mode === res.mode ? aiLastResult : { mode: res.mode, patch: {} };
    const patch = { ...previous.patch, ...res.patch };
    for (const side of ['blue', 'red']) patch[side] = { ...previous.patch?.[side], ...res.patch[side] };
    aiLastResult = { ...previous, ...res, patch, engine: previous.engine || 'Local neural OCR' };
    renderAiHud(aiLastResult, aiLastLatency);
    updateAiClock(aiLastResult);
  }

  async function scanAi({ source: src, provider = 'codex', autoApply = true, switchScene = true, live = false, smoothClock = true }) {
    if (aiInFlight) return null;
    const controller = new AbortController(), ownEpoch = aiEpoch;
    const current = () => ownEpoch === aiEpoch && !controller.signal.aborted;
    aiInFlight = controller;
    try {
      await ensureAiSession(ownEpoch);
      if (!current() || !aiSession) return null;
      const started = performance.now(), sampledAt = Date.now();
      const canvas = normalizeSourceForAI(src);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
      const key = provider === 'gemini' && typeof localStorage !== 'undefined' ? localStorage.getItem('geminiApiKey') || '' : '';

      const res = await aiPost('/api/detection/ai-live', {
        image: dataUrl,
        provider,
        apiKey: key,
        mode: 'auto',
        realtime: aiLoopActive,
        session: aiSession,
        sampledAt,
        live: live && smoothClock,
        autoApply,
        switchScene
      }, { signal: controller.signal });
      if (!current()) return null;
      if (res.expired) {
        stopAiLoop();
        const statusEl = document.getElementById('aiLiveStatus');
        if (statusEl) statusEl.textContent = 'Another capture session took control. Restart AI detection here to resume.';
        return null;
      }
      if (res.stale) throw Error('AI frame expired before recognition finished');

      aiConsecutiveErrors = 0;
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      res.clientLatencyMs = latencyMs;
      aiLastResult = res; aiLastLatency = latencyMs;
      renderAiHud(res, latencyMs);
      updateAiClock(res);

      if (res.playoffs?.message) {
        if (typeof toast === 'function') toast(res.playoffs.message);
      }

      return res;
    } catch (err) {
      if (!current()) return null;
      aiConsecutiveErrors++;
      console.warn('AI Live Detection error:', err.message);
      const statusEl = document.getElementById('aiLiveStatus');
      if (statusEl) {
        statusEl.textContent = 'AI Vision notice: ' + err.message + ' (retrying in next cycle)';
      }
      throw err;
    } finally {
      if (aiInFlight === controller) aiInFlight = null;
    }
  }

  function startAiLoop({ getSource, getPool, provider = 'codex', autoApply = true, switchScene = true, smoothClock = true, live = true, interval = 1000 }) {
    if (aiLoopActive) return;
    stopAiLoop();
    aiLoopActive = true;
    aiConsecutiveErrors = 0;
    const ownEpoch = aiEpoch, current = () => aiLoopActive && ownEpoch === aiEpoch;
    const cadence = Number.isFinite(interval) ? Math.max(250, interval) : 1000;
    const option = value => typeof value === 'function' ? value() : value;
    const schedule = delay => { if (current()) { if (aiScheduler) aiScheduler.schedule(delay); else aiLoopTimer = setTimeout(runCycle, delay); } };

    const runCycle = async () => {
      if (!current()) return;
      aiLoopTimer = null;
      const started = performance.now();
      try {
        const src = typeof getSource === 'function' ? getSource() : null;
        if (!src) {
          renderAiClock();
          stopClockTicker();
          if (aiSession) await aiPost('/api/detection/hold', { session: aiSession });
          if (!current()) return;
          const statusEl = document.getElementById('aiLiveStatus');
          if (statusEl) statusEl.textContent = 'Waiting for live capture stream or window…';
          schedule(250);
          return;
        }
        await scanAi({ source: src, provider: option(provider), autoApply: option(autoApply), switchScene: option(switchScene), smoothClock: option(smoothClock), live: option(live) });
        // Measure start-to-start: recognition time is part of the cadence.
        schedule(Math.max(0, cadence - (performance.now() - started)));
      } catch (err) {
        const backoff = Math.min(12000, 3000 * Math.pow(1.5, aiConsecutiveErrors));
        schedule(backoff);
      }
    };

    if (OCRRuntime.scheduler) aiScheduler = OCRRuntime.scheduler(runCycle);
    if (getPool && typeof NeuralHud !== 'undefined') {
      ensureAiSession(ownEpoch).then(session => {
        if (!current() || !session) return;
        aiHud = NeuralHud.start({ getSource, getPool, session, current, read, regions, post: aiPost,
          options: () => ({ autoApply: option(autoApply), switchScene: option(switchScene), live: option(live),
            smoothClock: option(smoothClock), confidence: Number(document.getElementById('confidence')?.value || 80),
            confirm: Math.max(1, Number(document.getElementById('ocrStability')?.value || 2)) }),
          onMode: () => {}, onUpdate: renderLocalHud });
      }).catch(error => { if (current()) console.warn('HUD AI startup:', error.message); });
    }
    runCycle();
  }

  function stopAiLoop() {
    aiLoopActive = false;
    aiEpoch++;
    aiHud?.stop(); aiHud = null;
    aiScheduler?.close(); aiScheduler = null;
    aiSessionPromise = null; aiLastResult = null; aiLastLatency = 0;
    aiInFlight?.abort();
    aiInFlight = null;
    const oldSession = aiSession;
    aiSession = null;
    if (oldSession) aiPost('/api/detection/stop', { session: oldSession }, { keepalive: true }).catch(() => {});
    if (aiLoopTimer) {
      clearTimeout(aiLoopTimer);
      aiLoopTimer = null;
    }
    renderAiClock();
    stopClockTicker();
    const button = document.getElementById('aiLiveLoopBtn');
    const providerSelect = document.getElementById('aiProvider');
    if (providerSelect) providerSelect.disabled = false;
    if (button) {
      button.textContent = '⚡ Start Realtime AI Live Detection';
      button.style.background = '#8b5cf6';
      button.style.borderColor = '#8b5cf6';
    }
    const statusEl = document.getElementById('aiLiveStatus');
    if (statusEl) statusEl.textContent = 'Realtime AI Detection stopped.';
  }

  function isAiLoopRunning() {
    return aiLoopActive;
  }

  return {regions,scan,stop,reset,apply,hold,learn,grab,idle:()=>detailJob||Promise.resolve(),scanAi,startAiLoop,stopAiLoop,isAiLoopRunning,renderAiHud,normalizeSourceForAI,heroIconUrl,itemIconUrl};

})();
