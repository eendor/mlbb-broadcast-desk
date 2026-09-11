const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('independent player deliveries preserve the newer clock and reject stale fields',async t=>{
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ml-detection-delivery-'));
  const {app}=require('../server');
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  async function post(url,data){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
  const {session}=await post('/api/detection/start',{}),now=Date.now();
  const send=(sampledAt,readings,rest={})=>post('/api/detection',{session,mode:'game',sampledAt,readings,live:true,switchScene:true,...rest});
  await send(now,[{field:'gameTime',value:'01:47'}]);
  await send(now-500,[{field:'blue.players.1.name',value:'[Computer] Aurora'},{field:'blue.players.1.kda',value:'3/1/2'}],{live:false,switchScene:false});
  let state=await (await fetch(base+'/api/state')).json();
  assert.equal(state.blue.players[1].name,'[Computer] Aurora');assert.equal(state.blue.players[1].kda,'3/1/2');
  assert.equal(state.gameTime,'01:47');assert.equal(state.gameClock.running,true);assert.equal(state.gameClock.syncedAt,now);
  await send(now-250,[{field:'gameTime',value:'01:46'},{field:'blue.gold',value:12000}]);
  state=await (await fetch(base+'/api/state')).json();
  assert.equal(state.gameTime,'01:47');assert.equal(state.blue.gold,12000);
  await send(now-750,[{field:'blue.players.1.name',value:'[Computer] Aurora'},{field:'blue.players.1.kda',value:'1/0/0'}]);
  state=await (await fetch(base+'/api/state')).json();assert.equal(state.blue.players[1].kda,'3/1/2');
  const oldResult=await send(now-1000,[{field:'resultStatus',value:'VICTORY'}],{mode:'result'});
  assert.equal(oldResult.stale,true);state=await (await fetch(base+'/api/state')).json();assert.equal(state.scene,'scoreboard');
});
