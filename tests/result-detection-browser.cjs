const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const base='http://127.0.0.1:3224',child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3224',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'ml-result-detection-'))},windowsHide:true});let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1150}}),overlay=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.goto(base);await page.waitForFunction(()=>state?.scene);await overlay.goto(base+'/overlay.html');await page.click('nav [data-tab=ocr]');
    await page.evaluate(()=>{
      const canvas=document.createElement('canvas');window.resultCanvas=canvas;canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');
      function draw(){ctx.fillStyle='#061d48';ctx.fillRect(0,0,1920,1080);for(const r of LiveDetectionModel.profiles.result){let value='';
        if(r.field==='resultStatus')value='VICTORY';else if(r.field==='blue.kills')value='16';else if(r.field==='red.kills')value='22';else if(r.field==='gameTime')value='13:35';
        else{const [side,,index,key]=r.field.split('.'),i=Number(index);if(key==='name')value=(side==='blue'&&i===0)?'eendor':`Computer ${side} ${i+1}`;if(key==='kda')value=`${i+1}/${i+2}/0`;if(key==='gold')value=String(5100+i*500+(side==='red'?2000:0));}
        ctx.fillStyle=r.field.startsWith('red.')?'#8d2940':'#155b98';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${r.field==='resultStatus'?55:28}px Arial`;ctx.fillText(value,r.x+r.w/2,r.y+r.h/2);
      }}draw();window.resultInterval=setInterval(draw,50);
      navigator.mediaDevices.getDisplayMedia=async()=>canvas.captureStream(20);
    });
    await page.click('#autoDetectCapture');
    await page.waitForFunction(()=>state.scene==='postgame'&&state.winner==='blue'&&state.blue.kills===16&&state.red.kills===22&&state.gameTime==='13:35',{},{timeout:20000}).catch(async e=>{console.log('RESULT CORE DEBUG',await page.evaluate(()=>({status:document.querySelector('#detectStatus').textContent,ocr:document.querySelector('#ocrStatus').textContent,rows:document.querySelector('#ocrResults').innerText,state})));throw e;});
    await page.waitForFunction(()=>state.blue.players[0].name==='eendor'&&state.blue.players[0].gold===5100&&state.red.players[4].gold===9100,{},{timeout:20000});
    assert.equal(await overlay.locator('.winner h1').count(),1);assert.equal(await overlay.locator('.resultrow').count(),10);
    await page.click('#stopCapture');console.log('PASS result screen -> postgame, winner, kills, duration, player KDA and gold');
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
