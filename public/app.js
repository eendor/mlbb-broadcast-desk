const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let state,parsedPatch=null,pollBusy=false,scheduleDirty=false,organizationLogos=[];let saveQueue=Promise.resolve(),activeSyncSource=null;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const at=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);function patchAt(p,v){const a=p.split('.'),o={};let t=o;a.forEach((k,i)=>{if(i===a.length-1)t[k]=v;else t=t[k]={};});return o;}let toastTimer;function toast(message,error=false){$('#toast').textContent=message;$('#toast').className=error?'error':'';$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',6000);}async function api(url,body){const r=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||r.statusText);return d;}function save(p){const task=saveQueue.catch(()=>{}).then(async()=>{state=await api('/api/state',p);return state;});saveQueue=task;return task;}function run(fn){return async(...args)=>{try{await fn(...args);}catch(e){toast(e.message,true);}};}
const scenes=[['playoffs','Playoffs bracket','Quarterfinals, semifinals & final'],['draft','Draft arena','Picks, bans & player lineup'],['scoreboard','In-game HUD','Score, gold & objectives'],['countdown','Starting soon','Full-screen standby clock'],['postgame','Match result','Winner & player statistics'],['mvp','Game MVP','Player spotlight & build'],['schedule','Match schedule','Your upcoming fixtures'],['intermission','Intermission','Break timer & partner strip'],['sponsors','Sponsored by','Full-screen partner showcase'],['ads','Ad break','Images, video & playlist rotation'],['players','Player stat rails','Names, heroes, levels, KDA & gold']];
$('#scenes').innerHTML=scenes.map(([id,name,sub],i)=>`<button data-scene="${id}"><b>${String(i+1).padStart(2,'0')}</b><span>${name}<small>${sub}</small></span></button>`).join('');$$('[data-scene]').forEach(b=>b.onclick=run(()=>save({scene:b.dataset.scene})));
$$('nav button').forEach(b=>b.onclick=()=>{$$('nav button,.tab').forEach(e=>e.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active');$('#pageTitle').innerHTML=esc(b.textContent.slice(3).trim())+'<span>.</span>';});
function teamHTML(side){return `<article class="panel teamhead ${side}"><div class="panelhead"><h2>${side.toUpperCase()} SIDE</h2><span>5 PICKS / 5 BANS</span></div><div class="fields"><label>Team name<input data-path="${side}.name"></label><label>Short tag<input data-path="${side}.tag" maxlength="8"></label></div><label>Team logo<select data-path="${side}.logo" class="logoSelect"><option value="">Team initials</option></select></label><div class="fields">${['score','kills','gold','turrets','lord','turtle'].map(k=>`<label>${k}<input type="number" min="0" data-path="${side}.${k}"></label>`).join('')}</div><h3>Starting five</h3>${['EXP','JUNGLE','MID','GOLD','ROAM'].map((r,i)=>`<div class="playerrow"><span>${r}</span><input aria-label="${side} player ${i+1}" data-player="${side}.${i}.name" placeholder="Player name"><input aria-label="${side} hero ${i+1}" data-player="${side}.${i}.hero" list="heroes" placeholder="Hero"><input aria-label="${side} KDA ${i+1}" data-player="${side}.${i}.kda" placeholder="K/D/A"><input aria-label="${side} gold ${i+1}" type="number" min="0" data-player="${side}.${i}.gold" placeholder="Gold"><input aria-label="${side} level ${i+1}" type="number" min="0" max="15" data-player="${side}.${i}.level" placeholder="Level"></div>`).join('')}<h3>Banned heroes</h3><div class="bans">${[0,1,2,3,4].map(i=>`<input aria-label="${side} ban ${i+1}" data-ban="${side}.${i}" list="heroes" placeholder="Ban ${i+1}">`).join('')}</div></article>`;}
$('#teamEditors').innerHTML=teamHTML('blue')+teamHTML('red');
$$('[data-path]').forEach(el=>el.onchange=run(()=>el.dataset.path==='bestOf'?save({bestOf:Number(el.value),game:Math.min(state.game,Number(el.value))}):save(patchAt(el.dataset.path,el.type==='number'?Number(el.value):el.value))));$$('[data-player]').forEach(el=>el.onchange=run(()=>{const [side,i,k]=el.dataset.player.split('.'),players=structuredClone(state[side].players);players[i][k]=['gold','level'].includes(k)?Number(el.value):el.value;return save({[side]:{players}});}));$$('[data-ban]').forEach(el=>el.onchange=run(()=>{const [side,i]=el.dataset.ban.split('.'),bans=Array.from({length:5},(_,i)=>state[side].bans[i]||'');bans[i]=el.value;return save({[side]:{bans}});}));
function render(s){state=s;$('#eventSummary').textContent=s.event;$('#formatSummary').textContent=`BO${s.bestOf} / GAME ${s.game}`;$('#sceneSummary').textContent=(s.visible?'':'HIDDEN / ')+(scenes.find(x=>x[0]===s.scene)?.[1]||'Swiss archive');$('#toggleOutput').textContent=s.visible?'Hide output':'Show output';$$('[data-scene]').forEach(e=>e.classList.toggle('selected',e.dataset.scene===s.scene));$$('[data-path]').forEach(el=>{if(el!==document.activeElement)el.value=at(s,el.dataset.path);});$$('[data-player]').forEach(el=>{const [side,i,k]=el.dataset.player.split('.');if(el!==document.activeElement)el.value=s[side].players[i][k];});$$('[data-ban]').forEach(el=>{const [side,i]=el.dataset.ban.split('.'),off=Number(i)>=DraftFormat.banCount(s);if(el!==document.activeElement)el.value=s[side].bans[i]||'';el.hidden=off;const picker=el.nextElementSibling;if(picker?.classList.contains('hero-choice'))picker.hidden=off;});$$('.teamhead .panelhead>span').forEach(el=>el.textContent=`5 PICKS / ${DraftFormat.banCount(s)} BANS`);$('#scoreControls').innerHTML=['blue','red'].map(side=>`<div class="scoreline ${side}"><span class="badge">${esc(s[side].tag)}</span><strong>${esc(s[side].name)}</strong><button aria-label="Decrease ${side} series score" data-score="${side}" data-delta="-1">Ã¢Ë†â€™</button><b>${s[side].score}</b><button aria-label="Increase ${side} series score" data-score="${side}" data-delta="1">+</button></div>`).join('');$$('[data-score]').forEach(b=>b.onclick=run(()=>save({[b.dataset.score]:{score:Math.max(0,state[b.dataset.score].score+Number(b.dataset.delta))}})));if(!scheduleDirty&&!$('#scheduleRows').contains(document.activeElement))renderSchedule(s.schedule);}
$('#toggleOutput').onclick=run(()=>save({visible:!state.visible}));$('#swap').onclick=run(()=>save({blue:state.red,red:state.blue,winner:state.winner==='blue'?'red':'blue'}));$$('[data-timer]').forEach(b=>b.onclick=run(()=>api('/api/timer',{timer:b.dataset.timer,action:b.dataset.action,seconds:Number($(b.dataset.timer==='countdown'?'#countdownSeconds':'#draftSeconds').value)})));
function clockText(t){if(!t)return '00:00';if(t.running!==undefined&&t.seconds!==undefined){let n=t.running?Math.min(86400,t.seconds+Math.max(0,Math.floor((Date.now()-(t.syncedAt||Date.now()))/1000))):t.seconds;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}let n=Math.ceil(t.endAt===null?t.remaining:Math.max(0,(t.endAt-Date.now())/1000));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}setInterval(()=>{if(state)$$('[data-clock]').forEach(e=>e.textContent=clockText(state[e.dataset.clock]));},200);
const events=new EventSource('/api/events');events.onmessage=e=>{render(JSON.parse(e.data));$('#connection').textContent='Engine connected / live sync';$('#connection').classList.remove('offline');};events.onerror=()=>{$('#connection').textContent='Disconnected ? reconnecting';$('#connection').classList.add('offline');};
Promise.all([api('/assets/catalog.json'),api('/assets/match-team-logos.json')]).then(([c,matchLogos])=>{organizationLogos=[...(c.logos||[]),...Object.entries(matchLogos).filter(([n])=>!(c.logos||[]).some(l=>l.name.trim().toUpperCase()===n.trim().toUpperCase())).map(([name,url])=>({name,url}))];$('#heroes').innerHTML=c.heroes.map(h=>'<option value="'+esc(h.name)+'">').join('');$$('.logoSelect').forEach(s=>{s.innerHTML+='<optgroup label="Qualified tournament teams">'+Object.entries(matchLogos).filter(([name])=>(state?.swiss?.teams||[]).some(t=>t.status==="qualified"&&t.name.trim().toUpperCase()===name.trim().toUpperCase())).map(([name,url])=>'<option value="'+esc(url)+'">'+esc(name)+'</option>').join('')+'</optgroup><optgroup label="Other organization logos">'+c.logos.map(l=>'<option value="'+esc(l.url)+'">'+esc(l.name)+'</option>').join('')+'</optgroup>';if(state)s.value=at(state,s.dataset.path);});if(state&&!scheduleDirty)renderSchedule(state.schedule);}).catch(e=>toast(e.message,true));
function mappings(){const v=JSON.parse($('#mapping').value);if(!v||Array.isArray(v)||typeof v!=='object')throw Error('Mappings must be a JSON object');localStorage.setItem('mapping',JSON.stringify(v));return v;}$('#mapping').value=localStorage.getItem('mapping')||'{}';$('#matchId').value=localStorage.getItem('matchId')||'';
let parsedMatchId='';
function showParsed(d){
  parsedMatchId=d?.matchId||'';
  parsedPatch=d?.patch??null;
  $('#applyParsed').disabled=!parsedPatch;
  $('#parsed').textContent=JSON.stringify(d,null,2);
  $('#parserStatus').textContent=parsedPatch?'READY TO APPLY':'CHECK RESPONSE';
  const rev=$('#matchObjectivesReview');
  if(rev){
    if(parsedPatch){
      rev.style.display='block';
      const bName=parsedPatch.blue?.tag||parsedPatch.blue?.name||state?.blue?.tag||state?.blue?.name||'BLUE SIDE';
      const rName=parsedPatch.red?.tag||parsedPatch.red?.name||state?.red?.tag||state?.red?.name||'RED SIDE';
      const winLabel=parsedPatch.winner==='blue'?' [WINNER]':parsedPatch.winner==='red'?'':'';
      const winLabelR=parsedPatch.winner==='red'?' [WINNER]':'';
      $('#objReviewBlueTeam').textContent=`BLUE SIDE · ${bName.toUpperCase()}${winLabel}`;
      $('#objReviewRedTeam').textContent=`RED SIDE · ${rName.toUpperCase()}${winLabelR}`;
      $('#reviewBlueTurrets').value=parsedPatch.blue?.turrets??state?.blue?.turrets??0;
      $('#reviewBlueLord').value=parsedPatch.blue?.lord??state?.blue?.lord??0;
      $('#reviewBlueTurtle').value=parsedPatch.blue?.turtle??state?.blue?.turtle??0;
      $('#reviewRedTurrets').value=parsedPatch.red?.turrets??state?.red?.turrets??0;
      $('#reviewRedLord').value=parsedPatch.red?.lord??state?.red?.lord??0;
      $('#reviewRedTurtle').value=parsedPatch.red?.turtle??state?.red?.turtle??0;
      const mvpBadge=$('#objReviewMvpBadge');
      if(mvpBadge){
        mvpBadge.textContent=parsedPatch.mvp?.name?`🏆 Game MVP: ${parsedPatch.mvp.name} (${parsedPatch.mvp.player?.split('.')[0]?.toUpperCase()}) · KDA ${parsedPatch.mvp.kda||''}`:'';
      }
    }else{
      rev.style.display='none';
    }
  }
}
function swapParsedSides(){
  if(!parsedPatch)return;
  const temp=parsedPatch.blue;
  parsedPatch.blue=parsedPatch.red;
  parsedPatch.red=temp;
  if(parsedPatch.winner==='blue')parsedPatch.winner='red';
  else if(parsedPatch.winner==='red')parsedPatch.winner='blue';
  if(parsedPatch.mvp&&typeof parsedPatch.mvp==='object'){
    const [side,slot]=String(parsedPatch.mvp.player||'').split('.');
    const nextSide=side==='blue'?'red':(side==='red'?'blue':side);
    parsedPatch.mvp.player=`${nextSide}.${slot||0}`;
  }
  showParsed({patch:parsedPatch,matchId:parsedMatchId});
  toast(`Sides swapped: ${parsedPatch.blue?.tag||'Blue'} ⇄ ${parsedPatch.red?.tag||'Red'}`);
}
$('#swapParsedSides')?.addEventListener('click',()=>swapParsedSides());
async function fetchMatch(){if(pollBusy)return;pollBusy=true;showParsed(null);try{localStorage.setItem('matchId',$('#matchId').value);const d=await api('/api/match/fetch',{matchId:$('#matchId').value,mapping:mappings()});$('#raw').value=JSON.stringify(d.raw,null,2);showParsed(d.parsed?{...d.parsed,matchId:$('#matchId').value.trim()}:{error:d.error});if(d.error)throw Error(d.error);toast('Post-match result parsed. Review and apply it.');}finally{pollBusy=false;}}
$('#fetchMatch').onclick=run(()=>fetchMatch());$('#parseJson').onclick=run(async()=>{showParsed(null);showParsed(await api('/api/match/parse',{raw:JSON.parse($('#raw').value),mapping:mappings()}));});$('#applyParsed').onclick=run(async()=>{
  if(!parsedPatch)return;
  const objectives={blue:{},red:{}};
  for(const side of ['blue','red'])for(const [key,suffix] of [['turrets','Turrets'],['lord','Lord'],['turtle','Turtle']]){
    const input=$('#review'+(side==='blue'?'Blue':'Red')+suffix);
    if(input)objectives[side][key]=Math.max(0,parseInt(input.value||'0',10));
  }
  for(const side of ['blue','red'])for(const key of ['turrets','lord','turtle']){
    parsedPatch[side]??={};
    parsedPatch[side][key]=objectives[side][key];
  }
  const result=await api('/api/match/apply',{patch:parsedPatch,raw:JSON.parse($('#raw').value),mapping:mappings(),matchId:parsedMatchId,objectives,mvp:parsedPatch.mvp});
  $('#sourceSummary').textContent='Post-match result · '+new Date().toLocaleTimeString();
  toast('Post-match result applied. '+(result.playoffs?.message||''));
});$('#raw').oninput=()=>showParsed(null);$('#mapping').oninput=()=>showParsed(null);
// AI Vision Key Configuration & Scoreboard Handlers
(async()=>{
  const keyInp=$('#geminiApiKey'),statusEl=$('#aiKeyStatus');
  if(keyInp&&statusEl){
    const savedLocal=localStorage.getItem('geminiApiKey')||'';
    if(savedLocal)keyInp.value=savedLocal;
    try{
      const cfg=await api('/api/ai/config');
      if(cfg.hasKey){
        statusEl.textContent='● Key Active ('+(cfg.masked||'configured')+')';
        statusEl.style.color='#34d399';
        if(!keyInp.value&&cfg.masked)keyInp.placeholder='Saved on server: '+cfg.masked;
      }else if(!savedLocal){
        statusEl.textContent='○ No Gemini key set';
        statusEl.style.color='#94a3b8';
      }
    }catch{}
  }
  $('#saveAiKey')?.addEventListener('click',run(async()=>{
    const val=$('#geminiApiKey').value.trim();
    localStorage.setItem('geminiApiKey',val);
    await api('/api/ai/config',{geminiApiKey:val});
    toast(val?'Gemini Vision AI key saved!':'Gemini key cleared. Codex and local OCR remain available.');
    if(statusEl){
      statusEl.textContent=val?'● Key Active':'○ No Gemini key set';
      statusEl.style.color=val?'#34d399':'#94a3b8';
    }
  }));
  $('#toggleAiKeyVisible')?.addEventListener('click',()=>{
    if(keyInp)keyInp.type=keyInp.type==='password'?'text':'password';
  });
})();

$('#postgameAiScan')?.addEventListener('click',run(async()=>{
  if(typeof PostgameOCR==='undefined')throw Error('Scoreboard analyzer loading...');
  // Cloud AI is a manual screenshot tool. It is intentionally routed to the
  // isolated /api/ai/analyze endpoint, never the live detection session.
  const video=$('#captureVideo'),canvas=$('#captureCanvas');
  const shared=await getSharedCapture();
  const source=shared||((video&&video.readyState>=2&&!video.paused)?video:(canvas&&canvas.width>100)?canvas:null);
  if(!source)throw Error('Start Live Game Capture first or upload a screenshot, then run Cloud AI analysis.');
  await PostgameOCR.scanWithCloud(source,{mode:'result'});
}));
async function clipboardScreenshot(){
  if(!navigator.clipboard?.read)return null;
  try{
    for(const item of await navigator.clipboard.read()){
      const type=item.types.find(value=>value.startsWith('image/'));
      if(type)return await item.getType(type);
    }
  }catch{}
  return null;
}
async function getSharedCapture(){
  try{const {image}=await api('/api/capture/latest');const response=await fetch(image);return await createImageBitmap(await response.blob());}catch{return null;}
}
$('#postgameCaptureLive')?.addEventListener('click',run(async()=>{
  if(typeof PostgameOCR==='undefined')throw Error('Scoreboard analyzer loading...');
  const clipboardImage=await clipboardScreenshot();
  if(clipboardImage){toast('Analyzing the screenshot copied to clipboard with the selected AI provider.');await PostgameOCR.handleFile(clipboardImage,{ai:true});return;}
  const shared=await getSharedCapture();
  if(shared){toast('Analyzing the live capture from the broadcast PC.');await PostgameOCR.scanWithCloud(shared,{mode:'result'});shared.close?.();return;}
  const video=$('#captureVideo'),canvas=$('#captureCanvas');
  let canvasHasFrame=false;
  try{canvasHasFrame=!!canvas&&canvas.width>100&&canvas.height>100&&canvas.getContext('2d').getImageData(0,0,1,1).data[3]>0;}catch{}
  const source=(video&&video.readyState>=2&&!video.paused)?video:canvasHasFrame?canvas:null;
  if(!source)throw Error('Start Live Game Capture first, then run the AI scoreboard scan.');
  await PostgameOCR.scanWithCloud(source,{mode:'result'});
}));
$('#postgameUploadFile')?.addEventListener('change',run(async(e)=>{
  const file=e.target.files?.[0];
  if(!file)return;
  if(typeof PostgameOCR==='undefined')throw Error('Scoreboard analyzer loading...');
  await PostgameOCR.handleFile(file,{ai:true});
}));
api('/api/lan').then(({urls=[]})=>{const el=$('#postgameLanControl');if(el)el.textContent=urls.length?`PC-hosted AI/control · open ${urls.join('  or  ')} on laptops on this Wi-Fi`:'PC-hosted AI/control · connect this PC to a private Wi-Fi network to show its laptop URL.';}).catch(()=>{});



const hostCaptureStatus=document.createElement('p');hostCaptureStatus.id='hostCaptureStatus';hostCaptureStatus.className='hint';hostCaptureStatus.setAttribute('role','status');hostCaptureStatus.style.cssText='margin:0 0 10px;color:#f59e0b;';hostCaptureStatus.textContent='Host capture: waiting for the broadcast PC.';$('#postgameLanControl')?.after(hostCaptureStatus);
async function refreshHostCaptureStatus(){try{const {available,ageMs}=await api('/api/capture/status');hostCaptureStatus.textContent=available?`Host capture: LIVE · frame ${Math.round(ageMs)} ms old`:'Host capture: waiting. Start Live Game Capture on the broadcast PC.';hostCaptureStatus.style.color=available?'#34d399':'#f59e0b';}catch{hostCaptureStatus.textContent='Host capture: status unavailable.';hostCaptureStatus.style.color='#f87171';}}
refreshHostCaptureStatus();setInterval(refreshHostCaptureStatus,1500);
// Put the PC's shared live game feed beneath the transparent Program overlay.
const programPreview=document.querySelector('.preview'),programFrame=programPreview?.querySelector('iframe');
let programFeed=null,lastProgramFrameAt=0,programFrameBusy=false;
if(programPreview&&programFrame){
  programFeed=document.createElement('img');programFeed.className='program-live-feed';programFeed.alt='Live capture from broadcast PC';
  Object.assign(programFeed.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'contain',zIndex:'0',display:'none'});
  Object.assign(programFrame.style,{position:'relative',zIndex:'1',background:'transparent'});programPreview.insertBefore(programFeed,programFrame);
}
async function refreshProgramCapture(){
  if(!programFeed||programFrameBusy||!$('#desk')?.classList.contains('active'))return;
  programFrameBusy=true;
  try{const frame=await api('/api/capture/latest');if(frame.capturedAt!==lastProgramFrameAt){programFeed.src=frame.image;lastProgramFrameAt=frame.capturedAt;}programFeed.style.display='block';}
  catch{programFeed.style.display='none';lastProgramFrameAt=0;}
  finally{programFrameBusy=false;}
}
refreshProgramCapture();setInterval(refreshProgramCapture,700);

function renderSchedule(rows){const options=v=>'<option value="">Auto-match logo by team name</option>'+organizationLogos.map(l=>'<option value="'+esc(l.url)+'"'+(v===l.url?' selected':'')+'>'+esc(l.name)+'</option>').join('');$('#scheduleRows').innerHTML=rows.map((r,i)=>'<div class="scheduleRow"><div class="fields">'+['time','blue','red','note'].map(k=>'<label>'+k+'<input data-schedule="'+i+'.'+k+'" value="'+esc(r[k])+'"></label>').join('')+'<label>Blue logo<select data-schedule="'+i+'.blueLogo">'+options(r.blueLogo||'')+'</select></label><label>Red logo<select data-schedule="'+i+'.redLogo">'+options(r.redLogo||'')+'</select></label><button data-remove="'+i+'" aria-label="Remove match">Remove</button></div></div>').join('');$$('[data-remove]').forEach(b=>b.onclick=()=>{scheduleDirty=true;const rows=readSchedule();rows.splice(Number(b.dataset.remove),1);renderSchedule(rows);});}function readSchedule(){const rows=[];$$('[data-schedule]').forEach(e=>{const [i,k]=e.dataset.schedule.split('.');(rows[i]??={})[k]=e.value;});return rows;}$('#addSchedule').onclick=()=>{scheduleDirty=true;renderSchedule([...readSchedule(),{time:'18:00',blue:'TEAM A',red:'TEAM B',note:'BO3'}]);};$('#saveSchedule').onclick=run(async()=>{await save({schedule:readSchedule()});scheduleDirty=false;toast('Schedule saved');});
$('#outputLinks').innerHTML=[['program','Program'],...scenes.map(([id,n])=>[id,n])].map(([id,n])=>{const url=location.origin+'/overlay.html'+(id==='program'?'':'?scene='+id);return `<div class="outputrow"><strong>${n}</strong><code>${url}</code><button data-copy="${url}">Copy URL</button><a href="${url}" target="_blank">Open Ã¢â€ â€”</a></div>`;}).join('');$$('[data-copy]').forEach(b=>b.onclick=run(async()=>{await navigator.clipboard.writeText(b.dataset.copy);toast('OBS URL copied');}));$('#exportState').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='pasiklab-production.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};$('#importState').onchange=run(async e=>{if(!e.target.files[0])return;await save(JSON.parse(await e.target.files[0].text()));toast('Production backup restored');});


$('#scheduleRows').addEventListener('input',()=>scheduleDirty=true);$('#scheduleRows').addEventListener('change',()=>scheduleDirty=true);
$('#scenes').closest('article').classList.add('scene-selector-panel');
// Short, debounced text edits publish while typing; selects and numeric controls apply on change.
$$('[data-path],[data-player],[data-ban]').filter(el=>el.tagName==='INPUT'&&el.type==='text'&&!el.hasAttribute('list')).forEach(el=>{let pending;el.addEventListener('input',()=>{clearTimeout(pending);pending=setTimeout(()=>el.onchange?.({target:el}),120);});el.addEventListener('change',()=>clearTimeout(pending));});
