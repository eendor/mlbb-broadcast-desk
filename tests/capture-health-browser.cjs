/* Verifies the capture health gate with a real browser and a real MediaStream.
 *
 * Chromium is fed a looping Y4M that is 3s of pure black followed by 3s of
 * moving test content. The desk must refuse to treat the black stretch as a
 * live game frame, must keep the last confirmed statistics, and must recover
 * on its own once real frames arrive again.
 */
const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Y4M=process.env.MLBB_CAPTURE_Y4M||'C:/Users/Rodnee/AppData/Local/Temp/opencode/mlbb/capture.y4m';

(async()=>{
  if(!fs.existsSync(Y4M))throw Error('Missing test capture video: '+Y4M);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-capture-health-'));
  const base='http://127.0.0.1:3221';
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'3221',DATA_DIR:dir},windowsHide:true});
  let browser;
  try{
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    // Seed a confirmed statistic so we can prove it survives the blackout.
    await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({blue:{kills:7}})});

    browser=await chromium.launch({args:[
      '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${Y4M}`,'--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage({viewport:{width:1600,height:1100},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.waitForFunction(()=>state?.scene);
    await page.click('nav [data-tab=ocr]');

    // The camera path uses getUserMedia, which the fake device satisfies.
    await page.selectOption('#captureSurface','camera');
    await page.selectOption('#captureCursor','never');
    await page.click('#capture');
    await page.waitForFunction(()=>document.querySelector('#captureVideo')?.srcObject!=null,{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#captureVideo')?.videoWidth>0,{timeout:15000});

    await page.click('#autoOcr');
    // The 6s clip loops, so both the blackout and the recovery must be seen.
    await page.waitForFunction(()=>{
      const el=document.querySelector('#captureHealth');
      return el && !el.hidden && /paused/i.test(el.textContent);
    },{timeout:30000});
    const paused=await page.textContent('#captureHealth');
    const speedDuringPause=await page.textContent('#ocrSpeed');

    // A black stretch must not be published as a fresh game reading.
    const stateDuringPause=await (await fetch(base+'/api/state')).json();
    if(stateDuringPause.blue.kills!==7)throw Error('Black frame changed confirmed statistics');

    await page.waitForFunction(()=>{
      const el=document.querySelector('#captureHealth');
      return (!el || el.hidden) && /recovered|resumed/i.test(document.querySelector('#ocrStatus')?.textContent||'');
    },{timeout:40000});

    const banner=await page.evaluate(()=>{
      const el=document.querySelector('#captureHealth');
      return {hidden:el.hidden,text:el.textContent};
    });
    if(!banner.hidden)throw Error('Capture problem banner did not clear after recovery: '+banner.text);

    if(errors.length)throw Error(errors.join('\n'));
    console.log('PASS '+JSON.stringify({pausedBanner:paused.trim().slice(0,90),healthLine:speedDuringPause,recovered:true,killsPreserved:stateDuringPause.blue.kills}));
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1});
