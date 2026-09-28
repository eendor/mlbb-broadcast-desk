const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('@playwright/test');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'draft-frames-'));
const {app}=require('../server');
app.get('/fixture/:time',(req,res)=>res.sendFile(path.resolve('data/draft-video-check/frame-'+req.params.time+'.png')));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch();const report=[];
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.HeroRecognition);
  page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
  await page.evaluate(async()=>{await initWorkers();await HeroRecognition.init();});
  for(const time of (process.argv.slice(2).map(Number).length?process.argv.slice(2).map(Number):[0,90,150,180,210,270,300,310,330,350])){
   const result=await page.evaluate(async time=>{
    const img=new Image();img.src='/fixture/'+time;await img.decode();const frame=document.createElement('canvas');frame.width=1920;frame.height=1080;frame.getContext('2d').drawImage(img,0,0);
    LiveDetection.reset();document.querySelector('#ocrAutoApply').checked=false;
    const started=performance.now();
    await LiveDetection.scan({pool:workers,frame,sampledAt:Date.now(),live:false,current:()=>true,continuous:false});await LiveDetection.idle();
    return {time,ms:Math.round(performance.now()-started),status:document.querySelector('#detectStatus').textContent,rows:document.querySelector('#ocrResults').innerText};
   },time);
   report.push(result);console.log(JSON.stringify(result));
  }
 }finally{fs.writeFileSync('data/draft-video-check/frame-report.json',JSON.stringify(report,null,2));await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
