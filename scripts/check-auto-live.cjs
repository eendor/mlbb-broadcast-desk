const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-auto-check-')),base='http://127.0.0.1:3220';
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3220',DATA_DIR:dir},windowsHide:true});let browser;
  child.stderr.on('data',d=>process.stderr.write(d));
  try{
    for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1650,height:1200}});
    page.on('pageerror',e=>console.log('PAGE ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
    await page.goto(base);await page.waitForFunction(()=>state?.scene);await page.click('nav [data-tab=ocr]');
    await page.evaluate(async images=>{
      window.testImages=await Promise.all(images.map(src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;})));
      window.testMode=0;window.testCanvas=document.createElement('canvas');testCanvas.width=1920;testCanvas.height=1080;
      const ctx=testCanvas.getContext('2d');window.drawTest=()=>{ctx.fillStyle='black';ctx.fillRect(0,0,1920,1080);if(testMode>=0)ctx.drawImage(testImages[testMode],0,0,1920,1080);};drawTest();setInterval(drawTest,66);
      navigator.mediaDevices.getDisplayMedia=async()=>testCanvas.captureStream(15);
    },process.argv.slice(2).map(p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64')));
    await page.click('#autoDetectCapture');
    for(let i=0;i<16;i++){
      await page.waitForTimeout(1000);const info=await page.evaluate(()=>({status:document.querySelector('#detectStatus').textContent,cycle:document.querySelector('#ocrSpeed').textContent,phase:state.phase,scene:state.scene,rows:document.querySelector('#ocrResults').innerText}));
      console.log('DRAFT',i,JSON.stringify({...info,rows:undefined}));if(info.rows&&info.status.includes('readings'))break;
    }
    await page.screenshot({path:'data/auto-draft-check.png',fullPage:true});
    await page.evaluate(()=>testMode=1);
    for(let i=0;i<16;i++){
      await page.waitForTimeout(1000);const info=await page.evaluate(()=>({status:document.querySelector('#detectStatus').textContent,cycle:document.querySelector('#ocrSpeed').textContent,clock:state.gameTime,scene:state.scene,rows:document.querySelector('#ocrResults').innerText}));
      console.log('GAME',i,JSON.stringify({...info,rows:undefined}));if(info.status.includes('readings')&&info.scene==='scoreboard'&&i>5)break;
    }
    await page.screenshot({path:'data/auto-game-check.png',fullPage:true});
    await page.evaluate(()=>stopLoop());await page.waitForFunction(()=>!ocrBusy);
    console.log('FINAL CAPTURE',JSON.stringify(await page.evaluate(()=>({scene:state.scene,phase:state.phase,clock:state.gameTime,blue:{kills:state.blue.kills,gold:state.blue.gold,bans:state.blue.bans},red:{kills:state.red.kills,gold:state.red.gold,bans:state.red.bans},rows:document.querySelector('#ocrResults').innerText}))));
    for(const field of ['blue.kills','blue.gold','blue.turrets']){const b64=await page.evaluate(field=>crop(LiveDetection.regions('game').find(r=>r.field===field)).canvas.toDataURL().split(',')[1],field);fs.writeFileSync('data/crop-'+field+'.png',Buffer.from(b64,'base64'));}
    await page.click('#stopCapture');
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
