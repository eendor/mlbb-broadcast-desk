const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3217',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'ml-logos-'))},windowsHide:true});let browser;
 try{
 const base='http://127.0.0.1:3217';for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/overlay.html');await page.waitForSelector('.broadcast-draft');
 const mapping=JSON.parse(fs.readFileSync('public/assets/logo-transparency.json'));
 await page.evaluate(async mapping=>{
 events.close();const host=document.createElement('div');document.body.append(host);
 for(const original of Object.keys(mapping)){const img=document.createElement('img');img.src=original;host.append(img);}
 await new Promise(r=>setTimeout(r,1000));
 for(const img of host.children){if(!img.getAttribute('src').startsWith('/assets/logos-transparent/')||!img.complete||!img.naturalWidth)throw Error('Logo failed: '+img.src);}
 host.remove();state.blue.logo='/assets/logos/ULS.jpg';state.red.logo='/assets/logos/TRIMMOC%20.jpeg';
 for(const scene of ['draft','scoreboard','countdown','intermission']){state.scene=scene;render();await new Promise(r=>setTimeout(r,100));const logos=[...stage.querySelectorAll('img')].filter(img=>img.src.includes('/logos'));if(logos.length<2||logos.some(img=>!img.src.includes('/logos-transparent/')||!img.naturalWidth))throw Error(scene+' uses original logo');}
 },mapping);
 await page.goto(base+'/');await page.waitForTimeout(400);
 await page.evaluate(async()=>{const img=document.createElement('img');img.src='/assets/logos/ULS.jpg';document.body.append(img);await new Promise(r=>setTimeout(r,200));if(!img.src.includes('/logos-transparent/')||!img.naturalWidth)throw Error('Control panel logo failed');});
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: all 41 transparent logos load; saved logo URLs resolve in control panel and four team-logo scenes.');
 }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
