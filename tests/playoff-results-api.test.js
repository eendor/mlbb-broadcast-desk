const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Playoffs=require('../public/playoffs-model');

test('applying parsed results commits identity, organization scores and advancement once; previews are read-only',async t=>{
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'pasiklaban-playoffs-'));
  const {app}=require('../server');
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
  const get=async()=>await (await fetch(base+'/api/state')).json();
  function raw(swap=false){return {status:'result',battleData:{win_camp:swap?1:2,game_time:swap?960:900,blue_camp_kill:24,red_camp_kill:12,player_list:[[swap?'PSITS':'JMES',2],[swap?'JMES':'PSITS',1]].flatMap(([id,camp])=>Playoffs.team(id).players.slice(0,5).map((name,pos)=>({name,pos,camp,gold_total:6500,kill_num:2,dead_num:1,assist_num:3,equip_list:[]})))}};}
  const parsed=await post('/api/match/parse',{raw:raw()});assert.equal(parsed.patch.blue.tag,'JMES');assert.equal((await get()).playoffs.results.length,0);
  let out=await post('/api/match/apply',{raw:raw(),matchId:'api_game_1',objectives:{blue:{turrets:7,lord:2,turtle:1}}});
  assert.equal(out.playoffs.status,'applied');assert.equal(out.state.blue.turrets,7);assert.equal(out.state.playoffs.matches[0].blueScore,1);
  out=await post('/api/match/apply',{raw:raw(),matchId:'api_game_1'});assert.equal(out.playoffs.status,'duplicate');
  out=await post('/api/match/apply',{raw:raw(true),matchId:'api_game_2'});assert.equal(out.state.winner,'red');assert.equal(out.state.red.tag,'JMES');assert.equal(out.state.red.score,2);
  assert.equal(Playoffs.resolved(out.state.playoffs)[4].blue,'JMES');
  const saved=JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR,'state.json'),'utf8'));assert.equal(saved.playoffs.results.length,2);
  // A fresh capture session cannot count this completed screen a second time.
  const {session}=await post('/api/detection/start',{});
  const readings=[{field:'resultStatus',value:'DEFEAT'},{field:'gameTime',value:'16:00'},{field:'blue.kills',value:24},{field:'red.kills',value:12},...['blue','red'].flatMap(side=>out.state[side].players.map((p,i)=>({field:side+'.players.'+i+'.name',value:p.name})))];
  const detected=await post('/api/detection',{session,mode:'result',readings,live:false,switchScene:false,sampledAt:Date.now()});
  assert.equal(detected.playoffs.status,'duplicate');assert.equal((await get()).playoffs.results.length,2);
});
