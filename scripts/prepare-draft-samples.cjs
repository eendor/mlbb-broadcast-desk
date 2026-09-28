// Labelled capture references. Pick identities are visible on the loading screen
// at 05:30; ban identities were checked against the publisher's circular head icons.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('@playwright/test');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'draft-samples-'));
const {app}=require('../server');
app.get('/fixture/:time',(req,res)=>res.sendFile(path.resolve('data/draft-video-check/frame-'+req.params.time+'.png')));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.HeroRecognition);
  const samples=await page.evaluate(async()=>{
   const samples=[],bans={blue:['Brody','Carmilla','Cici','Gloo','Paquito'],red:['Barats','Eudora','Belerick','Ling','Yi Sun-shin']};
   for(const time of [0,90,150,290,300]){
    const img=new Image();img.src='/fixture/'+time;await img.decode();const frame=document.createElement('canvas');frame.width=1920;frame.height=1080;frame.getContext('2d').drawImage(img,0,0);
    const picks=time===150?{blue:['Marcel','Atlas','Clint',null,null],red:['Kaja','Melissa',null,null,null]}:{blue:['Marcel','Atlas','Clint','Nolan','Kimmy'],red:['Kaja','Melissa','Aurora','Esmeralda','Suyou']};
    for(const r of LiveDetectionModel.profiles.draft.filter(r=>LiveDetectionModel.isHero(r.field))){
     const [side,group,i]=r.field.split('.');let hero;
     if(time===0){if(group==='bans'&&side==='blue'&&i==='0')hero='Brody';else hero=null;}
     else if(time===90){if(group==='bans')continue;hero=null;}
     else if(group==='bans'){if(time===150)continue;hero=bans[side][i];}
     else hero=picks[side][i];
     const q=HeroRecognition.query(frame,r,'draft');samples.push({hero,kind:q.kind,pixels:q.pixels,sourceTime:time});
    }
   }
   return samples;
  });
  fs.writeFileSync('public/assets/draft-reference-samples.json',JSON.stringify({source:'User supplied draft recording, 2026-09-13',samples}));console.log('Saved '+samples.length+' positive/empty/covered reference samples');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
