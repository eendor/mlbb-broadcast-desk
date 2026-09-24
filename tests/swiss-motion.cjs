const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('@playwright/test');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'swiss-motion-'));
const {app}=require('../server');
const teams=require('../public/assets/swiss-bracket-logos.json').map(t=>t.name);
(async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try {
    const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'no-preference'});
    const output=await context.newPage(),panel=await context.newPage(),errors=[];
    output.on('pageerror',error=>errors.push(error.message));panel.on('pageerror',error=>errors.push(error.message));
    const post=async(url,data)=>{const r=await output.request.post(base+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
    await post('/api/swiss/start',{teams});
    await output.goto(base+'/overlay.html?scene=swiss');await output.waitForSelector('.swiss-bracket[data-ready=true]');
    assert.equal(await output.locator('[data-swiss-flight]').count(),0);
    const original=await output.locator('[data-slot="R1M1/blue"] use').boundingBox();assert.ok(original.width>65,'Overview logo should exceed 65px');
    assert.equal(await output.locator('#swiss-logo-7 image').getAttribute('data-source'),'/assets/logos/DEVCOM.png');
    await output.screenshot({path:'data/swiss-large-overview.png'});
    await panel.goto(base+'/#tournament');await panel.waitForSelector('#swissView');
    await panel.selectOption('#swissView','r1-upper');
    await output.waitForSelector('.swiss-bracket[data-view="r1-upper"]');
    await output.waitForFunction(()=>!document.querySelector('.swiss-bracket').dataset.camera);
    const enlarged=await output.locator('[data-slot="R1M1/blue"] use').boundingBox();assert.ok(enlarged.height>150,'Close-up logos should exceed 150px');
    await output.screenshot({path:'data/swiss-large-closeup.png'});
    await output.reload();await output.waitForSelector('.swiss-bracket[data-view="r1-upper"][data-ready=true]');
    await panel.selectOption('#swissView','overview');
    await output.waitForFunction(()=>document.querySelector('.swiss-bracket').dataset.view==='overview'&&!document.querySelector('.swiss-bracket').dataset.camera);
    // Batch a completed round into one render, then watch all sixteen arrivals.
    await output.evaluate(()=>events.close());
    let next;
    for(let i=1;i<=8;i++)next=(await post('/api/swiss/result',{matchId:'R1M'+i,winner:'blue'})).state.swiss;
    await output.evaluate(async swiss=>{
      window.flightsSeen=[];window.maxFlights=0;
      new MutationObserver(()=>{
        const flights=[...document.querySelectorAll('[data-swiss-flight]')];maxFlights=Math.max(maxFlights,flights.length);
        for(const f of flights)if(flightsSeen.at(-1)?.team!==f.dataset.flightTeam)flightsSeen.push({team:f.dataset.flightTeam,at:performance.now()});
      }).observe(document.querySelector('.swiss-bracket'),{subtree:true,childList:true});
      await SwissBracket.update(document.querySelector('.swiss-bracket'),swiss);
    },next);
    await output.waitForSelector('[data-swiss-flight]');
    assert.equal(await output.locator('[data-swiss-flight]').count(),1);
    await output.evaluate(swiss=>SwissBracket.update(document.querySelector('.swiss-bracket'),swiss),next);
    const snapshot=await output.evaluate(()=>SwissBracket.serialize(document.querySelector('.swiss-bracket')));
    assert.ok(snapshot.includes('width="3840"'));assert.ok(!snapshot.includes('data-swiss-flight'));
    await output.screenshot({path:'data/swiss-advancing.png'});
    await output.waitForFunction(()=>!document.querySelector('[data-swiss-motion]'),{},{timeout:30000});
    const motion=await output.evaluate(()=>({max:maxFlights,seen:flightsSeen}));
    assert.equal(motion.max,1,'Only one team may fly at a time');assert.equal(motion.seen.length,16);
    assert.ok(motion.seen.slice(1).every((f,i)=>f.at-motion.seen[i].at>=950),'Each flight waits for the previous team');
    assert.ok(await output.locator('[data-slot]').evaluateAll(slots=>slots.every(slot=>getComputedStyle(slot).opacity!=='0')));
    // Reconnect for rapid result delivery and the rest of the live checks.
    await output.reload();await output.waitForSelector('.swiss-bracket[data-ready=true]');
    let state=await (await output.request.get(base+'/api/state')).json();
    for(const match of state.swiss.rounds.at(-1).matches)await post('/api/swiss/result',{matchId:match.id,winner:'blue'});
    await output.waitForSelector('[data-match-id=R3M1]');
    await output.waitForFunction(()=>!document.querySelector('[data-swiss-motion]'));
    await post('/api/swiss/result',{matchId:'R3M1',winner:'blue'});
    await output.waitForFunction(()=>document.querySelector('[data-finish="3-0"] [data-team]')&&document.querySelector('[data-swiss-flight]'));
    // A rapid second result must finish the previous movement without leaving hidden slots.
    await post('/api/swiss/result',{matchId:'R3M2',winner:'red'});
    await output.waitForFunction(()=>document.querySelectorAll('[data-finish="3-0"] [data-team]').length===2&&!document.querySelector('[data-swiss-motion]'));
    assert.ok(await output.locator('[data-slot]').evaluateAll(slots=>slots.every(slot=>getComputedStyle(slot).opacity!=='0')));
    await output.emulateMedia({reducedMotion:'reduce'});
    await post('/api/swiss/result',{matchId:'R3M7',winner:'blue'});
    await output.waitForSelector('[data-slot="R3M7/blue"][data-result=win]');
    assert.equal(await output.locator('[data-swiss-flight]').count(),0);
    await output.setViewportSize({width:3840,height:2160});
    await output.waitForFunction(()=>document.querySelector('.swiss-bracket>svg').getBoundingClientRect().width===3840);
    const dimensions=await output.locator('.swiss-bracket>svg').boundingBox();assert.equal(dimensions.width,3840);assert.equal(dimensions.height,2160);
    assert.equal(await output.locator('#stage').evaluate(el=>el.style.transform),'none');
    await output.screenshot({path:'data/swiss-native-4k.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS larger logos, one-at-a-time movement, close-ups and persistence, original DEVCOM file, advancing-team motion, interruption cleanup, reduced motion, 4K rendering/export.');
  } finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
