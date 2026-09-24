window.LiveDetection=(()=>{
  const Model=LiveDetectionModel,gate=Model.sceneGate(2),stable=OCRRuntime.stability();
  const hudFields=new Set(['resultStatus','gameTime','blue.kills','red.kills','draftPhase','draftTimer.remaining']);
  let session=null,lastMode=null,lastVisualMode=null,rowIndex=0,epoch=0,lastSeenAt=0;
  let lastClock=null,detailJob=null,hudMs=0,detailMs=0,detailError='';
  const values=new Map(),queries=new Map(),highWater=new Map(),identities=new Map(),goldAt=new Map();
  let catalog=[],lastAccepted=[],lastAcceptedAt=0,learningQuery=null;
  fetch('/assets/catalog.json').then(r=>r.json()).then(c=>catalog=c.heroes).catch(()=>{});
  function regions(mode){try{const saved=JSON.parse(localStorage.getItem('liveRegions:'+mode)||'null');if(mode==='game'&&JSON.stringify(saved)===JSON.stringify(Model.legacyGame))return structuredClone(Model.profiles.game);return Model.validateRegions(saved,mode);}catch{return structuredClone(Model.profiles[mode]);}}
  function reset(){epoch++;gate.reset();stable.clear();values.clear();queries.clear();highWater.clear();identities.clear();goldAt.clear();detailJob=null;lastMode=null;lastVisualMode=null;rowIndex=0;lastClock=null;lastSeenAt=0;lastAccepted=[];lastAcceptedAt=0;learningQuery=null;detailError='';}
  async function start(current){
    reset();HeroRecognition.clearReferences();const d=await api('/api/detection/start',{});
    if(!current()){await api('/api/detection/stop',{session:d.session});return;}
    session=d.session;
  }
  function stop(){const old=session;session=null;reset();if(old)api('/api/detection/stop',{session:old}).catch(()=>{});if($('#detectStatus'))$('#detectStatus').textContent='Auto-detection stopped';}
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
  async function read(worker,r,frame,min,current){
    const kind=r.field==='draftPhase'?'text':r.field==='draftTimer.remaining'?'clock':OCRModel.kind(r.field),parse=data=>r.field==='draftPhase'?Model.draftPhase(data.text):r.field==='draftTimer.remaining'?Model.draftClock(data.text):r.field==='resultStatus'?(Model.resultOutcome(data.text)?data.text.trim():null):OCRModel.parse(data.text,r.field);
    const whitelist=['resultStatus','draftPhase'].includes(r.field)?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ':r.field.endsWith('.name')?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[] _-.':kind==='text'?'':kind==='kda'?'0123456789/ ':kind==='clock'?'0123456789Oo:':r.field.endsWith('gold')?'0123456789Oo.kK':'0123456789Oo';
    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:whitelist});
    if(!current())return null;
    const prepared=crop(r,frame,true).canvas;let {data}=await worker.recognize(prepared);if(!current())return null;
    const poor=()=>data.confidence<min||parse(data)===null;
    const consider=next=>{if(parse(next)!==null&&(parse(data)===null||next.confidence>data.confidence))data=next;};
    if(poor()){const retry=await worker.recognize(crop(r,frame).canvas);if(!current())return null;consider(retry.data);}
    if(poor()&&kind!=='text'){
      const ctx=prepared.getContext('2d'),pixels=ctx.getImageData(0,0,prepared.width,prepared.height);
      for(let i=0;i<pixels.data.length;i+=4){const n=pixels.data[i]<190?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n;}ctx.putImageData(pixels,0,0);
      const retry=await worker.recognize(prepared);if(!current())return null;consider(retry.data);
    }
    if(poor()&&kind==='number'&&!r.field.endsWith('gold')){
      await worker.setParameters({tessedit_pageseg_mode:'10'});const retry=await worker.recognize(crop(r,frame).canvas);if(!current())return null;consider(retry.data);
    }
    if(poor()&&r.field==='draftTimer.remaining'){
      await worker.setParameters({tessedit_pageseg_mode:'10'});const retry=await worker.recognize(crop(r,frame,true).canvas);if(!current())return null;consider(retry.data);
    }
    if(poor()&&kind==='kda'){
      await worker.setParameters({tessedit_pageseg_mode:'6'});const retry=await worker.recognize(crop(r,frame).canvas);if(!current())return null;consider(retry.data);
    }
    if(poor()&&(kind==='kda'||r.field.endsWith('.level'))){
      await worker.setParameters({tessedit_pageseg_mode:'13'});const retry=await worker.recognize(crop(r,frame,true).canvas);if(!current())return null;consider(retry.data);
    }
    return {field:r.field,value:parse(data),confidence:data.confidence,text:data.text.trim()};
  }
  function accept(result,min,continuous,sampledAt){
    const {field,value,confidence}=result,clock=field==='gameTime'||field==='draftTimer.remaining';
    const confirmed=stable.observe(field,value!==null&&confidence>=min?value:null,continuous&&!clock?Math.max(2,Number($('#ocrStability').value)):1);
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
  }
  async function details({pool,frame,sampledAt,continuous,current,ownSession,mode,layout,min}){
    const started=performance.now(),row=rowIndex++%5;
    // Scoreboard statistics run separately so they never delay clock and kills.
    const batch=layout.filter(r=>!hudFields.has(r.field)&&(mode==='game'?!r.field.includes('.players.'):mode==='result'?!r.field.includes('.players.')||Number(r.field.split('.')[2])===row:!r.field.endsWith('.name')||$('#detectDraftNames').checked));
    const readings=[];
    await OCRRuntime.parallel(batch.filter(r=>!Model.isHero(r.field)),pool,async(worker,r)=>{const result=await read(worker,r,frame,min,current);if(result)readings.push(result);},current);
    if(!current())return;
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
      const confirmed=stable.observe(r.field,r.value,continuous?2:1);values.set(r.field,{...r,at:sampledAt,confidence:r.similarity,accepted:confirmed,reason:r.value&&!confirmed?'Confirming':r.reason});
    }
    for(const result of readings)accept(result,min,continuous,sampledAt);
    paint();
    await deliver(batch,{ownSession,mode,sampledAt,live:false,current,switchScene:false});
    if(current()){detailMs=Math.round(performance.now()-started);health();}
  }
  async function scan({pool,frame,sampledAt,live,current,continuous}){
    frame=DraftCapture.normalize(frame);
    if(!session){await start(current);if(!current())return;}
    const ownSession=session,started=performance.now(),min=Number($('#confidence').value),probes=[];
    const gr=regions('game'),rr=regions('result'),dr=regions('draft');
    // Check the explicit draft heading first; it also prevents a draft countdown
    // from being mistaken for the gameplay clock.
    const phase=dr.find(r=>r.field==='draftPhase'),draftProbe=phase?await read(pool[0],phase,frame,min,current):null;
    if(draftProbe?.value)probes.push(draftProbe);
    const probeRegions=draftProbe?.value?[dr.find(r=>r.field==='draftTimer.remaining')]:[rr.find(r=>r.field==='resultStatus'),...['gameTime','blue.kills','red.kills'].map(f=>gr.find(r=>r.field===f))];
    // Reserve one OCR worker for fresh clock and score readings.
    for(const r of probeRegions.filter(Boolean)){const result=await read(pool[0],r,frame,min,current);if(result)probes.push(result);if(!current())return;}
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
    status((mode==='result'?'Match result detected':mode==='draft'?'Draft detected':'In-game scoreboard detected')+' · '+lastAccepted.length+' readings'+($('#ocrAutoApply').checked?' · Live':' · Review mode'));
    $('#ocrStatus').textContent=detailError||(mode==='draft'?'Reading the draft phase, timer, five picks and five bans per side. Covered or uncertain portraits stay pending.':'Clock, kills, team gold and towers update continuously. In-game output uses only the top scoreboard.');
    if(!continuous&&detailJob)await detailJob;
    if(!valid())return;
    if(!detailJob){
      const work=details({pool:pool.slice(1),frame,sampledAt,continuous,current:valid,ownSession,mode,layout,min});
      const tracked=work.catch(e=>{if(valid()){detailError='Statistics detection: '+e.message;$('#ocrStatus').textContent=detailError;}}).finally(()=>{if(detailJob===tracked)detailJob=null;});
      detailJob=tracked;
    }
    if(!continuous)await detailJob;
  }
  async function apply(){if(!session||!lastMode)throw Error('Detect a frame first');const readings=Date.now()-lastAcceptedAt<5000?lastAccepted:[];if(!readings.length)throw Error('Readings expired; scan again');await api('/api/detection',{session,mode:lastMode,readings,sampledAt:Date.now(),live:false,switchScene:$('#detectSwitchScene').checked});}
  function grab(){learningQuery=queries.get($('#learnSlot').value);if(learningQuery)$('#learnPreview').src=learningQuery.thumbnail;}
  async function learn(){const q=learningQuery,hero=$('#learnHero').value;if(!q||!hero)throw Error('Capture a portrait and choose its hero');await HeroRecognition.learn(q,hero);stable.clear();toast('Portrait sample saved. Matching continues on the live feed.');}
  return {regions,scan,stop,reset,apply,learn,grab,idle:()=>detailJob||Promise.resolve()};
})();
