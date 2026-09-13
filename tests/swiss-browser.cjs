const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require('@playwright/test');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'swiss-browser-'));
process.env.DATA_DIR = dir;
const {app} = require('../server');
const teams = require('../public/assets/swiss-bracket-logos.json').map(t=>t.name);

(async()=>{
  const server = app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
    const panel = await context.newPage(), overlay = await context.newPage(), errors = [];
    panel.on('pageerror',e=>errors.push(e.message));overlay.on('pageerror',e=>errors.push(e.message));
    const post = async(url,data={})=>{const response=await panel.request.post(base+url,{data});const out=await response.json();assert.equal(response.status(),200,JSON.stringify(out));return out;};
    const sentinel = [{time:'19:30',blue:'Schedule untouched',red:'Original opponent',note:'Original note'}];
    await post('/api/state',{schedule:sentinel});
    await panel.goto(base);await panel.waitForFunction(()=>state?.scene);
    await panel.click('[data-tab=tournament]');
    await panel.getByRole('button',{name:'Start Swiss bracket',exact:true}).click();
    await panel.waitForSelector('.swiss-match');
    assert.equal(await panel.locator('.swiss-match').count(),8);
    await overlay.goto(base+'/overlay.html?scene=swiss');
    await overlay.waitForSelector('.swiss-bracket[data-ready=true]');
    assert.equal(await overlay.locator('[data-match-id]').count(),8);
    assert.equal(await overlay.locator('[data-swiss-live] use').count(),16);
    assert.equal(await overlay.locator('.msl-bug').count(),0);
    assert.deepEqual(await overlay.locator('[data-pool="0-0"] [data-team]').evaluateAll(nodes=>nodes.map(n=>n.dataset.team)),teams);
    await overlay.screenshot({path:'data/swiss-scene-ready.png'});
    await panel.click('[data-match="R1M1"][data-win=blue]');
    await overlay.waitForSelector('[data-match-id=R1M1] [data-side=blue][data-result=win]');
    await panel.click('[data-clear-result=R1M1]');
    await overlay.waitForSelector('[data-match-id=R1M1] [data-side=blue][data-result=pending]');
    await panel.click('#swissEditNames');
    await panel.getByLabel('Swiss team 1',{exact:true}).fill('ULS updated');
    await post('/api/state',{ticker:'Unrelated update'});
    assert.equal(await panel.getByLabel('Swiss team 1',{exact:true}).inputValue(),'ULS updated');
    await panel.getByRole('button',{name:'Save team names',exact:true}).click();
    await overlay.waitForSelector('[data-match-id=R1M1] [data-team="ULS updated"]');
    await post('/api/swiss/teams',{teams});
    await panel.click('#swissShow');
    await panel.waitForFunction(()=>state.scene==='swiss');
    const program = await context.newPage();await program.goto(base+'/overlay.html');
    await program.waitForSelector('.swiss-bracket[data-ready=true]');
    let swiss=(await (await panel.request.get(base+'/api/state')).json()).swiss;
    const counts=[];
    while(!swiss.complete) {
      for(const [i,m] of swiss.rounds.at(-1).matches.entries()) {
        const out=await post('/api/swiss/result',{matchId:m.id,winner:i%2?'red':'blue'});swiss=out.state.swiss;
        assert.deepEqual(out.state.schedule,sentinel);
      }
      const total=swiss.rounds.reduce((n,r)=>n+r.matches.length,0);
      await overlay.waitForFunction(n=>document.querySelectorAll('[data-match-id]').length===n,total);
      counts.push(total);
    }
    await overlay.waitForFunction(()=>document.querySelectorAll('[data-finish] [data-team]').length===16);
    const finishCounts = await overlay.locator('[data-finish]').evaluateAll(groups=>Object.fromEntries(groups.map(g=>[g.dataset.finish,g.querySelectorAll('[data-team]').length])));
    assert.deepEqual(finishCounts,{'3-0':2,'0-3':2,'3-1':3,'1-3':3,'3-2':3,'2-3':3});
    const overflows=await overlay.locator('[data-fit-width]').evaluateAll(nodes=>nodes.filter(n=>n.getBBox().width>Number(n.dataset.fitWidth)+1).map(n=>n.textContent));
    assert.deepEqual(overflows,[]);
    await overlay.screenshot({path:'data/swiss-scene-complete-test.png'});
    await overlay.reload();await overlay.waitForFunction(()=>document.querySelectorAll('[data-finish] [data-team]').length===16);
    const download = panel.waitForEvent('download');await panel.click('#swissDownload');
    const file=await download;await file.saveAs(path.join(dir,'updated.svg'));
    const exported=fs.readFileSync(path.join(dir,'updated.svg'),'utf8');
    assert.ok(exported.includes('data-source="swiss stage.svg"'));
    assert.ok(exported.includes('data-finish="3-2"'));
    const saved=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
    assert.equal(saved.swiss.complete,true);assert.deepEqual(saved.schedule,sentinel);
    assert.deepEqual(errors,[]);
    console.log('PASS Swiss controls, live SVG, all five rounds, 8 qualified / 8 eliminated, export, persistence, schedule unchanged:',counts);
  } finally { await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
