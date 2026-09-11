const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-live-detection-')),base='http://127.0.0.1:3221';
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3221',DATA_DIR:dir},windowsHide:true});let browser;const errors=[];
  child.stderr.on('data',d=>{if(!String(d).includes('Invalid'))errors.push(String(d));});
  try{
    for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1150},reducedMotion:'reduce'}),overlay=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));overlay.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.waitForFunction(()=>state?.scene);await overlay.goto(base+'/overlay.html');
    await page.click('nav [data-tab=ocr]');
    await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');window.fixtureCanvas=canvas;canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');window.fixtureMode='game';window.fixtureKills=4;window.fixtureClock=107;window.fixtureBlueGold=12400;
      function draw(){
        ctx.fillStyle='#14293d';ctx.fillRect(0,0,1920,1080);if(fixtureMode==='unknown')return;
        const order=[2,0,1,3,4];
        for(const r of [...LiveDetectionModel.profiles[fixtureMode]].sort((a,b)=>Number(LiveDetectionModel.isHero(b.field))-Number(LiveDetectionModel.isHero(a.field)))){
          ctx.fillStyle='#102036';ctx.fillRect(r.x,r.y,r.w,r.h);const p=r.field.split('.'),side=p[0]==='red'?1:0,row=Number(p[2]),i=order[row];
          if(LiveDetectionModel.isHero(r.field))continue;
          let text='';if(r.field==='gameTime')text='01:'+String(fixtureClock-60).padStart(2,'0');
          else if(p[1]==='kills')text=String(side?2:fixtureKills);else if(p[1]==='gold')text=side?'11400':String(fixtureBlueGold);else if(p[1]==='turrets')text='3';
          else if(p[3]==='name')text=(side?'Bravo':'Alpha')+' '+(i+1);else if(p[3]==='kda')text=(i+1)+'/1/2';else if(p[3]==='level')text='7';
          ctx.fillStyle='white';ctx.textBaseline='middle';ctx.textAlign='center';let font=Math.min(r.h*.88,32);ctx.font=`bold ${font}px Arial`;while(ctx.measureText(text).width>r.w-4&&font>9){font--;ctx.font=`bold ${font}px Arial`;}ctx.fillText(text,r.x+r.w/2,r.y+r.h/2);
        }
      }
      window.paintFixture=draw;draw();window.fixtureInterval=setInterval(draw,50);
      navigator.mediaDevices.getDisplayMedia=async()=>canvas.captureStream(20);
    });
    const started=performance.now();await page.click('#autoDetectCapture');
    await page.waitForFunction(()=>state.scene==='scoreboard'&&state.blue.kills===4&&state.red.kills===2&&state.blue.gold===12400&&state.red.gold===11400&&state.gameTime==='01:47',{},{timeout:15000});
    assert.equal(await overlay.locator('.player-rail').count(),0);
    const editStart=performance.now();await page.evaluate(()=>{fixtureKills=5;fixtureClock=108;paintFixture();});
    await overlay.waitForFunction(()=>document.querySelector('.sb-kills.blue')?.textContent==='5'&&state.gameTime==='01:48',{},{timeout:10000});
    const liveUpdateMs=Math.round(performance.now()-editStart);
    await page.evaluate(()=>{fixtureClock=109;paintFixture();});
    await overlay.waitForFunction(()=>state.gameTime==='01:49',{},{timeout:5000});
    await page.evaluate(()=>LiveDetection.idle());
    // Starting a fresh capture is a new statistics baseline. A lower valid gold
    // value must replace the previous session instead of being held forever.
    await page.click('#stopCapture');
    await page.evaluate(()=>{fixtureBlueGold=9100;paintFixture();});
    await page.click('#autoDetectCapture');
    await page.waitForFunction(()=>state.blue.gold===9100,{},{timeout:15000}).catch(async e=>{console.log('RECAPTURE DEBUG',await page.evaluate(()=>({status:document.querySelector('#detectStatus').textContent,rows:document.querySelector('#ocrResults').innerText,blueGold:state.blue.gold})));throw e;});
    await page.uncheck('#detectSwitchScene');await page.request.post(base+'/api/state',{data:{scene:'ads'}});await page.waitForTimeout(2000);assert.equal(await page.evaluate(()=>state.scene),'ads');
    await page.evaluate(()=>{fixtureMode='unknown';paintFixture();});await page.waitForFunction(()=>!state.gameClock.running,{},{timeout:8000});
    const held=await page.evaluate(()=>({kills:state.blue.kills,heroes:state.blue.players.map(p=>p.hero)}));await page.waitForTimeout(1200);assert.deepEqual(await page.evaluate(()=>({kills:state.blue.kills,heroes:state.blue.players.map(p=>p.hero)})),held);
    // Invalidated sessions cannot publish even if a delayed recognition finishes.
    const first=await (await page.request.post(base+'/api/detection/start',{data:{}})).json();
    const second=await (await page.request.post(base+'/api/detection/start',{data:{}})).json();
    const stale=await (await page.request.post(base+'/api/detection',{data:{session:first.session,mode:'game',readings:[{field:'blue.kills',value:99}],sampledAt:Date.now(),live:true,switchScene:true}})).json();assert.equal(stale.expired,true);
    await page.request.post(base+'/api/detection/stop',{data:{session:second.session}});await page.click('#stopCapture');
    assert.equal(await page.evaluate(()=>ocrLoop),false);assert.equal(await page.evaluate(()=>state.blue.kills),5);
    const sample=await page.evaluate(async()=>{
      const blank={field:'blue.players.0.hero',kind:'gameHero',pixels:Array(1024).fill(0)};
      if((await HeroRecognition.match([blank]))[0].value!==null)throw Error('Blank portrait was recognized');
      let seed=812;const pixels=Array.from({length:1024},(_,i)=>{seed=(seed*1664525+1013904223)>>>0;return i%4===3?255:seed>>>24;});
      const q={...blank,pixels};await HeroRecognition.learn(q,'Akai');return {match:(await HeroRecognition.match([q]))[0].value,saved:JSON.parse(localStorage.getItem('liveHeroSamples')).length};
    });assert.equal(sample.match,'Akai');assert.equal(sample.saved,1);
    // Stop also cancels a capture chooser that has not resolved yet.
    await page.evaluate(()=>navigator.mediaDevices.getDisplayMedia=()=>new Promise(resolve=>window.resolveFixtureCapture=resolve));
    await page.click('#autoDetectCapture');await page.waitForFunction(()=>!!window.resolveFixtureCapture);await page.click('#stopCapture');
    await page.evaluate(()=>{window.canceledCapture=fixtureCanvas.captureStream(20);resolveFixtureCapture(canceledCapture);});
    await page.waitForFunction(()=>!document.querySelector('#autoDetectCapture').disabled);
    assert.equal(await page.evaluate(()=>canceledCapture.getTracks().every(t=>t.readyState==='ended')&&!ocrLoop&&stream===null),true);
    const screenshot='data/live-auto-detection-ui.png';fs.mkdirSync('data',{recursive:true});await page.screenshot({path:screenshot,fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS live video -> scoreboard -> OBS, changing score/clock, recapture baseline, unknown HUD hold, stop and expired-session rejection. Initial update: '+Math.round(performance.now()-started)+' ms; live update: '+liveUpdateMs+' ms');
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
