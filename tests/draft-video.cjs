// Real recording regression. Run with the user's local MP4 path as the argument.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const videoPath=path.resolve(process.argv[2]||'D:/Downloads/2026-09-13 19-54-22.mp4');
if(!fs.existsSync(videoPath))throw Error('Pass the local draft recording path to this test');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-draft-video-'));process.env.DATA_DIR=dir;
const {app}=require('../server');
app.get('/fixture/:time',(req,res)=>res.sendFile(path.join(dir,'frame-'+req.params.time+'.png')));
const picks={blue:['Marcel','Atlas','Clint','Nolan','Kimmy'],red:['Kaja','Melissa','Aurora','Esmeralda','Suyou']};
const bans={blue:['Brody','Carmilla','Cici','Gloo','Paquito'],red:['Barats','Eudora','Belerick','Ling','Yi Sun-shin']};
(async()=>{
 for(const time of [0,90,150,180,190,310]){
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(time),'-i',videoPath,'-frames:v','1','-y',path.join(dir,'frame-'+time+'.png')],{windowsHide:true,encoding:'utf8'});
  if(r.status!==0)throw Error(r.stderr||r.error?.message||'Frame extraction failed');
 }
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),output=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));output.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>state?.scene);await page.click('nav [data-tab=ocr]');
  const sentinel=[{time:'19:00',blue:'Unchanged',red:'Schedule',note:'Original schedule'}];
  await page.request.post(base+'/api/state',{data:{scene:'ads',schedule:sentinel}});
  await output.goto(base+'/overlay.html');
  await page.evaluate(async()=>{await initWorkers();await HeroRecognition.init();document.querySelector('#ocrAutoApply').checked=true;});
  const feed=async(time,count=3)=>page.evaluate(async({time,count})=>{
   const img=new Image();img.src='/fixture/'+time;await img.decode();const frame=document.createElement('canvas');frame.width=1920;frame.height=1080;frame.getContext('2d').drawImage(img,0,0);
   const started=performance.now();
   for(let i=0;i<count;i++){await LiveDetection.scan({pool:workers,frame,sampledAt:Date.now(),live:false,current:()=>true,continuous:true});await LiveDetection.idle();}
   return {ms:Math.round(performance.now()-started),status:document.querySelector('#detectStatus').textContent,rows:document.querySelector('#ocrResults').innerText};
  },{time,count});
  const current=async()=> (await page.request.get(base+'/api/state')).json();
  await feed(0);let state=await current();assert.equal(state.blue.bans[0],'Brody');assert.ok(state.blue.players.every(p=>!p.hero));assert.equal(state.phase,'Enemy Team Ban');assert.equal(state.draftTimer.remaining,21);
  await feed(90);state=await current();assert.ok(state.blue.players.every(p=>!p.hero));assert.equal(state.blue.bans[2],'Cici');
  await feed(150);state=await current();assert.deepEqual(state.blue.players.map(p=>p.hero),['Marcel','Atlas','Clint','','']);assert.deepEqual(state.red.players.map(p=>p.hero),['Kaja','Melissa','','','']);
  await feed(190);state=await current();assert.equal(state.red.players[2].hero,'Aurora','Windowed capture must normalize to the same calibration');assert.equal(state.red.bans[3],'Ling');
  const final=await feed(310);state=await current();
  for(const side of ['blue','red']){assert.deepEqual(state[side].players.map(p=>p.hero),picks[side]);assert.deepEqual(state[side].bans,bans[side]);}
  assert.equal(state.phase,'Last Changes');assert.equal(state.draftTimer.remaining,6);
  await output.waitForFunction(()=>document.querySelectorAll('.broadcast-pick[data-hero]').length===10&&state.red.players[4].hero==='Suyou');
  // Default state has no later-round context, so the draft shows 3 bans per side.
  assert.equal(await output.locator('.broadcast-ban').count(),6);
  await output.waitForFunction(()=>[...document.querySelectorAll('.broadcast-ban img,.broadcast-pick img')].every(img=>img.complete&&img.naturalWidth>0));
  await output.screenshot({path:'data/draft-video-final.png'});
  // A system volume panel covering the anchor must hold the last valid state.
  await feed(180);let held=await current();for(const side of ['blue','red'])assert.deepEqual(held[side].players.map(p=>p.hero),picks[side]);
  assert.deepEqual(held.schedule,sentinel);
  // Exercise the actual local MP4 input and continuous video pipeline.
  await page.evaluate(()=>LiveDetection.stop());
  await page.setInputFiles('#ocrClip',videoPath);await page.waitForFunction(()=>video.readyState>=2);
  await page.evaluate(async()=>{video.pause();video.currentTime=303;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));await video.play();});
  await page.click('#autoOcr');
  await page.waitForFunction(()=>state.phase==='Last Changes'&&state.draftTimer.endAt!==null,{},{timeout:15000});
  const first=await current();
  await page.waitForFunction(previous=>state.draftTimer.remaining<previous,first.draftTimer.remaining,{timeout:8000});
  await page.click('#stopCapture');await page.waitForFunction(()=>state.draftTimer.endAt===null);
  assert.equal(await page.evaluate(()=>ocrLoop),false);assert.deepEqual((await current()).schedule,sentinel);
  // Catalog artwork is used for result items even if a saved match contains remote URLs.
  const assets=require('../lib/asset-library').load(),[heroId,hero]=Object.entries(assets.heroes)[0],[itemId,item]=Object.entries(assets.items).find(([,i])=>i.icon);
  const s=await current();s.blue.players[0]={...s.blue.players[0],heroId:Number(heroId),heroIcon:'https://invalid.test/old.jpg',items:[{id:Number(itemId),name:item.name,icon:'https://invalid.test/old-item.png'}]};
  await page.request.post(base+'/api/state',{data:{scene:'postgame',blue:{players:s.blue.players}}});
  await output.waitForSelector('.result-items img');assert.equal(await output.locator('.result-items img').first().getAttribute('src'),item.icon);
  assert.deepEqual(errors,[]);
  console.log('PASS real draft footage: early/late bans, pending and covered slots, five picks, round-based ban slots, window normalization, red countdown, MP4 playback -> API -> OBS, stop/freeze, local result artwork and schedule preservation. Final frame, three reads: '+final.ms+' ms.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
