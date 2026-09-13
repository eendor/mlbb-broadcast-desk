const Breaks=require('./public/breaks-shared');const {saveMedia}=require('./lib/media');
const express=require('express'),fs=require('node:fs'),path=require('node:path');
const {defaults,merge,validate,timerAction}=require('./lib/state');const {normalize,findFeed}=require('./lib/parser');
const app=express(),port=Number(process.env.PORT||3210),dataDir=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(dataDir,{recursive:true});const file=path.join(dataDir,'state.json');let state=defaults();if(fs.existsSync(file)){try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(![3,5,7].includes(saved.bestOf)){fs.copyFileSync(file,file+'.before-series-fix');saved.bestOf=3;saved.game=Math.min(Math.max(1,saved.game||1),3);}state=validate(merge(state,saved));}catch(e){console.error('Saved state could not be loaded:',e.message);process.exit(1);}}
const clients=new Set();function commit(patch){if(patch.gameTime!==undefined&&!patch.gameClock)patch={...patch,gameClock:{...state.gameClock,running:false}};const next=validate(merge(structuredClone(state),patch));fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(file+'.tmp',file);state=next;for(const res of clients)res.write(`data: ${JSON.stringify(state)}\n\n`);return state;}
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return res.status(403).json({error:'Local access only'});if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return res.status(403).json({error:'Origin rejected'});next();});app.use(express.json({limit:'12mb'}));
app.use(express.static(path.join(__dirname,'public')));app.use('/vendor/tesseract',express.static(path.join(__dirname,'node_modules/tesseract.js/dist')));app.use('/vendor/core',express.static(path.join(__dirname,'node_modules/tesseract.js-core')));app.use('/vendor/lang',express.static(path.join(__dirname,'node_modules/@tesseract.js-data/eng/4.0.0_best_int')));
app.post('/api/media',express.raw({type:'application/octet-stream',limit:'200mb'}),(req,res)=>res.json(saveMedia(req.body,path.join(__dirname,'public/assets/uploads'))));
app.post('/api/ads/action',(req,res)=>res.json(commit({breaks:{rotation:Breaks.rotationAction(state.breaks,req.body.action)}})));
app.post('/api/layout',(req,res)=>{const {scene,id,value,resetScene}=req.body;if(!require('./public/layout-model').scenes.includes(scene))throw Error('Invalid layout scene');let layouts=state.layouts.filter(r=>!(r.scene===scene&&(resetScene===true||r.id===id)));if(resetScene!==true&&value!==null)layouts.push({scene,id,...value});res.json(commit({layouts}));});
const ocrSamples=new Map();
let detection=null;
function pauseDetection(){
  if(!detection)return;const patch={};
  if(detection.gameClock&&state.gameClock.running&&state.gameClock.syncedAt===detection.gameClock.syncedAt&&state.gameClock.seconds===detection.gameClock.seconds){const n=Math.min(86400,state.gameClock.seconds+Math.max(0,Math.floor((Date.now()-state.gameClock.syncedAt)/1000)));patch.gameTime=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');patch.gameClock={running:false,seconds:n,syncedAt:Date.now()};}
  if(Object.keys(patch).length)commit(patch);detection.gameClock=null;
}
app.post('/api/detection/start',(req,res)=>{pauseDetection();detection={id:require('node:crypto').randomUUID(),sampledAt:0,samples:new Map(),seenAt:Date.now()};res.json({session:detection.id});});
app.post('/api/detection/stop',(req,res)=>{if(detection?.id===req.body.session){pauseDetection();detection=null;}res.json({stopped:true});});
app.post('/api/detection/hold',(req,res)=>{if(detection?.id===req.body.session)pauseDetection();res.json({held:true});});
app.post('/api/detection',(req,res)=>{
  if(!detection||req.body.session!==detection.id)return res.json({applied:0,expired:true});
  const prepare=require('./lib/live-detection').prepare;prepare(state,req.body);
  // Clock and player workers finish independently. Reject stale fields, not a
  // whole player batch merely because a newer clock arrived first.
  if(detection.mode&&detection.mode!==req.body.mode){
    if(req.body.sampledAt<detection.sampledAt)return res.json({applied:0,stale:true});
    pauseDetection();detection.samples.clear();
  }
  const readings=req.body.readings.filter(r=>req.body.sampledAt>=(detection.samples.get(r.field)||0));
  const {patch,held}=prepare(state,{...req.body,readings});
  detection.mode=req.body.mode;detection.sampledAt=Math.max(detection.sampledAt,req.body.sampledAt);detection.seenAt=Date.now();
  if(patch.gameClock&&patch.gameTime===state.gameTime&&patch.gameClock.running===state.gameClock.running){delete patch.gameClock;delete patch.gameTime;}
  const {merge:mergeState}=require('./lib/state');const next=mergeState(structuredClone(state),patch);
  const changed=JSON.stringify(next)!==JSON.stringify(state);if(changed)commit(patch);
  readings.forEach(r=>detection.samples.set(r.field,req.body.sampledAt));
  if(patch.gameClock)detection.gameClock={...state.gameClock};
  res.json({applied:changed?readings.length:0,held,receivedAt:Date.now()});
});
// A closed tab or lost capture cannot leave an extrapolated clock running forever.
setInterval(()=>{if(detection&&Date.now()-detection.seenAt>4000)pauseDetection();},1000).unref();
app.post('/api/ocr/stop',(req,res)=>{let patch={};if(state.gameClock.running){const n=Math.min(86400,state.gameClock.seconds+Math.max(0,Math.floor((Date.now()-state.gameClock.syncedAt)/1000)));patch={gameTime:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),gameClock:{running:false,seconds:n,syncedAt:Date.now()}};}if(Object.keys(patch).length)commit(patch);res.json({stopped:true});});
app.post('/api/ocr',(req,res)=>{require('./lib/live-ocr').prepare(state,req.body);const readings=req.body.readings.filter(r=>req.body.sampledAt>=(ocrSamples.get(r.field)||0));if(!readings.length)return res.json({applied:0});const fresh=require('./lib/live-ocr').prepare(state,{...req.body,readings});const changed=readings.filter(r=>{const current=r.field.split('.').reduce((v,k)=>v?.[k],state);return current!==r.value||r.field==='gameTime'&&state.gameClock.running!==req.body.live;});if(changed.length)commit(fresh);readings.forEach(r=>ocrSamples.set(r.field,req.body.sampledAt));res.json({applied:changed.length,receivedAt:Date.now()});});
app.get('/api/state',(req,res)=>res.json(state));app.post('/api/state',(req,res)=>res.json(commit(req.body)));app.get('/api/events',(req,res)=>{res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});req.socket.setNoDelay(true);res.flushHeaders();res.write(`data: ${JSON.stringify(state)}\n\n`);clients.add(res);const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clients.delete(res);clearInterval(heartbeat);});});
app.post('/api/timer',(req,res)=>{const {timer,action,seconds}=req.body;if(!['countdown','draftTimer','breakTimer'].includes(timer))throw Error('Invalid timer');res.json(commit({[timer]:timerAction(state[timer],action,seconds)}));});
async function fetchJson(url){const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='mobilelegends.com'||u.hostname.endsWith('.mobilelegends.com')))throw Error('Match feed must use HTTPS on mobilelegends.com');const r=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/json'}});if(!r.ok)throw Error(`Match service HTTP ${r.status}`);const reader=r.body.getReader();let length=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw Error('Match response too large');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('Match URL returned a web page, not a JSON feed. Inspect the response URL in the official tool.');}}
let matchAssets=null;async function fetchMatchAssets(){if(matchAssets)return matchAssets;const source=async(id,fields)=>{const r=await fetch(`https://api.gms.moontontech.com/api/gms/source/2713644/${id}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json;charset=UTF-8','X-Appid':'2636539','X-Lang':'en'},body:JSON.stringify({fields,pageSize:500})});if(!r.ok)throw Error(`Match asset service HTTP ${r.status}`);const j=await r.json();if(j.code!==0||!Array.isArray(j.data?.records))throw Error(j.message||'Match asset metadata unavailable');return j.data.records.map(v=>v.data??v);};const [heroes,items]=await Promise.all([source(2766683,['hero_id','head']),source(2775075,['equipid','equipname','equipicon'])]);matchAssets={heroes:Object.fromEntries(heroes.map(v=>[Number(v.hero_id),{icon:v.head}])),items:Object.fromEntries(items.map(v=>[Number(v.equipid),{name:v.equipname,icon:v.equipicon}]))};return matchAssets;}
app.post('/api/match/fetch',async(req,res)=>{const id=String(req.body.matchId||'').trim();if(!/^[a-zA-Z0-9_-]{6,100}$/.test(id))throw Error('Enter a valid Match ID');let raw=await fetchJson(`https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=${encodeURIComponent(id)}`);let resolver=raw,feedUrl=findFeed(raw);if(feedUrl)raw=await fetchJson(feedUrl);let parsed=null,error=null;try{const assets=String(raw?.data?.status||raw?.status||'').toLowerCase()==='result'?await fetchMatchAssets():{};parsed=normalize(raw,req.body.mapping||{},assets);}catch(e){error=e.message;}res.json({raw,resolver,feedUrl,parsed,error});});
app.post('/api/hero/animation',(req,res)=>{const catalogPath=path.join(__dirname,'public/assets/catalog.json');const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));const h=catalog.heroes.find(h=>h.name===req.body.hero);if(!h)throw Error('Unknown hero');const position=Number(req.body.position??50);if(!Number.isFinite(position)||position<0||position>100)throw Error('Position must be 0–100');if(req.body.src!==undefined){const src=req.body.src;if(typeof src!=='string'||!/^\/assets\/uploads\/[a-f0-9]{64}\.(gif|mp4|webm)$/.test(src)||!fs.existsSync(path.join(__dirname,'public',src)))throw Error('Upload a GIF, MP4 or WebM first');h.animation=src;h.animationSource='User-uploaded media';}h.animationPosition=position;fs.writeFileSync(catalogPath+'.tmp',JSON.stringify(catalog,null,2));fs.renameSync(catalogPath+'.tmp',catalogPath);for(const client of clients)client.write('event: catalog\ndata: {}\n\n');res.json({hero:h});});
app.post('/api/match/parse',async(req,res)=>res.json(normalize(req.body.raw,req.body.mapping||{},await fetchMatchAssets())));
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
        winnerTeam=winCamp===1?redSide:blueSide;
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
if(require.main===module)app.listen(port,'127.0.0.1',()=>console.log(`PASIKLAB Broadcast Desk: http://127.0.0.1:${port}`));module.exports={app};
