const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'third-place-'));
 fs.copyFileSync('data/state.json',path.join(dir,'state.json'));
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3224',DATA_DIR:dir},windowsHide:true});
 const base='http://127.0.0.1:3224'; let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const update=async patch=>{const r=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});assert.equal(r.status,200);return r.json();};
  let s=await (await fetch(base+'/api/state')).json();
  s.blue.players[0].hero='Miya';s.blue.players[1].hero='Layla';
  await update({scene:'draft',blue:s.blue,mvp:{totalGold:'10619',name:s.blue.players[0].name,hero:'Miya',kda:'9/4/12',kp:'91%',items:['','','','','',''],emblems:['','','',''],spell:''}});
  browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1600,height:1000}}); const errors=[];
  page.on('pageerror',e=>errors.push(e.message)); await page.goto(base);await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('connected'));
  await page.click('nav [data-tab="cameras"]');assert(await page.locator('#cameras').isVisible());
  await page.click('#showPlayerCameras');await page.waitForFunction(()=>state.scene==='cameras');
  await page.click('nav [data-tab="teams"]');
  await page.locator('[data-draft-slot="blue.0"]').dragTo(page.locator('[data-draft-slot="blue.1"]'));
  await page.waitForFunction(()=>state.blue.players[1].hero==='Miya');
  assert.equal(await page.locator('[data-player="blue.1.name"]').inputValue(),s.blue.players[0].name);
  await page.selectOption('#draftSwapMode','hero');
  await page.locator('[data-draft-slot="blue.0"]').dragTo(page.locator('[data-draft-slot="blue.1"]'));
  await page.waitForFunction(()=>state.blue.players[0].hero==='Miya');
  assert.equal(await page.locator('[data-player="blue.1.name"]').inputValue(),s.blue.players[0].name);
  await update({scene:'draft'});
  await page.click('nav [data-tab="desk"]');
  const preview=page.frameLocator('iframe').first();
  await preview.locator('[data-draft-slot="blue.0"]').dragTo(preview.locator('[data-draft-slot="blue.1"]'));
  await page.waitForFunction(()=>state.blue.players[1].hero==='Miya');
  const output=await browser.newPage({viewport:{width:1920,height:1080}});output.on('pageerror',e=>errors.push(e.message));
  await output.goto(base+'/overlay.html?scene=cameras');await output.waitForSelector('#camera-holes',{state:'attached'});assert.equal(await output.locator('#camera-holes rect').count(),3);await output.screenshot({path:'data/third-place-cameras.png',omitBackground:true});
  await output.goto(base+'/overlay.html?scene=draft');await output.waitForSelector('.broadcast-pick');assert.equal(await output.locator('[data-clock="draftTimer"]').count(),0);await output.screenshot({path:'data/third-place-draft.png',omitBackground:true});
  await output.goto(base+'/overlay.html?scene=mvp');await output.waitForSelector('.mvp-scene');assert.equal(await output.locator('[data-mvp-stat="totalGold"] b').textContent(),'10619');assert.equal(await output.locator('.mvp-spell img,.mvp-emblem img,.mvp-item:not(.mvp-empty)').count(),0);
  await output.goto(base+'/overlay.html?scene=scoreboard');await output.waitForSelector('.sb-broadcast-panel');assert.equal(await output.locator('.sb-casters').count(),0);
  await output.goto(base+'/overlay.html?scene=postgame');await output.waitForSelector('.mpl-player-row');assert.equal(await output.locator('.mpl-spell-badge img,.mpl-main-emblem img,.mpl-item-slot img').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: camera scene, player+hero and hero-only swaps, Total Gold, no draft clock/casters, unknown loadouts blank.');
 }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
