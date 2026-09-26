const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
function createCutout(projectDir,dataDir){
  const pending=new Map();let queue=Promise.resolve();
  return function cutout(src){
    if(!/^\/assets\/(uploads\/[a-f0-9]{64}\.(png|jpe?g|webp)|playoffs\/portraits\/[a-f0-9]{24}\.jpg)$/.test(src))return Promise.reject(Error('Choose an uploaded photo or a playoff portrait'));
    const input=path.join(projectDir,'public',src);if(!fs.existsSync(input))return Promise.reject(Error('Player photo is missing'));
    const name=crypto.createHash('sha256').update(src+':cutout-v2').digest('hex')+'.png';
    const output=path.join(projectDir,'public/assets/uploads',name),url='/assets/uploads/'+name;
    if(fs.existsSync(output))return Promise.resolve({url,cutout:true,cached:true});
    if(pending.has(src))return pending.get(src);
    const job=queue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
      const python=process.env.PHOTO_PYTHON||path.join(projectDir,'data/ocr-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
      const executable=fs.existsSync(python)?python:(process.platform==='win32'?'python':'python3');
      fs.mkdirSync(path.dirname(output),{recursive:true});
      execFile(executable,[path.join(projectDir,'scripts/remove-bg.py'),input,output],{timeout:180000,windowsHide:true},(error,stdout,stderr)=>{
        if(error||!fs.existsSync(output)){console.error('Player cutout:',stderr||error?.message);reject(Error(/ModuleNotFoundError/.test(stderr||'')?'Photo background removal needs the rembg Python dependencies.':'Photo background removal failed. Retry the photo.'));}
        else resolve({url,cutout:true,cached:false});
      });
    })).finally(()=>pending.delete(src));
    queue=job;pending.set(src,job);return job;
  };
}
module.exports={createCutout};
