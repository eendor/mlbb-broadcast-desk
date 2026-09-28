const Playoffs=require('./public/playoffs-model');
const PlayoffResults=require('./lib/playoff-results');
const AiLiveState=require('./lib/ai-live-state');
const Breaks=require('./public/breaks-shared');const {saveMedia}=require('./lib/media');
const express=require('express'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const lanAccess=require('./lib/lan-access');
const {defaults,merge,validate,timerAction}=require('./lib/state');const {normalize,findFeed}=require('./lib/parser');
const app=express(),port=Number(process.env.PORT||3210),dataDir=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(dataDir,{recursive:true});const file=path.join(dataDir,'state.json');let state=defaults();if(fs.existsSync(file)){try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));saved.playoffs=Playoffs.migrate(saved.playoffs);if(![3,5,7].includes(saved.bestOf)){fs.copyFileSync(file,file+'.before-series-fix');saved.bestOf=3;saved.game=Math.min(Math.max(1,saved.game||1),3);}state=validate(merge(state,saved));}catch(e){console.error('Saved state could not be loaded:',e.message);process.exit(1);}}
const clients=new Set();function commit(patch){if(patch.gameTime!==undefined&&!patch.gameClock)patch={...patch,gameClock:{...state.gameClock,running:false}};const next=validate(merge(structuredClone(state),patch));fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(file+'.tmp',file);state=next;for(const res of clients)res.write(`data: ${JSON.stringify(state)}\n\n`);return state;}
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','inline');if(!lanAccess.allowsRequest(req))return res.status(403).json({error:'Use localhost or this computer’s private LAN address'});if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return res.status(403).json({error:'Origin rejected'});next();});app.use(express.json({limit:'12mb'}));
const staticOpts={setHeaders:(res,fp)=>{res.setHeader('Content-Disposition','inline');res.setHeader('X-Content-Type-Options','nosniff');if(fp.endsWith('.wasm'))res.setHeader('Content-Type','application/wasm');}};
app.use(express.static(path.join(__dirname,'public'),staticOpts));app.use('/assets/ads',express.static(path.join(__dirname,'public/assets/commercials'),staticOpts));app.use('/vendor/tesseract',express.static(path.join(__dirname,'node_modules/tesseract.js/dist'),staticOpts));app.use('/vendor/core',express.static(path.join(__dirname,'node_modules/tesseract.js-core'),staticOpts));app.use('/vendor/lang',express.static(path.join(__dirname,'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),staticOpts));
// The capture remains in the host browser. Keep only its newest compressed
// frame in memory so another LAN controller can request it for manual AI scan.
let hostCaptureFrame=null;
let remoteOcrControl={revision:0,command:null,commandRevision:0,commandAt:0,ackRevision:0,settings:null,hostSettings:null,ocrRunning:false,aiRunning:false,updatedAt:0};
app.get('/api/capture/control',(req,res)=>res.json(remoteOcrControl));
app.post('/api/capture/control',(req,res)=>{
  if(req.body.host===true){
    remoteOcrControl.ocrRunning=!!req.body.ocrRunning;remoteOcrControl.aiRunning=!!req.body.aiRunning;remoteOcrControl.ackRevision=Math.max(remoteOcrControl.ackRevision,Number(req.body.ackRevision)||remoteOcrControl.revision);if(req.body.settings)remoteOcrControl.hostSettings=req.body.settings;remoteOcrControl.updatedAt=Date.now();
  }else{
    const allowed=['toggle-ocr','toggle-ai','stop-capture','scan-once','apply-readings','reset-tracking'];
    if(req.body.command!==undefined){if(!allowed.includes(req.body.command))throw Error('Unsupported remote capture command');remoteOcrControl.command=req.body.command;remoteOcrControl.commandRevision=remoteOcrControl.revision+1;remoteOcrControl.commandAt=Date.now();}
    if(req.body.settings!==undefined){if(!req.body.settings||typeof req.body.settings!=='object'||Array.isArray(req.body.settings))throw Error('Invalid remote OCR settings');remoteOcrControl.settings=req.body.settings;}
    remoteOcrControl.revision++;remoteOcrControl.updatedAt=Date.now();
  }
  res.json(remoteOcrControl);
});
app.post('/api/capture/frame',(req,res)=>{
  const image=String(req.body.image||'');
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>3_500_000)throw Error('Invalid or oversized capture frame');
  hostCaptureFrame={image,capturedAt:Number.isFinite(Number(req.body.capturedAt))?Number(req.body.capturedAt):Date.now()};
  res.json({accepted:true,capturedAt:hostCaptureFrame.capturedAt});
});
app.post('/api/capture/clear',(req,res)=>{hostCaptureFrame=null;res.json({cleared:true});});
app.get('/api/capture/status',(req,res)=>{const ageMs=hostCaptureFrame?Math.max(0,Date.now()-hostCaptureFrame.capturedAt):null;res.json({available:!!hostCaptureFrame&&ageMs<2500,ageMs});});
app.get('/api/capture/latest',(req,res)=>{const ageMs=hostCaptureFrame?Math.max(0,Date.now()-hostCaptureFrame.capturedAt):null;if(!hostCaptureFrame||ageMs>=2500)return res.status(404).json({error:'No fresh capture from the broadcast PC. Start Live Game Capture on the PC and wait for its status to turn Live.'});res.json({image:hostCaptureFrame.image,capturedAt:hostCaptureFrame.capturedAt,ageMs});});
app.post('/api/media',express.raw({type:'application/octet-stream',limit:'200mb'}),(req,res)=>res.json(saveMedia(req.body,path.join(__dirname,'public/assets/uploads'))));
const cutout=require('./lib/photo-cutout').createCutout(__dirname,dataDir);
app.post('/api/photo/cutout',async(req,res)=>{try{res.json(await cutout(String(req.body.url||'')));}catch(e){res.status(503).json({cutout:false,error:e.message});}});
app.post('/api/mvp/photo',async(req,res)=>{
  const src=String(req.body.url||''),name=String(req.body.name??state.mvp.name);if(name!==state.mvp.name)return res.status(409).json({error:'The selected MVP changed. Choose the photo again.'});
  commit({mvp:{photo:'',photoSource:src,photoStatus:'processing',photoError:''}});
  try{const out=await cutout(src);if(state.mvp.photoSource===src&&state.mvp.name===name)commit({mvp:{photo:out.url,photoStatus:'ready',photoError:''}});res.json(out);}
  catch(e){if(state.mvp.photoSource===src&&state.mvp.name===name)commit({mvp:{photoStatus:'error',photoError:e.message}});res.status(503).json({error:e.message});}
});
app.post('/api/playoffs/portrait',(req,res)=>{const {team,ign,url}=req.body,t=Playoffs.team(team);if(!t?.players.includes(ign))throw Error('Choose a registered player');const portraits=state.playoffs.portraits.filter(p=>p.team!==t.id||p.ign!==ign);if(url)portraits.push({team:t.id,ign,url});res.json(commit({playoffs:{portraits}}));});
app.post('/api/playoffs/match',(req,res)=>res.json(commit({playoffs:Playoffs.edit(state.playoffs,req.body.index,req.body.field,req.body.value)})));
app.post('/api/playoffs/format',(req,res)=>res.json(commit({playoffs:Playoffs.format(state.playoffs,req.body.round,req.body.bestOf)})));
app.post('/api/playoffs/team',(req,res)=>{const side=req.body.side,t=Playoffs.team(req.body.team);if(!['blue','red'].includes(side)||!t)throw Error('Choose a qualified team');const players=defaults()[side].players.map((p,i)=>({...p,name:t.players[i]}));res.json(commit({[side]:{...defaults()[side],name:t.name,tag:t.id,logo:'/assets/playoffs/logos/'+t.id.replaceAll(' ','-')+'.png',players}}));});
app.post('/api/ads/action',(req,res)=>res.json(commit({breaks:{rotation:Breaks.rotationAction(state.breaks,req.body.action)}})));
const { downloadYoutubeAd } = require('./lib/ytdlp-ads');
app.post('/api/ads/ytdlp', async (req, res) => {
  const adsDir = path.join(__dirname, 'public/assets/commercials');
  const newAd = await downloadYoutubeAd(req.body.url, adsDir);
  const existing = state.breaks?.ads || [];
  const ads = existing.some(a => a.src === newAd.src)
    ? existing.map(a => (a.src === newAd.src ? newAd : a))
    : [...existing, newAd];
  const nextBreaks = {
    ...state.breaks,
    ads,
    rotation: { running: true, startAt: Date.now(), index: ads.length - 1 }
  };
  Breaks.validate(nextBreaks);
  res.json({ ad: newAd, state: commit({ breaks: nextBreaks }) });
});
app.post('/api/layout',(req,res)=>{const {scene,id,value,resetScene}=req.body;if(!require('./public/layout-model').scenes.includes(scene))throw Error('Invalid layout scene');let layouts=state.layouts.filter(r=>!(r.scene===scene&&(resetScene===true||r.id===id)));if(resetScene!==true&&value!==null)layouts.push({scene,id,...value});res.json(commit({layouts}));});
const ocrSamples=new Map();
let detection=null;
function cancelDetectionRequests(){for(const controller of detection?.requests||[])controller.abort();}
function pauseDetection(now=Date.now()){
  if(!detection)return;const patch={};
  if(detection.draftTimer&&state.draftTimer.endAt!==null&&state.draftTimer.endAt===detection.draftTimer.endAt)patch.draftTimer={...state.draftTimer,remaining:Math.max(0,(state.draftTimer.endAt-now)/1000),endAt:null};
  if(detection.gameClock&&state.gameClock.running&&state.gameClock.syncedAt===detection.gameClock.syncedAt&&state.gameClock.seconds===detection.gameClock.seconds){const n=Math.min(86400,state.gameClock.seconds+Math.max(0,Math.floor((now-state.gameClock.syncedAt)/1000)));patch.gameTime=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');patch.gameClock={running:false,seconds:n,syncedAt:now};}
  if(Object.keys(patch).length)commit(patch);detection.gameClock=null;detection.draftTimer=null;
}
app.post('/api/detection/start',(req,res)=>{cancelDetectionRequests();pauseDetection();const source=req.body.source==='ai'?'ai':'ocr';detection={id:require('node:crypto').randomUUID(),source,timeoutMs:source==='ai'?15000:4000,sampledAt:0,samples:new Map(),playoffReadings:new Map(),seenAt:Date.now()};res.json({session:detection.id});});
app.post('/api/detection/stop',(req,res)=>{if(detection?.id===req.body.session){cancelDetectionRequests();pauseDetection();detection=null;}res.json({stopped:true});});
app.post('/api/detection/hold',(req,res)=>{if(detection?.id===req.body.session)pauseDetection();res.json({held:true});});
app.post('/api/detection',(req,res)=>{
  if(!detection||req.body.session!==detection.id)return res.json({applied:0,expired:true});
  const prepare=require('./lib/live-detection').prepare;prepare(state,req.body);
  // Clock and player workers finish independently. Reject stale fields, not a
  // whole player batch merely because a newer clock arrived first.
  if(detection.mode&&detection.mode!==req.body.mode){
    if(req.body.sampledAt<detection.sampledAt)return res.json({applied:0,stale:true});
    pauseDetection();detection.samples.clear();detection.playoffReadings.clear();
  }
  const readings=req.body.readings.filter(r=>req.body.sampledAt>=(detection.samples.get(r.field)||0));
  const {patch,held}=prepare(state,{...req.body,readings});
  const playoffUpdate=PlayoffResults.prepareDetection(state,{...req.body,readings},detection.playoffReadings);
  for(const side of ['blue','red'])if(playoffUpdate.patch[side])patch[side]={...patch[side],...playoffUpdate.patch[side]};
  for(const key of ['playoffs','game','bestOf'])if(playoffUpdate.patch[key]!==undefined)patch[key]=playoffUpdate.patch[key];
  detection.mode=req.body.mode;detection.sampledAt=Math.max(detection.sampledAt,req.body.sampledAt);detection.seenAt=Date.now();
  if(patch.gameClock&&patch.gameTime===state.gameTime&&patch.gameClock.running===state.gameClock.running){delete patch.gameClock;delete patch.gameTime;}
  const {merge:mergeState}=require('./lib/state');const next=mergeState(structuredClone(state),patch);
  const changed=JSON.stringify(next)!==JSON.stringify(state);if(changed)commit(patch);
  readings.forEach(r=>detection.samples.set(r.field,req.body.sampledAt));
  if(req.body.localHud===true&&readings.length){detection.localHudAt=Date.now();detection.localHudMode=req.body.mode;}
  if(req.body.localHud===true&&readings.some(r=>r.field==='gameTime'||r.field==='draftTimer.remaining'))detection.localClockAt=Date.now();
  if(patch.gameClock)detection.gameClock={...state.gameClock};
  if(patch.draftTimer)detection.draftTimer={...state.draftTimer};
  const hudPatch=req.body.localHud===true?{...patch,gameTime:state.gameTime,gameClock:state.gameClock,draftTimer:state.draftTimer,blue:state.blue,red:state.red}:undefined;
  res.json({applied:changed?readings.length:0,held,receivedAt:Date.now(),playoffs:playoffUpdate.report,patch:hudPatch,clockExpiresAt:(detection.localClockAt||detection.seenAt)+(detection.localClockAt?4000:detection.timeoutMs)});
});
// A closed tab or lost capture cannot leave an extrapolated clock running forever.
setInterval(()=>{if(!detection)return;if(detection.localClockAt&&Date.now()-detection.localClockAt>4000)pauseDetection(detection.localClockAt+4000);else if(Date.now()-detection.seenAt>detection.timeoutMs)pauseDetection(detection.seenAt+detection.timeoutMs);},1000).unref();
app.post('/api/ocr/stop',(req,res)=>{let patch={};if(state.gameClock.running){const n=Math.min(86400,state.gameClock.seconds+Math.max(0,Math.floor((Date.now()-state.gameClock.syncedAt)/1000)));patch={gameTime:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),gameClock:{running:false,seconds:n,syncedAt:Date.now()}};}if(Object.keys(patch).length)commit(patch);res.json({stopped:true});});
app.post('/api/ocr',(req,res)=>{require('./lib/live-ocr').prepare(state,req.body);const readings=req.body.readings.filter(r=>req.body.sampledAt>=(ocrSamples.get(r.field)||0));if(!readings.length)return res.json({applied:0});const fresh=require('./lib/live-ocr').prepare(state,{...req.body,readings});const changed=readings.filter(r=>{const current=r.field.split('.').reduce((v,k)=>v?.[k],state);return current!==r.value||r.field==='gameTime'&&state.gameClock.running!==req.body.live;});if(changed.length)commit(fresh);readings.forEach(r=>ocrSamples.set(r.field,req.body.sampledAt));res.json({applied:changed.length,receivedAt:Date.now()});});
app.get('/api/state',(req,res)=>res.json(state));app.post('/api/state',(req,res)=>res.json(commit(req.body)));app.get('/api/events',(req,res)=>{res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});req.socket.setNoDelay(true);res.flushHeaders();res.write(`data: ${JSON.stringify(state)}\n\n`);clients.add(res);const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clients.delete(res);clearInterval(heartbeat);});});
app.post('/api/timer',(req,res)=>{const {timer,action,seconds}=req.body;if(!['countdown','draftTimer','breakTimer'].includes(timer))throw Error('Invalid timer');res.json(commit({[timer]:timerAction(state[timer],action,seconds)}));});
const ALLOWED_MATCH_HOSTS=['mobilelegends.com','youngjoygame.com','moonton.com','moontontech.com','byteoversea.com','ibytedtos.com','aliyuncs.com','amazonaws.com'];
function isAllowedMatchHost(host){return ALLOWED_MATCH_HOSTS.some(h=>host===h||host.endsWith('.'+h));}
async function fetchJson(url){const u=new URL(url);if(u.protocol!=='https:'||!isAllowedMatchHost(u.hostname))throw Error('Match feed must use HTTPS on an approved Moonton / Match feed domain');const r=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/json'}});if(!r.ok)throw Error(`Match service HTTP ${r.status}`);const reader=r.body.getReader();let length=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw Error('Match response too large');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('Match URL returned a web page, not a JSON feed. Inspect the response URL in the official tool.');}}
let matchAssets=null;async function fetchMatchAssets(){if(matchAssets)return matchAssets;const local=require('./lib/asset-library').load();if(local)return matchAssets=local;const source=async(id,fields)=>{const r=await fetch(`https://api.gms.moontontech.com/api/gms/source/2713644/${id}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json;charset=UTF-8','X-Appid':'2636539','X-Lang':'en'},body:JSON.stringify({fields,pageSize:500})});if(!r.ok)throw Error(`Match asset service HTTP ${r.status}`);const j=await r.json();if(j.code!==0||!Array.isArray(j.data?.records))throw Error(j.message||'Match asset metadata unavailable');return j.data.records.map(v=>v.data??v);};const [heroes,items]=await Promise.all([source(2766683,['hero_id','head']),source(2775075,['equipid','equipname','equipicon'])]);matchAssets={heroes:Object.fromEntries(heroes.map(v=>[Number(v.hero_id),{icon:v.head}])),items:Object.fromEntries(items.map(v=>[Number(v.equipid),{name:v.equipname,icon:v.equipicon}]))};return matchAssets;}
app.post('/api/match/fetch',async(req,res)=>{const id=String(req.body.matchId||'').trim();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(id))throw Error('Enter a valid Match ID');let raw=await fetchJson(`https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=${encodeURIComponent(id)}`);let resolver=raw,feedUrl=findFeed(raw);if(feedUrl)raw=await fetchJson(feedUrl);let parsed=null,error=null;try{const assets=String(raw?.data?.status||raw?.status||'').toLowerCase()==='result'?await fetchMatchAssets():{};parsed=normalize(raw,req.body.mapping||{},assets,state);}catch(e){error=e.message;}res.json({raw,resolver,feedUrl,parsed,error});});
app.post('/api/hero/animation',(req,res)=>{const catalogPath=path.join(__dirname,'public/assets/catalog.json');const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));const h=catalog.heroes.find(h=>h.name===req.body.hero);if(!h)throw Error('Unknown hero');const position=Number(req.body.position??50);if(!Number.isFinite(position)||position<0||position>100)throw Error('Position must be 0–100');if(req.body.src!==undefined){const src=req.body.src;if(typeof src!=='string'||!/^\/assets\/uploads\/[a-f0-9]{64}\.(gif|mp4|webm)$/.test(src)||!fs.existsSync(path.join(__dirname,'public',src)))throw Error('Upload a GIF, MP4 or WebM first');h.animation=src;h.animationSource='User-uploaded media';}h.animationPosition=position;fs.writeFileSync(catalogPath+'.tmp',JSON.stringify(catalog,null,2));fs.renameSync(catalogPath+'.tmp',catalogPath);for(const client of clients)client.write('event: catalog\ndata: {}\n\n');res.json({hero:h});});
app.post('/api/match/parse',async(req,res)=>res.json(normalize(req.body.raw,req.body.mapping||{},await fetchMatchAssets(),state)));
app.post('/api/match/apply',async(req,res)=>{
  let patch=req.body.patch;
  if(!patch){
    const parsed=normalize(req.body.raw,req.body.mapping||{},await fetchMatchAssets(),state);
    patch=parsed.patch;
  }
  const id=String(req.body.matchId||PlayoffResults.resultId(req.body.raw)||'');
  if(id&&!/^[a-zA-Z0-9_-]{6,100}$/.test(id))throw Error('Invalid Match ID');
  for(const side of ['blue','red'])for(const key of ['turrets','lord','turtle']){
    const value=req.body.objectives?.[side]?.[key];
    if(value!==undefined){if(!Number.isInteger(value)||value<0)throw Error('Invalid objective count');(patch[side]??={})[key]=value;}
  }
  if(req.body.mvp&&typeof req.body.mvp==='object')patch.mvp=req.body.mvp;
  if(req.body.scene)patch.scene=req.body.scene;
  const result=PlayoffResults.prepareResult(state,patch,{id});
  res.json({state:commit(result.patch),playoffs:result.report});
});
const CatalogMatch=require('./lib/catalog-match');
const GeminiVision=require('./lib/gemini-vision');
const CodexVision=require('./lib/codex-vision');
// Manual scoreboard review gets its own Codex app-server so it can run while
// the live stream analyzer is processing a frame without disturbing that loop.
const CodexScoreboard=new CodexVision.CodexVision();
const aiConfigFile=process.env.AI_CONFIG_FILE||path.join(process.env.DATA_DIR?dataDir:__dirname,'ai-config.json');
function getAiConfig(){try{return JSON.parse(fs.readFileSync(aiConfigFile,'utf8'));}catch{return {};}}
function getAiKey(){
  if(process.env.GEMINI_API_KEY)return process.env.GEMINI_API_KEY.trim();
  try{
    if(fs.existsSync(aiConfigFile)){
      const cfg=JSON.parse(fs.readFileSync(aiConfigFile,'utf8'));
      if(cfg.geminiApiKey)return String(cfg.geminiApiKey).trim();
    }
  }catch{}
  return '';
}
function publicAiConfig(){const k=getAiKey();return {hasKey:!!k,masked:k?k.slice(0,6)+'...'+k.slice(-4):'',provider:getAiConfig().provider||'codex',codex:CodexVision.status()};}
app.get('/api/ai/config',(req,res)=>res.json(publicAiConfig()));
app.get('/api/lan',async(req,res)=>{
  const interfaces=os.networkInterfaces();
  const urls=Object.entries(interfaces).filter(([name])=>!/(virtual|vmware|vbox|docker|wsl|hyper-v)/i.test(name))
    .flatMap(([,entries])=>(entries||[]).filter(entry=>entry.family==='IPv4'&&!entry.internal&&lanAccess.isPrivateAddress(entry.address)&&!entry.address.startsWith('169.254.'))
      .map(entry=>`http://${entry.address}:${port}`));
  let primary='';
  try{const dgram=require('node:dgram'),socket=dgram.createSocket('udp4');primary=await new Promise(resolve=>{const finish=value=>{try{socket.close();}catch{}resolve(value);};socket.once('error',()=>finish(''));socket.connect(53,'1.1.1.1',()=>finish(socket.address().address));});}catch{}
  const preferred=urls.filter(url=>url===`http://${primary}:${port}`);
  res.json({urls:preferred.length?preferred:urls});
});
app.get('/api/ai/codex/status',async(req,res)=>{try{res.json(await CodexVision.warmup());}catch(error){res.status(503).json({...CodexVision.status(),error:error.message});}});
app.get('/api/ai/models',(req,res)=>{res.json({models:GeminiVision.getModelStatus(),activeCount:GeminiVision.getActiveModels().length});});
app.post('/api/ai/config',(req,res)=>{
  const cfg=getAiConfig();
  if(req.body.provider!==undefined){if(!['codex','gemini'].includes(req.body.provider))throw Error('Choose Codex or Gemini');cfg.provider=req.body.provider;}
  if(req.body.geminiApiKey!==undefined)cfg.geminiApiKey=String(req.body.geminiApiKey).trim();
  fs.writeFileSync(aiConfigFile,JSON.stringify(cfg,null,2));res.json({saved:true,...publicAiConfig()});
});
// Optional cloud AI for MANUAL screenshot analysis only.
// This deliberately never reads, creates, replaces or pauses the shared
// `detection` session. /api/detection/ai-live replaces that session when it is
// called without one, which would silently kill the local OCR realtime loop.
// Cloud results are returned for operator review and are never auto-applied to
// the live broadcast from here.
app.post('/api/ai/analyze',async(req,res)=>{
  const provider=req.body.provider||getAiConfig().provider||'codex';
  if(!['codex','gemini'].includes(provider))throw Error('Choose Codex or Gemini');
  const key=provider==='gemini'?String(req.body.apiKey||getAiKey()).trim():'';
  if(provider==='gemini'&&!key)throw Error('Gemini API key required for cloud analysis. Save a key in the Cloud AI panel, or use local OCR.');
  const image=String(req.body.image||'');
  if(!image)throw Error('No screenshot provided for cloud analysis.');
  const detailImages=Array.isArray(req.body.detailImages)?req.body.detailImages.slice(0,2).map(String):[];
  const mode=String(req.body.mode||'result');
  if(!['result','draft','game'].includes(mode))throw Error('Unsupported cloud analysis mode');
  const currentMatch={
    blue:(state.blue?.players||[]).map((p,i)=>({slot:i,name:p.name,hero:p.hero})),
    red:(state.red?.players||[]).map((p,i)=>({slot:i,name:p.name,hero:p.hero})),
    blueHeroes:(state.blue?.players||[]).map(p=>p.hero).filter(Boolean),
    redHeroes:(state.red?.players||[]).map(p=>p.hero).filter(Boolean)
  };
  let result;
  if(provider==='codex'){
    result=await CodexScoreboard.analyzeLiveScreen(image,Playoffs.teams,currentMatch,{realtime:false,supplementalImages:mode==='result'?detailImages:[]});
    if(result.mode!==mode)throw Error(`The screenshot was classified as ${result.mode}; use the matching analyzer instead.`);
  }else if(mode==='draft')result=await GeminiVision.analyzeDraft(image,key,Playoffs.teams);
  else if(mode==='game')result=await GeminiVision.analyzeInGame(image,key,Playoffs.teams,currentMatch);
  else result=await GeminiVision.analyzeScoreboard(detailImages.length?[image,...detailImages]:image,key,Playoffs.teams);
  res.json({mode,provider,engine:result.engine,data:result.data,patch:result.patch,autoApplied:false,model:result.model,effort:result.effort,speedTier:result.speedTier});
});
app.post('/api/match/ai-scan',async(req,res)=>{
  const key=String(req.body.apiKey||getAiKey()).trim();
  if(!key)throw Error('Gemini API key is required. Paste your Google AI Studio API key in the Post-Match tab or set GEMINI_API_KEY.');
  if(!req.body.image)throw Error('No scoreboard image provided for AI analysis.');
  const result=await GeminiVision.analyzeScoreboard(req.body.image,key,Playoffs.teams);
  res.json(result);
});
app.post('/api/draft/ai-scan',async(req,res)=>{
  const key=String(req.body.apiKey||getAiKey()).trim();
  if(!key)throw Error('Gemini API key is required. Configure your Google AI Studio key first.');
  if(!req.body.image)throw Error('No draft screenshot provided for AI analysis.');
  const result=await GeminiVision.analyzeDraft(req.body.image,key,Playoffs.teams);
  res.json(result);
});
app.post('/api/game/ai-scan',async(req,res)=>{
  const key=String(req.body.apiKey||getAiKey()).trim();
  if(!key)throw Error('Gemini API key is required. Configure your Google AI Studio key first.');
  if(!req.body.image)throw Error('No in-game screenshot provided for AI analysis.');
  const currentMatch = {
    blue: (state.blue?.players || []).map((p, i) => ({ slot: i, name: p.name, hero: p.hero })),
    red: (state.red?.players || []).map((p, i) => ({ slot: i, name: p.name, hero: p.hero })),
    blueHeroes: (state.blue?.players || []).map(p => p.hero).filter(Boolean),
    redHeroes: (state.red?.players || []).map(p => p.hero).filter(Boolean)
  };
  const result=await GeminiVision.analyzeInGame(req.body.image,key,Playoffs.teams,currentMatch);
  res.json(result);
});
app.post('/api/detection/ai-live',async(req,res)=>{
  const provider=req.body.provider||getAiConfig().provider||'codex';
  if(!['codex','gemini'].includes(provider))throw Error('Unsupported live AI provider');
  const key=provider==='gemini'?String(req.body.apiKey||getAiKey()).trim():'';
  if(provider==='gemini'&&!key)throw Error('Gemini API key is required. Configure your Google AI Studio key first.');
  if(!req.body.image)throw Error('No screenshot provided for live AI analysis.');
  let ownDetection=detection;
  if(req.body.session){
    if(!ownDetection||ownDetection.source!=='ai'||req.body.session!==ownDetection.id)return res.json({applied:false,expired:true});
  }else{
    if(!ownDetection||ownDetection.source!=='ai'){
      detection={
        id:require('node:crypto').randomUUID(),
        source:'ai',
        timeoutMs:60000,
        sampledAt:0,
        samples:new Map(),
        playoffReadings:new Map(),
        seenAt:Date.now()
      };
      ownDetection=detection;
    }
  }
  const sampledAt=Number.isFinite(req.body.sampledAt)?req.body.sampledAt:Date.now();
  if(sampledAt>Date.now()+1000||sampledAt<Date.now()-30000)throw Error('Invalid or expired AI capture timestamp');
  const mode=req.body.mode||'auto';
  const currentMatch = {
    blue: (state.blue?.players || []).map((p, i) => ({ slot: i, name: p.name, hero: p.hero })),
    red: (state.red?.players || []).map((p, i) => ({ slot: i, name: p.name, hero: p.hero })),
    blueHeroes: (state.blue?.players || []).map(p => p.hero).filter(Boolean),
    redHeroes: (state.red?.players || []).map(p => p.hero).filter(Boolean)
  };
  let result;
  const controller=new AbortController();
  (ownDetection.requests??=new Set()).add(controller);
  const disconnect=()=>{if(!res.writableEnded)controller.abort();};
  res.on('close',disconnect);
  try{
    if(provider==='codex')result=await CodexVision.analyzeLiveScreen(req.body.image,Playoffs.teams,currentMatch,{realtime:req.body.realtime===true,signal:controller.signal});
    else if(mode==='draft')result=await GeminiVision.analyzeDraft(req.body.image,key,Playoffs.teams);
    else if(mode==='game')result=await GeminiVision.analyzeInGame(req.body.image,key,Playoffs.teams,currentMatch);
    else if(mode==='result')result=await GeminiVision.analyzeScoreboard(req.body.image,key,Playoffs.teams);
    else result=await GeminiVision.analyzeLiveScreen(req.body.image,key,Playoffs.teams,currentMatch,{realtime:req.body.realtime===true,signal:controller.signal});
  }catch(error){
    if(res.destroyed)return;
    if(detection!==ownDetection)return res.json({applied:false,expired:true});
    throw error;
  }finally{ownDetection.requests.delete(controller);res.off('close',disconnect);}
  if(res.destroyed)return;
  if(detection!==ownDetection)return res.json({applied:false,expired:true});
  result.provider=provider;
  result.mode??=mode;
  if(sampledAt<(detection.aiSampledAt||0)||Date.now()-sampledAt>(req.body.realtime===true&&provider==='gemini'?12000:30000))return res.json({applied:false,stale:true});
  if(detection.mode&&detection.mode!==result.mode&&sampledAt<detection.sampledAt)return res.json({applied:false,stale:true});
  detection.aiSampledAt=sampledAt;
  result.applied=false;
  // A capture timestamp keeps both OBS and the monitor in time with the feed,
  // even when recognition takes several seconds. Repeated readings can pause it.
  const clockValue=result.mode==='game'?result.patch?.gameTime:result.mode==='draft'?result.patch?.draftTimer?.remaining:undefined;
  const previous=detection.aiClockSample;
  const frozen=previous&&previous.mode===result.mode&&previous.value===clockValue&&sampledAt-previous.at>=1500;
  if(!previous||previous.mode!==result.mode||previous.value!==clockValue)detection.aiClockSample={mode:result.mode,value:clockValue,at:sampledAt};
  const ticking=req.body.live===true&&!frozen;
  if(!req.body.autoApply||!result.patch||detection.mode!==result.mode)pauseDetection();
  detection.mode=result.mode;
  detection.sampledAt=Math.max(detection.sampledAt,sampledAt);
  detection.seenAt=Date.now();
  result.clockExpiresAt=detection.localClockAt?detection.localClockAt+4000:detection.seenAt+detection.timeoutMs;

  if(result.patch){
    if(req.body.switchScene===false){
      delete result.patch.scene;
    }
    if(['game','result'].includes(result.mode)&&/^\d{1,4}:[0-5]\d$/.test(result.patch.gameTime)){
      const [m,s]=String(result.patch.gameTime).split(':').map(Number);
      const totalSec = m*60+s;
      if(totalSec<=86400){
        const isBackwardsJump = result.mode === 'game' && state.gameClock.running && totalSec < state.gameClock.seconds - 5;
        if (!isBackwardsJump) {
          result.patch.gameClock={
            running:result.mode==='game'&&ticking,
            seconds:totalSec,
            syncedAt:sampledAt
          };
        } else {
          delete result.patch.gameTime;
        }
      }
    }else if(result.mode==='draft'&&result.patch.draftTimer){
      const rem=Number.isInteger(result.patch.draftTimer.remaining)?result.patch.draftTimer.remaining:30;
      result.patch.draftTimer={
        ...state.draftTimer,
        remaining:rem,
        endAt:ticking?sampledAt+rem*1000:null
      };
    }
    AiLiveState.protectNewerHud(result.patch,detection.samples,sampledAt,result.mode);
    if(req.body.autoApply){
      let finalPatch=result.patch;
      if(result.mode==='result'){
        for (const side of ['blue', 'red']) {
          if (finalPatch[side]?.players && Array.isArray(state[side]?.players)) {
            finalPatch[side].players = Array.from({ length: 5 }, (_, i) => {
              const p = finalPatch[side].players[i] || {};
              const cur = state[side].players[i] || {};
              const botMatch = (p.name || p.rawName || cur.name || '').match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
              const hero = botMatch ? CatalogMatch.matchHero(botMatch[1]) : (CatalogMatch.matchHero(p.hero) || cur.hero || String(p.hero || '').trim());
              return { ...p, hero };
            });
          }
        }
        if(result.patch.winner&&state.playoffs){
          try{
            const pr=PlayoffResults.prepareResult(state,result.patch,{source:'ai-live'});
            finalPatch=pr.patch;
            result.playoffs=pr.report;
          }catch(e){
            console.warn('Playoffs auto-update on AI live result:',e.message);
          }
        }
      } else if (result.mode === 'draft') {
        for (const side of ['blue', 'red']) {
          if (finalPatch[side]) {
            if (Array.isArray(finalPatch[side].bans) && Array.isArray(state[side]?.bans)) {
              finalPatch[side].bans = Array.from({ length: 5 }, (_, i) => {
                const b = finalPatch[side].bans[i] || state[side].bans[i] || '';
                return CatalogMatch.matchHero(b) || b;
              });
            }
            if (Array.isArray(finalPatch[side].players) && Array.isArray(state[side]?.players)) {
              finalPatch[side].players = Array.from({ length: 5 }, (_, i) => {
                const p = finalPatch[side].players[i] || {};
                const cur = state[side].players[i] || {};
                const incomingName = String(p.name || '').trim();
                const isPlaceholder = !incomingName || /^Player\s*\d+$/i.test(incomingName);
                const curName = String(cur.name || '').trim();
                const curHasReal = curName && !/^Player\s*\d+$/i.test(curName);
                const name = (isPlaceholder && curHasReal) ? curName : (incomingName || curName || `Player ${i + 1}`);

                const botMatch = (name || p.rawIgn || curName).match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
                const hero = botMatch ? CatalogMatch.matchHero(botMatch[1]) : (CatalogMatch.matchHero(p.hero) || cur.hero || '');
                return { ...cur, ...p, hero, name };
              });
            }
            const names = (finalPatch[side]?.players || []).map(p => p.name || p.rawIgn).filter(Boolean);
            if (names.length >= 2 && (!state[side].tag || ['BLU', 'RED', 'TBD'].includes(state[side].tag))) {
              const matched = Playoffs.identify(names);
              if (matched?.team) {
                const idn = Playoffs.identity(matched.team);
                finalPatch[side].name = idn.name;
                finalPatch[side].tag = idn.tag;
                finalPatch[side].logo = idn.logo;
              }
            }
          }
        }
      } else if (result.mode === 'game') {
        detection.aiPlayers??={blue:new Map(),red:new Map()};
        const rawGame=result.data?.game||result.data;
        for (const side of ['blue', 'red']) {
          if (finalPatch[side]) {
            if (detection.aiGameSeen && finalPatch[side].kills !== undefined && state[side]?.kills) {
              if (state[side].kills - finalPatch[side].kills <= 15) finalPatch[side].kills = Math.max(state[side].kills, finalPatch[side].kills);
            }
            if (detection.aiGameSeen && finalPatch[side].turrets !== undefined && state[side]?.turrets) {
              if (state[side].turrets - finalPatch[side].turrets <= 5) finalPatch[side].turrets = Math.max(state[side].turrets, finalPatch[side].turrets);
            }
            if (detection.aiGameSeen && finalPatch[side].lord !== undefined && state[side]?.lord) {
              if (state[side].lord - finalPatch[side].lord <= 4) finalPatch[side].lord = Math.max(state[side].lord, finalPatch[side].lord);
            }
            if (detection.aiGameSeen && finalPatch[side].turtle !== undefined && state[side]?.turtle) {
              if (state[side].turtle - finalPatch[side].turtle <= 3) finalPatch[side].turtle = Math.max(state[side].turtle, finalPatch[side].turtle);
            }
          }
          if (finalPatch[side]?.players && Array.isArray(state[side]?.players)) {
            finalPatch[side].players=AiLiveState.mergePlayers(state[side].players,finalPatch[side].players,rawGame?.[side]?.players,detection.aiPlayers[side],sampledAt);
          }
          const names = (finalPatch[side]?.players || []).map(p => p.name || p.rawIgn).filter(Boolean);
          if (names.length >= 2 && (!state[side].tag || ['BLU', 'RED', 'TBD'].includes(state[side].tag))) {
            const matched = Playoffs.identify(names);
            if (matched?.team) {
              const idn = Playoffs.identity(matched.team);
              finalPatch[side].name = idn.name;
              finalPatch[side].tag = idn.tag;
              finalPatch[side].logo = idn.logo;
            }
          }
        }
      }
      commit(finalPatch);
      detection.aiGameSeen=result.mode==='game';
      // The monitor must show the same accepted values as OBS, not raw guesses.
      result.patch={...finalPatch};
      if(result.mode==='game')result.patch={...result.patch,gameTime:state.gameTime,gameClock:state.gameClock,blue:state.blue,red:state.red};
      if(finalPatch.gameClock)detection.gameClock={...state.gameClock};
      if(finalPatch.draftTimer)detection.draftTimer={...state.draftTimer};
      result.applied=true;
    }
  }
  res.json(result);
});

const Swiss=require('./lib/swiss');
function swissLogos(){try{return JSON.parse(fs.readFileSync(path.join(__dirname,'public/assets/catalog.json'),'utf8')).logos||[];}catch{return [];}}
function swissLogoFor(name){const l=swissLogos().find(l=>l.name.toLowerCase()===String(name).toLowerCase());return l?l.url:'';}
const swissTag=name=>String(name).split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,5)||'TBD';
app.post('/api/swiss/start',(req,res)=>{if(state.swiss)throw Error('A Swiss bracket already exists');const {swiss}=Swiss.startSwiss(req.body.teams||[]);res.json(commit({swiss}));});
app.post('/api/swiss/result',(req,res)=>{if(!state.swiss)throw Error('Start the Swiss bracket first');const next=structuredClone(state.swiss);const {advanced,match}=Swiss.reportResult(next,String(req.body.matchId||''),req.body.winner);res.json({state:commit({swiss:next}),advanced,complete:next.complete,match});});
app.post('/api/swiss/teams',(req,res)=>{if(!state.swiss)throw Error('Start the Swiss bracket first');const swiss=Swiss.renameTeams(structuredClone(state.swiss),req.body.teams);res.json(commit({swiss}));});
app.post('/api/swiss/feature',(req,res)=>{if(!state.swiss)throw Error('Start the Swiss bracket first');const m=Swiss.findMatch(state.swiss,String(req.body.matchId||''));if(!m)throw Error('Unknown Swiss match');res.json(commit({blue:{name:m.blue,tag:swissTag(m.blue),logo:swissLogoFor(m.blue)},red:{name:m.red,tag:swissTag(m.red),logo:swissLogoFor(m.red)},game:1}));});
app.post('/api/swiss/clear',(req,res)=>res.json(commit({swiss:null})));
app.post('/api/swiss/parse-discord-result',async(req,res)=>{
  if(!state.swiss)throw Error('Start the Swiss bracket first');
  const text=String(req.body.text||'').trim();
  if(!text)throw Error('Paste the match data from Discord');
  // One paste can hold several reports — split on Round: headers, drop junk.
  const blocks=text.split(/^(?=Round:)/mi).map(b=>b.trim()).filter(b=>/Round:/i.test(b));
  if(!blocks.length)throw Error('No match reports found — paste the Discord match data');
  const next=structuredClone(state.swiss);
  const results=[];
  const matchTeam=(m,name)=>{
    if(!name)return null;
    const n=name.toLowerCase(),blue=m.blue.toLowerCase(),red=m.red.toLowerCase();
    if(n===blue)return'blue';if(n===red)return'red';
    if(blue.includes(n)||n.includes(blue))return'blue';
    if(red.includes(n)||n.includes(red))return'red';
    return null;
  };
  for(const block of blocks){
    const out={block:block.slice(0,80)};
    try{
      const redSide=(block.match(/Red side:\s*(.+)/i)?.[1]||'').trim();
      const blueSide=(block.match(/Blue side:\s*(.+)/i)?.[1]||'').trim();
      if(!redSide||!blueSide)throw Error('Missing "Red side:" / "Blue side:" lines');
      const gameNo=parseInt(block.match(/Game\s*(\d+)/i)?.[1]||'0',10)||0;
      out.game=gameNo||null;out.redSideTeam=redSide;out.blueSideTeam=blueSide;
      // Find the Swiss match containing both teams.
      let m=null;
      for(const round of next.rounds){
        for(const cand of round.matches){
          const blue=cand.blue.toLowerCase(),red=cand.red.toLowerCase();
          const rSide=redSide.toLowerCase(),bSide=blueSide.toLowerCase();
          if((blue===rSide&&red===bSide)||(blue===bSide&&red===rSide)){m=cand;break;}
        }
        if(m)break;
      }
      if(!m)throw Error(`No Swiss match found with teams "${redSide}" and "${blueSide}"`);
      out.swissMatchId=m.id;
      const winnerLine=(block.match(/WINNER:\s*(.+)/i)?.[1]||'').trim();
      let winnerSide=null,winnerTeam=null,moontonId=null,winCamp=null;
      if(winnerLine){
        // Marshal-declared winner — no fetch needed (also covers missing BattleIDs).
        winnerTeam=winnerLine;
        winnerSide=matchTeam(m,winnerLine);
        if(!winnerSide)throw Error(`Could not map winner "${winnerLine}" to ${m.blue} / ${m.red}`);
      }else{
        const idMatch=block.match(/(?:GameID|BattleID|ID):\s*([a-zA-Z0-9_-]+)/i);
        if(!idMatch)throw Error('No BattleID and no WINNER: line — cannot determine winner');
        moontonId=idMatch[1].trim();
        // Guard the empty-BattleID trap (regex would otherwise capture "Blue").
        if(/^(blue|red)$/i.test(moontonId))throw Error('BattleID is empty and no WINNER: line given');
        if(!/^[a-zA-Z0-9_-]{6,100}$/.test(moontonId))throw Error('Invalid ID format: '+moontonId);
        let raw=await fetchJson(`https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=${encodeURIComponent(moontonId)}`);
        const feedUrl=findFeed(raw);
        if(feedUrl)raw=await fetchJson(feedUrl);
        const root=raw?.data?.matchdata??raw?.matchdata??raw?.data??raw;
        const battle=root?.battleData;
        if(!battle)throw Error('No battle data in match response');
        const winCampRaw=battle.win_camp;
        if(![1,'1',2,'2'].includes(winCampRaw))throw Error('Match result not available yet');
        winCamp=Number(winCampRaw);
        const camp1Players=(battle.player_list||[]).filter(p=>Number(p.camp)===1);
        const camp2Players=(battle.player_list||[]).filter(p=>Number(p.camp)===2);
        const id1=Playoffs.identify(camp1Players.map(p=>p.name));
        const id2=Playoffs.identify(camp2Players.map(p=>p.name));
        const sideScore=(teamIdent,campPlayers,teamName)=>{
          if(!teamName)return 0;
          let s=0;
          const target=String(teamName).toLowerCase().trim();
          if(teamIdent?.team){
            const tid=String(teamIdent.team.id||'').toLowerCase().trim();
            const tname=String(teamIdent.team.name||'').toLowerCase().trim();
            const aliases=(teamIdent.team.aliases||[]).map(a=>String(a).toLowerCase().trim());
            if(target===tid||aliases.includes(target)||target===tname)s+=20;
            else if(tid.includes(target)||target.includes(tid)||aliases.some(a=>a.includes(target)||target.includes(a)))s+=10;
          }
          const reg=Playoffs.team(teamName);
          if(reg){
            const norm=str=>String(str||'').toLowerCase().replace(/[^a-z0-9]/g,'');
            const regNames=(reg.players||[]).map(norm);
            for(const p of campPlayers){
              const np=norm(p.name);
              if(np&&regNames.some(rn=>rn===np||(rn.length>=4&&(rn.includes(np)||np.includes(rn)))))s+=3;
            }
          }
          return s;
        };
        const s1Blue=sideScore(id1,camp1Players,blueSide)+sideScore(id2,camp2Players,redSide);
        const s1Red=sideScore(id1,camp1Players,redSide)+sideScore(id2,camp2Players,blueSide);
        const camp1Team=s1Blue>s1Red?blueSide:(s1Red>s1Blue?redSide:redSide);
        const camp2Team=camp1Team===blueSide?redSide:blueSide;
        winnerTeam=winCamp===1?camp1Team:camp2Team;
        winnerSide=matchTeam(m,winnerTeam);
        if(!winnerSide)throw Error(`Could not map winner "${winnerTeam}" to ${m.blue} / ${m.red}`);
      }
      const existing=m.games||[];
      const n=gameNo||(existing.reduce((a,g)=>Math.max(a,g.n||0),0)+1);
      const r=Swiss.reportGame(next,m.id,{winner:winnerSide,battleId:moontonId,n});
      Object.assign(out,{moontonId,winnerTeam,winnerSide,winCamp,game:n,series:r.series,clinched:r.clinched,applied:!!r.applied,advanced:!!r.advanced,conflict:!!r.conflict,duplicate:!!r.duplicate,consistent:!!r.consistent});
    }catch(error){out.error=error.message;}
    results.push(out);
  }
  if(!results.some(r=>!r.error))throw Error(results[0].error||'No match reports could be applied');
  res.json({state:commit({swiss:next}),results});
});
app.post('/api/swiss/poll-match-result',async(req,res)=>{
  if(!state.swiss)throw Error('Start the Swiss bracket first');
  const moontonId=String(req.body.matchId||'').trim();
  if(!moontonId)throw Error('Missing BattleID');
  if(!/^[a-zA-Z0-9_-]{6,100}$/.test(moontonId))throw Error('Invalid ID format');
  try {
    let raw=await fetchJson(`https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=${encodeURIComponent(moontonId)}`);
    const feedUrl=findFeed(raw);
    if(feedUrl)raw=await fetchJson(feedUrl);
    const root=raw?.data?.matchdata??raw?.matchdata??raw?.data??raw;
    const battle=root?.battleData;
    if(!battle)return res.json({ready:false});
    const winCamp=battle.win_camp;
    if(![1,'1',2,'2'].includes(winCamp))return res.json({ready:false});
    return res.json({ready:true});
  } catch(e) {
    return res.json({ready:false,error:e.message});
  }
});
app.post('/api/swiss/game',(req,res)=>{
  if(!state.swiss)throw Error('Start the Swiss bracket first');
  const next=structuredClone(state.swiss);
  const r=Swiss.reportGame(next,String(req.body.matchId||''),{winner:req.body.winner,battleId:req.body.battleId||null,n:Number(req.body.n)||0});
  const last=(r.match.games||[])[r.match.games.length-1];
  res.json({state:commit({swiss:next}),result:{swissMatchId:r.match.id,game:last?last.n:null,series:r.series,clinched:r.clinched,applied:r.applied,advanced:r.advanced,conflict:r.conflict,duplicate:r.duplicate,consistent:!!r.consistent,complete:next.complete}});
});
app.use((err,req,res,next)=>{console.error(err.message);res.status(400).json({error:err.message});});
if(require.main===module){const host=process.env.HOST||'0.0.0.0';app.listen(port,host,()=>{console.log(`PASIKLAB Broadcast Desk: http://127.0.0.1:${port}`);if(host==='0.0.0.0'||host==='::')for(const address of lanAccess.localAddresses())if(lanAccess.isPrivateAddress(address)&&address!=='127.0.0.1'&&address!=='::1')console.log(`LAN control: http://${address}:${port}`);});}module.exports={app};
