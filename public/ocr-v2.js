const captureCanvas=$('#captureCanvas'),ctx=captureCanvas.getContext('2d'),video=$('#captureVideo');
let stream=null,stillImage=null,clipUrl=null,workers=[],workerInit=null,ocrBusy=false,ocrLoop=false,generation=0,dragStart=null,ocrReadings=[],regions=[];
const scanScheduler=OCRRuntime.scheduler(()=>nextScan());
let profile=localStorage.getItem('ocrProfile')||'auto';if(profile!=='auto'&&!OCRModel.profiles[profile])profile='auto';
const stable=OCRRuntime.stability(),cache=new Map(),results=new Map(),published=new Map(),publishedMode=new Map();let lastClock=null,lastScanMs=0,lastDeliveryMs=0;
// A live track can stay "live" while the source stops painting: a fullscreen
// swapchain stops presenting, a Windows Graphics Capture item stalls, or OBS
// changes resolution mid-match. None of those raise `ended`, so the frames
// themselves are inspected before they are allowed to reach live detection.
const healthMonitor=CaptureHealth.create(),healthCanvas=document.createElement('canvas');healthCanvas.width=64;healthCanvas.height=36;const healthCtx=healthCanvas.getContext('2d',{willReadFrequently:true});
function inspectFrame(input){const w=input.videoWidth||input.width,h=input.videoHeight||input.height;if(!w||!h)return{ok:false,state:'starting',reason:'Waiting for the first frame'};healthCtx.drawImage(input,0,0,64,36);const pixels=healthCtx.getImageData(0,0,64,36).data,track=stream?.getVideoTracks?.()[0];return healthMonitor.observe(Object.assign(CaptureHealth.analyze(pixels,64,36),{width:w,height:h,trackState:track?(track.readyState==='ended'?'ended':track.muted?'muted':'live'):'live'}));}
function showCaptureProblem(text,tone){const el=$('#captureHealth');if(!el)return;el.hidden=false;el.textContent=text;el.style.color=tone||'var(--accent,#e08a1e)';}
function clearCaptureProblem(){const el=$('#captureHealth');if(el)el.hidden=true;}
function handleUnusableFrame(health){
  // Never let a black or frozen frame be published as a live game reading.
  showCaptureProblem('Live detection paused — '+health.reason+'. Last confirmed statistics are held on the overlay.',health.state==='frozen'?'#f59e0b':'#ef4444');
  $('#ocrSpeed').textContent='Capture: '+health.state;
  $('#applyOcr').disabled=true;
  LiveDetection.hold();
}
function handleRecoveredFrame(health){
  clearCaptureProblem();
  $('#ocrSpeed').textContent='Capture: recovered';
  $('#ocrStatus').textContent='Capture resumed. Live detection continues from the last confirmed statistics.';
  toast('Capture recovered after '+(health.state||'an interruption')+'.');
}
const controls=document.createElement('div');controls.innerHTML=`<div class="fields"><label>OCR layout<select id="ocrProfile"><option value="auto">Auto-detect draft + game + result</option><option value="scoreboard">Game scoreboard</option><option value="players">Player rails (reference crop)</option></select></label><label>Scan scope<select id="ocrScope"><option value="all">All calibrated fields</option><option value="selected">Selected field only</option></select></label><label>Confirm across frames<select id="ocrStability"><option value="3" selected>3 readings (rock-solid)</option><option value="2">2 readings</option><option value="1">1 reading (fastest)</option></select></label></div><p class="ocr-profile-note">Capture the game feed before your broadcast overlay is added. Auto-detect follows picks, bans, gameplay and the match-result screen continuously. Calibrate the boxes if the game is letterboxed or its HUD differs.</p><div id="detectControls"><strong id="detectStatus" role="status">Ready for live auto-detection</strong><label class="check"><input id="detectSwitchScene" type="checkbox" checked> Follow draft / game / result scenes in OBS Program</label><label class="check"><input id="detectDraftNames" type="checkbox"> Read draft player names (review stylized names)</label><label>Layout to calibrate<select id="detectCalibration"><option value="draft">Draft picks and bans</option><option value="game">In-game spectator HUD</option><option value="result">Match result</option></select></label><details><summary>Recognize an unfamiliar skin</summary><p>Choose a slot and the hero it shows to save a local portrait sample. It will be matched automatically when it appears again.</p><label>Unknown slot<select id="learnSlot"></select></label><img id="learnPreview" alt="Portrait selected for recognition" width="96" height="96"><button id="grabPortrait">Capture current portrait</button><label>Hero<select id="learnHero"></select></label><button id="learnPortrait">Remember this portrait</button></details></div><div class="ocr-health"><span id="ocrSpeed">Recognition: idle</span><span id="ocrDelivery">Delivery: idle</span><span id="ocrSourceSize">No capture</span></div><label class="check"><input id="ocrSmoothClock" type="checkbox" checked> Keep the game clock ticking between live readings</label><div class="buttonrow"><label class="filebutton">Open test video<input id="ocrClip" type="file" accept="video/*"></label><button id="ocrResetTracking">New game / clear OCR history</button></div>`;
const REGION_VERSION = 'v5';
['ocrRegions:scoreboard', 'ocrRegions:scoreboard:v1', 'ocrRegions:scoreboard:v2', 'ocrRegions:scoreboard:v3', 'ocrRegions:scoreboard:v4'].forEach(k => {
  try { localStorage.removeItem(k); } catch {}
});
$('#captureCanvas').before(controls);$('#ocrProfile').value=profile;$('#autoOcr').textContent='⚡ Start Realtime Local Detection';$('#confidence').value=localStorage.getItem('ocrConfidence')||'80';$('#ocrStability').value=localStorage.getItem('ocrStability')||'3';
function regionKey(){return (profile==='auto'?'liveRegions:'+$('#detectCalibration').value:'ocrRegions:'+profile)+':'+REGION_VERSION;}
function loadRegions(){
  if(profile==='auto'){
    regions=LiveDetection.regions($('#detectCalibration').value);
  } else {
    try {
      const stored=JSON.parse(localStorage.getItem(regionKey())||'null');
      if(!stored||stored.some(r=>r.w<15||r.h<15)||stored.length!==OCRModel.profiles[profile].length){
        throw new Error('Stale or invalid scoreboard regions');
      }
      regions=OCRModel.validateRegions(stored);
    } catch {
      regions=structuredClone(OCRModel.profiles[profile]);
      localStorage.setItem(regionKey(),JSON.stringify(regions));
    }
  }
  $('#detectControls').hidden=profile!=='auto';
  $('#ocrScope').closest('label').hidden=profile==='auto';
  $('#regions').value=JSON.stringify(regions,null,2);
  $('#ocrField').innerHTML=regions.map(r=>`<option>${r.field}</option>`).join('');
}
function clearTracking(){stable.clear();cache.clear();results.clear();published.clear();publishedMode.clear();ocrReadings=[];lastClock=null;$('#ocrResults').innerHTML='';$('#applyOcr').disabled=true;}
loadRegions();
$('#detectCalibration').onchange=()=>{loadRegions();invalidate();drawCapture();};$('#learnPortrait').onclick=run(()=>LiveDetection.learn());$('#grabPortrait').onclick=()=>LiveDetection.grab();$('#learnSlot').onchange=()=>LiveDetection.grab();$('#learnSlot').closest('details').ontoggle=e=>{if(e.target.open)LiveDetection.grab();};
const autoDetectButton=document.createElement('button');autoDetectButton.id='autoDetectCapture';autoDetectButton.style.display='none';document.body.appendChild(autoDetectButton);
autoDetectButton.onclick=run(async()=>{autoDetectButton.disabled=true;try{stopCapture();const warmup=initWorkers().catch(()=>null);profile='auto';$('#ocrProfile').value=profile;localStorage.setItem('ocrProfile',profile);loadRegions();$('#ocrAutoApply').checked=true;const token=generation;if(!await chooseCapture(token))return;await warmup;while(ocrBusy&&token===generation)await new Promise(r=>setTimeout(r,40));if(token===generation){toast('Local neural OCR started.');$('#autoOcr').click();}}finally{autoDetectButton.disabled=false;}});
function invalidate(){generation++;clearTracking();LiveDetection.stop();}
$('#ocrProfile').onchange=()=>{if(ocrBusy){$('#ocrProfile').value=profile;toast('Stop scanning before changing layout',true);return;}profile=$('#ocrProfile').value;localStorage.setItem('ocrProfile',profile);loadRegions();invalidate();drawCapture();};
$('#ocrScope').onchange=()=>invalidate();$('#ocrField').onchange=()=>{if($('#ocrScope').value==='selected')invalidate();drawCapture();};
$('#confidence').onchange=()=>{if(!Number.isFinite(Number($('#confidence').value))||Number($('#confidence').value)<0||Number($('#confidence').value)>100){$('#confidence').value='80';}localStorage.setItem('ocrConfidence',$('#confidence').value);invalidate();};
$('#ocrStability').onchange=()=>{localStorage.setItem('ocrStability',$('#ocrStability').value);invalidate();};$('#detectDraftNames').onchange=invalidate;
$('#ocrResetTracking').onclick=()=>{if(remoteControlClient())return sendRemoteControl('reset-tracking').catch(error=>toast(error.message,true));localStorage.removeItem(regionKey());loadRegions();invalidate();$('#ocrStatus').textContent='OCR history cleared & calibrated regions reset to defaults. Ready for a new game.';toast('OCR history and calibration reset to defaults');};
function source(){if(stream&&stream.getVideoTracks().some(track=>track.muted||track.readyState==='ended'))return null;return (stream||clipUrl)&&video.readyState>=2?video:stillImage;}
// A laptop has no local getDisplayMedia stream. Mirror the PC's shared frame
// into its capture preview without treating that remote preview as an OCR input.
let sharedCaptureBitmap=null,sharedCaptureAt=0,sharedCaptureBusy=false;
async function refreshSharedCapture(){
  if(sharedCaptureBusy||stream||clipUrl||stillImage)return;
  sharedCaptureBusy=true;
  try{
    const response=await fetch('/api/capture/latest');if(!response.ok)throw Error('No shared frame');
    const frame=await response.json();
    if(frame.capturedAt!==sharedCaptureAt){
      const image=await fetch(frame.image),bitmap=await createImageBitmap(await image.blob());
      sharedCaptureBitmap?.close?.();sharedCaptureBitmap=bitmap;sharedCaptureAt=frame.capturedAt;
      $('#ocrSourceSize').textContent='Shared PC capture: '+bitmap.width+' × '+bitmap.height;
      if($('#ocr').classList.contains('active'))drawCapture();
    }
  }catch{sharedCaptureBitmap?.close?.();sharedCaptureBitmap=null;sharedCaptureAt=0;if(!source())$('#ocrSourceSize').textContent='No host capture';if($('#ocr').classList.contains('active'))drawCapture();}
  finally{sharedCaptureBusy=false;}
}
setInterval(refreshSharedCapture,500);
function remoteControlClient(){return !!sharedCaptureBitmap&&!source();}
function collectOcrSettings(){
  let calibratedRegions=null;try{calibratedRegions=JSON.parse($('#regions').value);}catch{}
  return {profile:$('#ocrProfile').value,scope:$('#ocrScope').value,stability:$('#ocrStability').value,confidence:$('#confidence').value,
    autoApply:$('#ocrAutoApply').checked,smoothClock:$('#ocrSmoothClock').checked,switchScene:$('#detectSwitchScene').checked,
    draftNames:$('#detectDraftNames').checked,calibration:$('#detectCalibration').value,regions:calibratedRegions,
    provider:$('#aiProvider').value,aiAutoApply:$('#aiAutoApply').checked,aiSwitchScene:$('#aiSwitchScene').checked,aiSmoothClock:$('#aiSmoothClock').checked,
    captureSurface:$('#captureSurface').value,captureCursor:$('#captureCursor').value};
}
let remoteControlRevision=0,remoteCommandRevision=0,remoteHostSettingsKey='',suppressRemoteControlPush=false,pendingRemoteRevision=0;
async function sendRemoteControl(command){
  const payload={};if(command)payload.command=command;else payload.settings=collectOcrSettings();
  const result=await api('/api/capture/control',payload);pendingRemoteRevision=Math.max(pendingRemoteRevision,command?result.commandRevision:result.revision);updateRemoteControlUi(result);
}
function updateRemoteControlUi(control){
  const note=$('#remoteOcrControlStatus');if(!note)return;
  if(!remoteControlClient()){note.hidden=true;return;}
  note.hidden=false;
  if(pendingRemoteRevision&&(control.ackRevision||0)<pendingRemoteRevision){note.textContent='Request sent · waiting for the broadcast PC. Refresh its desk page, then reselect capture if needed.';return;}
  if(pendingRemoteRevision)pendingRemoteRevision=0;
  note.textContent=(control.ocrRunning||control.aiRunning?'PC OCR controls connected · ':'PC OCR controls connected · idle')+
    (control.ocrRunning?'Local OCR running':'')+(control.ocrRunning&&control.aiRunning?' + ':'')+(control.aiRunning?'AI detection running':'');
  $('#autoOcr').textContent=control.ocrRunning?'Stop PC Local OCR':'Start PC Local OCR';
  $('#aiLiveLoopBtn').textContent=control.aiRunning?'Stop PC AI Detection':'Start PC AI Detection';
}
function applyOcrSettings(settings){
  if(!settings)return;
  suppressRemoteControlPush=true;
  try{
    const set=(selector,value,type='value')=>{const el=$(selector);if(!el||value===undefined)return;const next=type==='checked'?!!value:String(value);if(el[type]===next)return;el[type]=next;el.dispatchEvent(new Event('change',{bubbles:true}));};
    set('#ocrProfile',settings.profile);set('#ocrScope',settings.scope);set('#ocrStability',settings.stability);set('#confidence',settings.confidence);
    set('#ocrAutoApply',settings.autoApply,'checked');set('#ocrSmoothClock',settings.smoothClock,'checked');
    set('#detectSwitchScene',settings.switchScene,'checked');set('#detectDraftNames',settings.draftNames,'checked');set('#detectCalibration',settings.calibration);
    set('#aiAutoApply',settings.aiAutoApply,'checked');set('#aiSwitchScene',settings.aiSwitchScene,'checked');set('#aiSmoothClock',settings.aiSmoothClock,'checked');
    set('#captureSurface',settings.captureSurface);set('#captureCursor',settings.captureCursor);
    if(settings.provider&&$('#aiProvider').value!==settings.provider){$('#aiProvider').value=settings.provider;$('#aiProvider').dispatchEvent(new Event('change',{bubbles:true}));}
    if(Array.isArray(settings.regions)){try{const current=JSON.parse($('#regions').value||'null');if(JSON.stringify(current)!==JSON.stringify(settings.regions)){$('#regions').value=JSON.stringify(settings.regions,null,2);$('#saveRegions').click();}}catch(error){console.warn('Remote OCR calibration:',error.message);}}
  }finally{suppressRemoteControlPush=false;}
}
async function pollRemoteOcrControl(){
  try{
    const control=await api('/api/capture/control');
    if(stream){
      if(control.revision>remoteControlRevision){remoteControlRevision=control.revision;applyOcrSettings(control.settings);}
      if(control.commandRevision>remoteCommandRevision){
        remoteCommandRevision=control.commandRevision;
        if(Date.now()-control.commandAt<15000){
          if(control.command==='toggle-ocr')$('#autoOcr').click();
          else if(control.command==='toggle-ai')$('#aiLiveLoopBtn').click();
          else if(control.command==='stop-capture')stopCapture();
          else if(control.command==='scan-once')$('#scan').click();
          else if(control.command==='apply-readings')$('#applyOcr').click();
          else if(control.command==='reset-tracking')$('#ocrResetTracking').click();
        }
      }
      await api('/api/capture/control',{host:true,ackRevision:control.revision,ocrRunning:ocrLoop,aiRunning:LiveDetection.isAiLoopRunning(),settings:collectOcrSettings()});
    }else if(remoteControlClient()){
      updateRemoteControlUi(control);
      const settingsKey=JSON.stringify(control.hostSettings||{});
      if(settingsKey!=='{}'&&settingsKey!==remoteHostSettingsKey){remoteHostSettingsKey=settingsKey;applyOcrSettings(control.hostSettings);}
    }
  }catch{}
}
setInterval(pollRemoteOcrControl,500);
document.addEventListener('change',event=>{
  if(suppressRemoteControlPush||!remoteControlClient()||!event.target.closest('#ocr'))return;
  if(event.target.matches('#ocrProfile,#ocrScope,#ocrStability,#confidence,#ocrAutoApply,#ocrSmoothClock,#detectSwitchScene,#detectDraftNames,#detectCalibration,#aiProvider,#aiAutoApply,#aiSwitchScene,#aiSmoothClock,#captureSurface,#captureCursor'))
    sendRemoteControl().catch(error=>toast(error.message,true));
});
const remoteControlStatus=document.createElement('p');remoteControlStatus.id='remoteOcrControlStatus';remoteControlStatus.className='hint';remoteControlStatus.hidden=true;$('#ocrSourceSize')?.after(remoteControlStatus);
$('#saveRegions').addEventListener('click',()=>{if(!suppressRemoteControlPush&&remoteControlClient())sendRemoteControl().catch(error=>toast(error.message,true));});
// Publish a small fresh frame from the PC-owned screen capture. The server
// stores only this latest JPEG, allowing LAN laptops to use the PC capture.
const relayCanvas=document.createElement('canvas');relayCanvas.width=1280;relayCanvas.height=720;let relayBusy=false;
setInterval(async()=>{if(!stream||video.readyState<2||relayBusy)return;const s=source();if(!s)return;relayBusy=true;try{const w=s.videoWidth||s.width,h=s.videoHeight||s.height;if(!w||!h)return;const scale=Math.min(1,1280/w,720/h),rw=Math.max(1,Math.round(w*scale)),rh=Math.max(1,Math.round(h*scale));if(relayCanvas.width!==rw)relayCanvas.width=rw;if(relayCanvas.height!==rh)relayCanvas.height=rh;relayCanvas.getContext('2d').drawImage(s,0,0,rw,rh);const image=relayCanvas.toDataURL('image/jpeg',0.72);await fetch('/api/capture/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,capturedAt:Date.now()})});}catch{}finally{relayBusy=false;}},500);
function drawCapture(){ctx.clearRect(0,0,1920,1080);const s=source()||sharedCaptureBitmap;if(s){if(s===sharedCaptureBitmap)ctx.drawImage(s,0,0,1920,1080);else if(profile==='auto'){const f=document.createElement('canvas');f.width=s.videoWidth||s.width;f.height=s.videoHeight||s.height;f.getContext('2d').drawImage(s,0,0);ctx.drawImage(DraftCapture.normalize(f),0,0,1920,1080);}else ctx.drawImage(s,0,0,1920,1080);}ctx.font='18px Segoe UI';for(const r of regions){ctx.strokeStyle=r.field===$('#ocrField').value?'#d6f36a':'#53c9f3';ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(r.field,r.x,Math.min(1060,r.y+r.h+20));}}
setInterval(()=>{if($('#ocr').classList.contains('active'))drawCapture();},100);
function stopLoop(){LiveDetection.stop();if(activeSyncSource==='ocr')activeSyncSource=null;ocrLoop=false;scanScheduler.cancel();generation++;$('#autoOcr').textContent='⚡ Start Realtime Local Detection';$('#ocrProfile').disabled=false;$('#scan').disabled=ocrBusy;}
function stopCapture(){stopLoop();if(typeof LiveDetection!=='undefined'&&LiveDetection.isAiLoopRunning?.()){LiveDetection.stopAiLoop();const btn=$('#aiLiveLoopBtn');if(btn){btn.textContent='⚡ Start Realtime AI Live Detection';btn.style.background='#8b5cf6';btn.style.borderColor='#8b5cf6';}}stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;video.pause();video.srcObject=null;video.removeAttribute('src');if(clipUrl)URL.revokeObjectURL(clipUrl);clipUrl=null;video.hidden=true;video.controls=false;stillImage?.close?.();stillImage=null;clearTracking();healthMonitor.reset();lastSourceSize='';clearCaptureProblem();const rc=$('#reconnectCapture');if(rc)rc.hidden=true;$('#ocrStatus').textContent='Capture stopped.';$('#ocrSourceSize').textContent='No capture';api('/api/capture/clear',{}).catch(()=>{});api('/api/ocr/stop',{}).catch(()=>{});}
function sourceStatus(label){const s=source();$('#ocrSourceSize').textContent=`${label}: ${s?.videoWidth||s?.width||0} × ${s?.videoHeight||s?.height||0}`;}
// A mid-match resolution change invalidates the calibrated 1920x1080 boxes, so
// it has to be surfaced rather than quietly producing unreadable readings.
let lastSourceSize='';
function noteSourceSize(label){const s=source(),w=s?.videoWidth||0,h=s?.videoHeight||0,size=`${w}×${h}`;
 if(lastSourceSize&&size!==lastSourceSize){
  const scaled=w>0&&h>0&&Math.abs(w/1920-1)<0.02&&Math.abs(h/1080-1)<0.02;
  showCaptureProblem(`Capture resolution changed to ${w} × ${h}.`+(scaled?' Live detection is re-confirming its boxes.':' This is not 1920 × 1080, so calibrated OCR boxes may no longer line up — recheck Capture mode and recalibrate.'),scaled?'#f59e0b':'#ef4444');
 }
 lastSourceSize=size;sourceStatus(label||'Live');}
 async function chooseCapture(token){
  const displaySurface=$('#captureSurface')?.value||'monitor';
  // The captured-feed cursor is purely an OCR concern: OCR never needs the
  // pointer, and a moving pointer over a calibrated box only costs accuracy.
  // It has no effect on whether the Windows pointer is visible or clickable.
  const cursor=$('#captureCursor')?.value==='always'?'always':'never';
  let selected;
  if(displaySurface==='camera'){
    try{
      selected=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:60}},audio:false});
    }catch(err){
      toast('Could not access OBS Virtual Camera / video device: '+err.message,true);
      return false;
    }
  }else{
    if(typeof navigator.mediaDevices?.getDisplayMedia!=='function'){
      toast('Screen capture is unavailable on this connection. Open the desk at http://127.0.0.1:3210 (localhost) or use "OBS Virtual Camera" capture mode instead.',true);
      return false;
    }
    try{
      const constraints={video:{frameRate:{ideal:15,max:30},cursor},audio:false,selfBrowserSurface:'exclude',surfaceSwitching:'include',systemAudio:'exclude'};
      if(displaySurface&&displaySurface!=='any')constraints.video.displaySurface=displaySurface;
      selected=await navigator.mediaDevices.getDisplayMedia(constraints);
    }catch(err){
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') throw err;
      selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30},cursor},audio:false});
    }
  }
  if(token!==generation){selected.getTracks().forEach(t=>t.stop());return false;}
  stream=selected;video.srcObject=selected;const track=selected.getVideoTracks()[0];
  try{await video.play();}catch(e){selected.getTracks().forEach(t=>t.stop());if(stream===selected){stream=null;video.srcObject=null;}throw e;}
  if(token!==generation){selected.getTracks().forEach(t=>t.stop());return false;}
  healthMonitor.reset();clearCaptureProblem();$('#reconnectCapture').hidden=true;
  const lastSize={w:track.getSettings?.().width||0,h:track.getSettings?.().height||0};
  // Losing the track means the browser revoked the capture (the user pressed
  // "Stop sharing", or the source went away). Only a fresh getDisplayMedia call
  // can restore it, and that needs a user gesture, so offer a clear action
  // rather than silently going dead.
  track.onended=()=>{if(stream!==selected)return;$('#ocrStatus').textContent='Capture ended. Reconnect to resume live detection — your last confirmed statistics are held on the overlay.';showCaptureProblem('Capture ended. Reconnect to resume — last confirmed statistics are held.','#ef4444');$('#reconnectCapture').hidden=false;LiveDetection.hold();stopLoop();stream=null;video.srcObject=null;video.hidden=true;};
  track.onmute=()=>{if(stream===selected)showCaptureProblem('Capture track is muted by the source. Waiting for it to resume; last confirmed statistics are held.','#f59e0b');};
  track.onunmute=()=>{if(stream===selected){clearCaptureProblem();healthMonitor.reset();$('#ocrStatus').textContent='Capture feed resumed.';}};
  lastSourceSize='';noteSourceSize('Live');const actual=displaySurface==='camera'?'camera':(track.getSettings?.().displaySurface||displaySurface);
 $('#captureHint').innerHTML=actual==='camera'?'<span style="color:#34d399;font-weight:bold;">✓ OBS Virtual Camera active:</span> Direct hardware video feed. 0 cursor interference, no browser sharing bar.':actual==='window'?'<span style="color:#f59e0b;font-weight:bold;">⚠️ Window capture active:</span> Windows WGC can suppress cursor over focused game windows. <b>If your cursor disappears inside MuMu, switch Capture mode above to "Entire screen" or use "OBS Virtual Camera".</b>':'<span style="color:#34d399;font-weight:bold;">✓ Screen capture active:</span> Desktop capture active. Your mouse cursor remains 100% visible inside MuMu.';
 $('#ocrStatus').textContent='Live capture ready. Click Start Realtime Local Detection to follow the match.';return true;
}
$('#capture').onclick=run(async()=>{if(remoteControlClient()){toast('Capture is running on the broadcast PC. Use its capture controls to reconnect or change sources.',true);return;}stopCapture();await chooseCapture(generation);});
// Re-granting a capture needs a fresh user gesture. getDisplayMedia can only be
// called from one, so this button is the only way back after a lost track.
$('#reconnectCapture').onclick=run(async()=>{if(remoteControlClient()){toast('Reconnect the capture on the broadcast PC; the browser requires a local permission click.',true);return;}const token=generation;if(await chooseCapture(token)){toast('Capture reconnected.');if(ocrLoop)nextScan();}});
$('#stopCapture').onclick=()=>remoteControlClient()?sendRemoteControl('stop-capture').catch(error=>toast(error.message,true)):stopCapture();
$('#ocrImage').onchange=run(async e=>{const f=e.target.files[0];if(!f)return;stopCapture();stillImage=await createImageBitmap(f);sourceStatus('Image');drawCapture();$('#ocrStatus').textContent='Screenshot loaded. Read regions, review, and apply.';});
$('#ocrClip').onchange=run(async e=>{const f=e.target.files[0];if(!f)return;stopCapture();clipUrl=URL.createObjectURL(f);video.src=clipUrl;video.hidden=false;video.controls=true;video.loop=false;await video.play();sourceStatus('Video');$('#ocrStatus').textContent='Test video loaded. Pause to calibrate; play for continuous OCR.';});
video.addEventListener('resize',()=>{if(stream||clipUrl)noteSourceSize(stream?'Live':'Video');});
video.addEventListener('seeking',()=>{stopLoop();invalidate();});video.addEventListener('ended',()=>{stopLoop();api('/api/ocr/stop',{}).catch(()=>{});});
video.addEventListener('pause',()=>LiveDetection.stopAiLoop());
function point(e){const r=captureCanvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1920,(e.clientX-r.left)*1920/r.width)),y:Math.max(0,Math.min(1080,(e.clientY-r.top)*1080/r.height))};}
captureCanvas.onpointerdown=e=>{dragStart=point(e);captureCanvas.setPointerCapture(e.pointerId);};
captureCanvas.onpointerup=e=>{if(!dragStart)return;const p=point(e),r=regions.find(r=>r.field===$('#ocrField').value),w=Math.abs(p.x-dragStart.x),h=Math.abs(p.y-dragStart.y);if(r&&w>=15&&h>=15){const x=Math.floor(Math.min(p.x,dragStart.x)),y=Math.floor(Math.min(p.y,dragStart.y));Object.assign(r,{x,y,w:Math.min(1920-x,Math.floor(w)),h:Math.min(1080-y,Math.floor(h))});$('#regions').value=JSON.stringify(regions,null,2);localStorage.setItem(regionKey(),JSON.stringify(regions));invalidate();toast('Calibrated box for '+r.field+' updated');}dragStart=null;drawCapture();};
$('#saveRegions').onclick=run(()=>{regions=profile==='auto'?LiveDetectionModel.validateRegions(JSON.parse($('#regions').value),$('#detectCalibration').value):OCRModel.validateRegions(JSON.parse($('#regions').value));localStorage.setItem(regionKey(),JSON.stringify(regions));$('#ocrField').innerHTML=regions.map(r=>`<option>${r.field}</option>`).join('');invalidate();toast('Calibration saved');});
$('#resetRegions').onclick=run(()=>{localStorage.removeItem(regionKey());loadRegions();invalidate();drawCapture();toast('Calibration reset to default profile');});
async function initWorkers(){if(workers.length)return workers;if(workerInit)return workerInit;$('#ocrStatus').textContent='Loading local neural OCR…';workerInit=(async()=>{const built=[];try{const initialized=await Promise.allSettled(Array.from({length:4},()=>Tesseract.createWorker('eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:location.origin+'/vendor/core',langPath:location.origin+'/ocr-models/fast',cachePath:'mlbb-fast-4.1.0',errorHandler:()=>{}})));for(const result of initialized)if(result.status==='fulfilled')built.push(result.value);const failed=initialized.find(result=>result.status==='rejected');if(failed)throw failed.reason;workers=built;return workers;}catch(e){await Promise.all(built.map(w=>w.terminate()));throw e;}finally{workerInit=null;}})();return workerInit;}
function otsuThreshold(grayscalePixels){const hist=new Int32Array(256),total=grayscalePixels.length;for(let i=0;i<total;i++)hist[grayscalePixels[i]]++;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sumB=0,wB=0,wF=0,varMax=0,threshold=128;for(let t=0;t<256;t++){wB+=hist[t];if(wB===0)continue;wF=total-wB;if(wF===0)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,varBetween=wB*wF*(mB-mF)*(mB-mF);if(varBetween>varMax){varMax=varBetween;threshold=t;}}return threshold;}
function crop(r,input=source(),isolateText=false){const s=input;if(!s)throw Error('Choose a game window, screenshot, or test video');const sw=s.videoWidth||s.width,sh=s.videoHeight||s.height,sx=sw/1920,sy=sh/1080,c=document.createElement('canvas'),scale=Math.max(1,Math.min(4,80/(r.h*sy)));c.width=Math.max(1,Math.round(r.w*sx*scale));c.height=Math.max(1,Math.round(r.h*sy*scale));const cx=c.getContext('2d');cx.filter=isolateText?'none':'grayscale(1) contrast(1.3)';cx.drawImage(s,r.x*sx,r.y*sy,r.w*sx,r.h*sy,0,0,c.width,c.height);const tiny=document.createElement('canvas');tiny.width=32;tiny.height=12;const tx=tiny.getContext('2d',{willReadFrequently:true});tx.drawImage(c,0,0,32,12);const pixels=tx.getImageData(0,0,32,12).data,signature=new Uint8Array(384);for(let i=0;i<signature.length;i++)signature[i]=pixels[i*4];// Normalize light digits on dark team colors to dark text on white, with OCR margin.
const pixelsFull=cx.getImageData(0,0,c.width,c.height),samples=[];
for(let x=0;x<c.width;x++){samples.push(pixelsFull.data[x*4],pixelsFull.data[((c.height-1)*c.width+x)*4]);}
if(isolateText){
  const red=r.field.startsWith('red.'),level=r.field.endsWith('.level'),draftClock=r.field==='draftTimer.remaining';
  for(let i=0;i<pixelsFull.data.length;i+=4){
    const rr=pixelsFull.data[i],g=pixelsFull.data[i+1],b=pixelsFull.data[i+2],low=Math.min(rr,g,b),high=Math.max(rr,g,b);
    const neutral=low>(level?100:145)&&high-low<(level?45:65);
    const team=!level&&!draftClock&&(red?rr>160&&g>95&&b>95&&rr>g*1.1&&rr>b*1.05:g>145&&b>145&&g>rr*1.08&&b>rr*1.08);
    const urgent=draftClock&&rr>75&&rr>g*1.6&&rr>b*1.6;
    const n=neutral||team||urgent?0:255;pixelsFull.data[i]=pixelsFull.data[i+1]=pixelsFull.data[i+2]=n;
  }
  cx.putImageData(pixelsFull,0,0);
}else{
  const gray=new Uint8Array(c.width*c.height);
  for(let i=0;i<gray.length;i++)gray[i]=pixelsFull.data[i*4];
  const thresh=otsuThreshold(gray);
  samples.sort((a,b)=>a-b);
  const darkBg=samples[Math.floor(samples.length/2)]<145;
  for(let i=0;i<pixelsFull.data.length;i+=4){
    const val=pixelsFull.data[i];
    const isFg=darkBg?val>thresh:val<thresh;
    const n=isFg?0:255;
    pixelsFull.data[i]=pixelsFull.data[i+1]=pixelsFull.data[i+2]=n;
  }
  cx.putImageData(pixelsFull,0,0);
}
const padded=document.createElement('canvas');padded.width=c.width+20;padded.height=c.height+20;const pc=padded.getContext('2d');pc.fillStyle='white';pc.fillRect(0,0,padded.width,padded.height);pc.drawImage(c,10,10);
return {canvas:padded,signature,sampledAt:Date.now()};}
function showResults(){ocrReadings=[...results.values()].filter(r=>r.accepted).map(({field,value})=>({field,value}));$('#applyOcr').disabled=!ocrReadings.length;$('#ocrResults').innerHTML=regions.filter(r=>results.has(r.field)).map(({field})=>{const r=results.get(field);return `<div class="ocrrow"><span>${esc(field)}</span><b>${esc(r.value??r.text??'—')}</b><span style="color:${r.accepted?'var(--lime)':'var(--muted)'}">${Math.round(r.confidence)}% · ${r.reason}</span></div>`;}).join('');}
async function publish(readings,sampledAt,live,token){if(token!==generation)return;const start=performance.now();const result=await api('/api/ocr',{readings,sampledAt,live});if(token!==generation)return;lastDeliveryMs=Math.round(performance.now()-start);$('#ocrDelivery').textContent=`Delivery: ${lastDeliveryMs} ms`;$('#sourceSummary').textContent='OCR · '+new Date().toLocaleTimeString();if(result.applied)$('#ocrStatus').textContent=`Applied ${result.applied} field${result.applied===1?'':'s'} to broadcast.`;}
async function applyOcr(){if(profile==='auto')return LiveDetection.apply();if(!ocrReadings.length)throw Error('No accepted readings');await publish(ocrReadings,Date.now(),false,generation);}
async function scan(continuous=false){
 if(ocrBusy)return;if(!source())throw Error('Choose a game window, screenshot, or test video');
 // Only a live stream can go bad mid-scan. Screenshots and uploaded clips are
 // static by definition and must keep working.
 if(stream){const live=source(),health=inspectFrame(live);if(!health.ok){handleUnusableFrame(health);return;}if(health.recovered)handleRecoveredFrame(health);}
 ocrBusy=true;$('#scan').disabled=true;const token=generation,started=performance.now();let recognized=0;
 try{
  const pool=await initWorkers();if(token!==generation)return;
  if(profile==='auto'){const input=source();if(!input)return;const frame=document.createElement('canvas');frame.width=input.videoWidth||input.width;frame.height=input.videoHeight||input.height;frame.getContext('2d').drawImage(input,0,0);await LiveDetection.scan({pool,frame,sampledAt:Date.now(),live:continuous&&!!(stream||clipUrl)&&!video.paused,current:()=>token===generation,continuous});return;}
  await LiveDetection.idle();if(token!==generation)return;
  const batch=structuredClone($('#ocrScope').value==='selected'?regions.filter(r=>r.field===$('#ocrField').value):regions).sort((a,b)=>priority(a.field)-priority(b.field));
  async function readRegion(worker,r,attempt=0){
   const item=crop(r),old=cache.get(r.field),changed=OCRRuntime.changed(old?.signature,item.signature),clockField=r.field==='gameTime';
   if(continuous&&clockField&&old&&!changed&&Date.now()-old.at<200)return;
   if(continuous&&old?.confirmed&&old.live&&(!$('#ocrAutoApply').checked||published.has(r.field))&&!changed&&!clockField&&Date.now()-old.at<2000)return;
   const readStart=performance.now();await worker.setParameters({tessedit_pageseg_mode:OCRModel.kind(r.field)==='number'?'8':'7',tessedit_char_whitelist:OCRModel.kind(r.field)==='text'?'':'0123456789.kK:/'});
   const {data}=await worker.recognize(item.canvas);if(token!==generation)return;recognized++;
   const value=OCRModel.parse(data.text,r.field),confident=value!==null&&data.confidence>=Number($('#confidence').value),confirmed=continuous?stable.observe(r.field,confident?value:null,clockField?1:Number($('#ocrStability').value)):confident;
   let accepted=confident&&confirmed,reason=!confident?'skip':!confirmed?'confirming':'ready';
   const previous=published.get(r.field);
   const killsSpike=continuous&&r.field.endsWith('.kills')&&previous!==undefined&&value>previous+5&&!stable.observe(r.field+':spike',value,3);
   const correctedNum=continuous&&accepted&&previous!==undefined&&typeof value==='number'&&!clockField&&value<previous&&(
     (r.field.endsWith('.gold')&&value*5<=previous&&stable.observe(r.field+':correction',value,3))||
     (r.field.endsWith('.kills')&&(previous-value>10||stable.observe(r.field+':correction',value,2)))||
     (['lord','turrets','turtle'].some(k=>r.field.endsWith('.'+k))&&(previous-value>=3||stable.observe(r.field+':correction',value,2)))
   );
   if(killsSpike){accepted=false;reason='spike held';}
   else if(continuous&&accepted&&previous!==undefined&&typeof value==='number'&&!clockField&&value<previous&&!correctedNum){accepted=false;reason='decrease held';}
   if(continuous&&accepted&&r.field.endsWith('.kda')&&previous&&value.split('/').some((n,i)=>Number(n)<Number(previous.split('/')[i]))){accepted=false;reason='decrease held';}
   let live=continuous&&!!(stream||clipUrl)&&!video.paused;
   if(r.field==='gameTime'){
    if(value!==null){if(!lastClock||lastClock.value!==value)lastClock={value,at:item.sampledAt};else if(item.sampledAt-lastClock.at>1500)live=false;}
    live=live&&$('#ocrSmoothClock').checked;
   }
   results.set(r.field,{field:r.field,value,text:data.text.trim(),confidence:data.confidence,accepted,reason});cache.set(r.field,{signature:item.signature,at:Date.now(),confirmed:accepted,live:continuous});showResults();
   lastScanMs=Math.round(performance.now()-readStart);$('#ocrSpeed').textContent=`Recognition: ${lastScanMs} ms / field`;
   if(accepted&&$('#ocrAutoApply').checked&&(value!==previous||publishedMode.get(r.field)!==live)){
    await publish([{field:r.field,value}],item.sampledAt,live,token);if(token===generation){published.set(r.field,value);publishedMode.set(r.field,live);}
   }
   // Confirm this fresh value before moving through a long player-rail scan.
   if(continuous&&confident&&!confirmed&&attempt<Number($('#ocrStability').value)-1&&token===generation){await new Promise(resolve=>setTimeout(resolve,40));if(token===generation)await readRegion(worker,r,attempt+1);}
  }
  await OCRRuntime.parallel(batch,pool,(worker,r)=>readRegion(worker,r),()=>token===generation);
  if(token===generation){$('#ocrStatus').textContent=`${continuous?'Continuous OCR':'Scan complete'} · ${recognized} regions read in ${Math.round(performance.now()-started)} ms · ${ocrReadings.length} accepted${$('#ocrAutoApply').checked?' · auto-apply on':'. Review and apply when ready.'}`;}
 }finally{ocrBusy=false;$('#scan').disabled=ocrLoop;}
}
function priority(field){return field==='gameTime'?0:field.endsWith('.kills')?1:field.endsWith('.name')?3:2;}
async function nextScan(){if(!ocrLoop)return;try{await scan(true);}catch(e){stopLoop();toast(e.message,true);$('#ocrStatus').textContent='OCR stopped: '+e.message;return;}if(ocrLoop)scanScheduler.schedule(80);}
$('#scan').onclick=run(()=>remoteControlClient()?sendRemoteControl('scan-once'):scan(false));$('#applyOcr').onclick=run(async()=>{if(remoteControlClient()){await sendRemoteControl('apply-readings');return;}await applyOcr();toast('Accepted readings applied');});
$('#autoOcr').onclick=run(()=>{if(remoteControlClient())return sendRemoteControl('toggle-ocr');if(ocrLoop){stopLoop();$('#ocrStatus').textContent='Continuous OCR stopped.';api('/api/ocr/stop',{}).catch(()=>{});return;}if(!source())throw Error('Choose a capture source first');if(ocrBusy)throw Error('Wait for the current scan to finish');activeSyncSource='ocr';$('#ocrAutoApply').checked=true;ocrLoop=true;generation++;$('#autoOcr').textContent='Stop continuous OCR';$('#ocrProfile').disabled=true;nextScan();});
window.addEventListener('beforeunload',()=>{generation++;scanScheduler.close();LiveDetection.stop();HeroRecognition.close();stream?.getTracks().forEach(t=>t.stop());workers.forEach(w=>w.terminate());});


// AI Live Detection Buttons Wiring
// Local Live Detection Control Wiring
(function initLiveControls(){
  const aiLiveBtn = $('#aiLiveLoopBtn');
  const aiInstantBtn = $('#aiInstantScanBtn');
  const provider = $('#aiProvider'), postgameProvider = $('#postgameAiProvider'), providerStatus = $('#aiProviderStatus');
  let providerRevision = 0;
  async function checkProvider() {
    const revision = ++providerRevision;
    if (!provider || !providerStatus) return;
    if (provider.value === 'gemini') { providerStatus.textContent = 'Gemini Vision uses your saved API key. Local HUD OCR continues between AI readings.'; return; }
    providerStatus.textContent = 'Connecting to local Codex…';
    try {
      const status = await api('/api/ai/codex/status');
      if (revision === providerRevision) providerStatus.textContent = `Codex ready · ${status.model} Fast / ${status.effort} · signed in on this PC. Fast mode uses 2.5× credits; image analysis needs the internet.`;
    } catch (error) { if (revision === providerRevision) providerStatus.textContent = error.message; }
  }
  if (provider) {
    api('/api/ai/config').then(cfg => { if (!providerRevision && !LiveDetection.isAiLoopRunning()) { provider.value = cfg.provider || 'codex'; if(postgameProvider)postgameProvider.value=provider.value; checkProvider(); } }).catch(() => {});
    const saveProvider = run(async source => { ++providerRevision; const selected=source.value; await api('/api/ai/config', { provider: selected }); if(provider)provider.value=selected;if(postgameProvider)postgameProvider.value=selected;await checkProvider(); });
    provider.onchange = () => saveProvider(provider);
    if(postgameProvider)postgameProvider.onchange=()=>saveProvider(postgameProvider);
  }
  $('#checkAiProvider')?.addEventListener('click', run(checkProvider));
  if (aiLiveBtn) {
    aiLiveBtn.onclick = run(async () => {
      if(remoteControlClient()){await sendRemoteControl('toggle-ai');return;}
      if (LiveDetection.isAiLoopRunning()) {
        LiveDetection.stopAiLoop();
        aiLiveBtn.textContent = '⚡ Start Realtime AI Live Detection';
        aiLiveBtn.style.background = '#8b5cf6';
        aiLiveBtn.style.borderColor = '#8b5cf6';
        toast('Realtime AI Detection stopped');
      } else {
        stopLoop();
        const token = generation;
        if (!source() && !await chooseCapture(token)) return;
        if (token !== generation) return;
        initWorkers().catch(error => { $('#aiHudStatus').textContent = 'Local HUD: ' + error.message; });
        HeroRecognition.init().catch(error => { $('#aiHudStatus').textContent = 'Portraits: ' + error.message; });
        LiveDetection.startAiLoop({
          getSource: () => source(),
          getPool: () => initWorkers(),
          provider: provider?.value || 'codex',
          autoApply: () => $('#aiAutoApply').checked,
          switchScene: () => $('#aiSwitchScene').checked,
          smoothClock: () => $('#aiSmoothClock').checked,
          live: () => !!(stream || clipUrl) && !video.paused,
          interval: 1000
        });
        if (provider) provider.disabled = true;
        if (postgameProvider) postgameProvider.disabled = true;
        aiLiveBtn.textContent = '⏹ Stop Realtime AI Live Detection';
        aiLiveBtn.style.background = '#ef4444';
        aiLiveBtn.style.borderColor = '#ef4444';
        toast('Realtime AI Vision started in background');
      }
    });
  }
  if (aiInstantBtn) {
    aiInstantBtn.onclick = () => $('#scan')?.click();
  }
})();
