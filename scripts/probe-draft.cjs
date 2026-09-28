const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('@playwright/test');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'draft-probe-'));
const {app}=require('../server');
app.get('/fixture/:time',(req,res)=>res.sendFile(path.resolve('data/draft-video-check/frame-'+req.params.time+'.png')));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.HeroRecognition);
  const result=await page.evaluate(async()=>{
   const img=new Image();img.src='/fixture/290';await img.decode();const frame=document.createElement('canvas');frame.width=1920;frame.height=1080;frame.getContext('2d').drawImage(img,0,0);
   const rows=[];for(const side of ['blue','red'])for(let i=0;i<5;i++){
    rows.push({field:`${side}.players.${i}.hero`,x:side==='blue'?60:1746,y:145+i*172,w:114,h:114});
    rows.push({field:`${side}.bans.${i}`,x:side==='blue'?42+i*110:1826-i*110,y:18,w:54,h:54});
   }
   const queries=rows.map(r=>HeroRecognition.query(frame,r,'draft'));
   return {matches:await HeroRecognition.match(queries),queries};
  });
  fs.writeFileSync('data/draft-video-check/probe.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.matches,null,2));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
