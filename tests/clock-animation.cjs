const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const base='http://127.0.0.1:3223',child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3223',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'ml-clock-animation-'))},windowsHide:true});let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.goto(base+'/overlay.html?scene=scoreboard');await page.waitForSelector('.sb-center');await page.waitForTimeout(900);
    const result=await page.evaluate(()=>{
      events.close();const animations=[],original=Element.prototype.animate;
      Element.prototype.animate=function(...args){animations.push(this.className);return original.apply(this,args);};
      for(let seconds=60;seconds<64;seconds++){state.gameTime='01:0'+(seconds-60);state.gameClock={running:true,seconds,syncedAt:Date.now()-5000};render();}
      const clock=document.querySelector('.sb-center>strong').textContent;
      state.blue.kills++;render();
      const kill=document.querySelector('.sb-kills.blue');
      return {clock,animations,clockAnimations:document.querySelector('.sb-center').getAnimations().length,killAnimation:getComputedStyle(kill.querySelector('.sb-value-current')).animationName,sweep:getComputedStyle(kill,'::after').animationName};
    });
    assert.equal(result.clock,'01:08');assert.equal(result.clockAnimations,0);
    assert.equal(result.animations.includes('sb-center'),false);
    assert.equal(result.killAnimation,'sb-value-in','Kill edits roll the new value into place');
    assert.equal(result.sweep,'sb-score-sweep','Kill panels highlight the update without moving');
    console.log('PASS: clock updates in place, renders current elapsed time immediately, and kill edits still animate');
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
