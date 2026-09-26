const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3216',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'ml-text-fit-'))},windowsHide:true});
 let browser;
 try{
  const base='http://127.0.0.1:3216';
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1136,height:639},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/overlay.html?preview=1');await page.waitForSelector('.broadcast-draft');
  await page.evaluate(()=>{events.close();state.blue.tag='USMADSSS';state.red.tag='USMADSSS';state.blue.name=state.red.name='UNIVERSITY CHAMPIONSHIP ESPORTS TEAM';state.event='UNIVERSITY MOBILE LEGENDS CHAMPIONSHIP';state.blue.players.forEach(p=>p.name='VeryLongPlayerName123');state.red.players.forEach(p=>p.name='VeryLongPlayerName123');state.schedule=[{time:'19:30 GMT+8',blue:'LONG TEAM NAME',red:'USMADSSS',note:'BO7'}];render();});
  const cases={draft:'.draft-center-team>b,.broadcast-player-name,.broadcast-bans>span',scoreboard:'.sb-team-label,.rail-name>b',countdown:'.broadcast-brand h1,.fixture-side>span,.standby-versus>b',intermission:'.broadcast-brand h1,.fixture-side>span',postgame:'.eg-banner-text b,.eg-team-head b,.eg-name',schedule:'.fixture>strong',sponsors:'.sponsor-show h1'};
  for(const [scene,selector] of Object.entries(cases)){
   await page.evaluate(scene=>{state.scene=scene;render();},scene);
   await page.waitForTimeout(80);
   const failures=await page.locator(selector).evaluateAll(els=>els.flatMap(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getComputedStyle(el);const scale=stage.getBoundingClientRect().width/1920;const width=r.getBoundingClientRect().width/scale;const available=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);return width>available+1?[{text:el.textContent,width,available}]:[]}));
   if(failures.length)throw Error(scene+': '+JSON.stringify(failures));
  }
  await page.evaluate(()=>{state.scene='draft';state.red.tag='ABES';render();});
  const restored=await page.locator('.draft-center-team.red>b').evaluate(el=>parseFloat(el.style.fontSize));
  if(restored!==23)throw Error('Short tag did not restore its original font size');
  await page.evaluate(()=>{state.red.tag='USMADSSS';render();});
  fs.mkdirSync('data',{recursive:true});await page.screenshot({path:'data/draft-text-fit.png'});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: draft tags, player names, rails, scoreboard, standby, results, schedule and sponsors fit at preview scale; short tags restore full size.');
 }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
