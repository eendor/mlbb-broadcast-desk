const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'swiss-api-'));
process.env.DATA_DIR = dir;
const {app} = require('../server');
const teams = require('../public/assets/swiss-bracket-logos.json').map(t=>t.name);

test('Swiss setup, results, advancement, names and reset leave all other production data intact',async()=>{
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  const post = async(url,data={})=>{
    const response = await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const body = await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
  };
  const withoutSwiss = ({swiss,...state})=>state;
  try {
    const baseline = await post('/api/state',{scene:'swiss',swissView:'r1-upper',schedule:[{time:'Keep this time',blue:'Original blue',red:'Original red',note:'Keep this note'}],ticker:'Operator ticker',stage:'Operator stage',game:2,bestOf:5});
    assert.deepEqual(withoutSwiss(await post('/api/swiss/start',{teams})),withoutSwiss(baseline));
    let state;
    for(let i=1;i<=8;i++) {
      ({state}=await post('/api/swiss/result',{matchId:'R1M'+i,winner:'blue'}));
      assert.deepEqual(withoutSwiss(state),withoutSwiss(baseline));
    }
    assert.equal(state.swiss.currentRound,2);
    const corrected = [...teams];corrected[0]='ULS corrected';
    assert.deepEqual(withoutSwiss(await post('/api/swiss/teams',{teams:corrected})),withoutSwiss(baseline));
    assert.deepEqual(withoutSwiss(await post('/api/swiss/clear')),withoutSwiss(baseline));
    const saved = JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
    assert.equal(saved.swiss,null);assert.deepEqual(withoutSwiss(saved),withoutSwiss(baseline));
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
