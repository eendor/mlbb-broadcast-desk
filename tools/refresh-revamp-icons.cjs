const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve('D:/Desktop/OBS Mobile Legends ML Setup');
const dest=path.join(root,'public/assets/mlbb-cdn');
const catalogPath=path.join(root,'public/assets/catalog.json');
const recogPath=path.join(root,'public/assets/hero-recognition.json');
const heroIconsDir=path.join(root,'public/assets/hero-icons');
const wikiHeroDir=path.join(root,'public/assets/wiki/heroes');
const key=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const TARGET=new Set(['masha','clint','paquito','brody','badang','bruno','kadita']);

function picture(url, assets){
  if(!url)return null;
  const u=new URL(url.startsWith('//')?'https:'+url:url);
  if(u.protocol!=='https:'||u.hostname!=='akmweb.youngjoygame.com'||!/[.](png|jpe?g|webp)$/i.test(u.pathname))return null;
  const file=crypto.createHash('sha256').update(u.href).digest('hex').slice(0,20)+path.extname(u.pathname).toLowerCase();
  const local='/assets/mlbb-cdn/'+file;
  assets.set(u.href,{url:u.href,path:local,file:path.join(root,'public',local)});
  return local;
}

async function download(entry){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(entry.url,{signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw Error('HTTP '+r.status);
      const bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length<100||bytes.length>20000000)throw Error('bad size '+bytes.length);
      const ok=(bytes[0]===255&&bytes[1]===216)||(bytes.subarray(1,4).toString()==='PNG')||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
      if(!ok)throw Error('not image');
      fs.mkdirSync(path.dirname(entry.file),{recursive:true});
      fs.writeFileSync(entry.file,bytes);
      entry.bytes=bytes.length;
      return entry;
    }catch(e){if(attempt===2)throw e;}
  }
}

(async()=>{
  const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));
  const recognition=JSON.parse(fs.readFileSync(recogPath,'utf8').replace(/^\uFEFF/,''));
  const r=await fetch('https://api.gms.moontontech.com/api/gms/source/2713644/2766683',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','X-Appid':'2636539','X-Lang':'en'},body:JSON.stringify({pageSize:500,pageIndex:1})});
  if(!r.ok)throw Error('GMS HTTP '+r.status);
  const j=await r.json();
  if(j.code!==0||!Array.isArray(j.data?.records))throw Error('bad GMS');
  const assets=new Map();
  const updates=[];
  for(const rec of j.data.records){
    const h=rec.data,d=h.hero?.data||{},name=d.name||h.hero?.name;
    if(!TARGET.has(key(name)))continue;
    const urls={head:h.head,head_big:h.head_big,painting:h.painting,d_head:d.head,d_painting:d.painting,squarehead:d.squarehead,squareheadbig:d.squareheadbig,smallmap:d.smallmap};
    const icon=picture(h.head_big||h.head||d.head,assets);
    const face=picture(d.head||h.head,assets);
    const portrait=picture(h.painting||d.painting,assets);
    const images=[...new Set([h.head,h.head_big,h.painting,d.head,d.painting,d.squarehead,d.squareheadbig,d.smallmap].map(u=>picture(u,assets)).filter(Boolean))];
    updates.push({id:Number(h.hero_id),name,icon,face,portrait,images,urls});
  }
  console.log('Targets:', updates.map(u=>u.name+'#'+u.id).join(', '));
  console.log('Assets:', assets.size);
  fs.mkdirSync(dest,{recursive:true});
  fs.mkdirSync(heroIconsDir,{recursive:true});
  for(const entry of assets.values()){
    await download(entry);
    console.log('saved', entry.path, entry.bytes);
  }
  const byName=new Map(catalog.heroes.map(h=>[key(h.name),h]));
  for(const u of updates){
    const h=byName.get(key(u.name));
    if(!h){console.warn('catalog missing',u.name);continue;}
    const prev={face:h.face,icon:h.icon,img:h.img};
    h.gameId=u.id;
    h.cdnImages=u.images;
    if(u.face) h.face=u.face;
    if(u.icon) h.icon=u.icon;
    if(u.portrait) h.img=u.portrait;
    h.iconSource=u.urls.head_big||u.urls.head||h.iconSource;
    const headBigEntry=[...assets.values()].find(a=>a.path===u.icon);
    if(headBigEntry){
      const ext=path.extname(headBigEntry.file).toLowerCase()||'.jpg';
      const destIcon=path.join(heroIconsDir,key(u.name)+ext);
      fs.copyFileSync(headBigEntry.file,destIcon);
      for(const other of ['.jpg','.png','.webp','.jpeg']){
        const p=path.join(heroIconsDir,key(u.name)+other);
        if(other!==ext && fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
    if(u.face){
      const faceFile=path.join(root,'public',u.face);
      if(fs.existsSync(faceFile)){
        const wikiIcon=path.join(wikiHeroDir,'icon-'+key(u.name)+path.extname(faceFile));
        fs.copyFileSync(faceFile,wikiIcon);
        h.wikiIcon='/assets/wiki/heroes/'+path.basename(wikiIcon);
      }
    }
    if(u.portrait){
      const portFile=path.join(root,'public',u.portrait);
      if(fs.existsSync(portFile)){
        const wikiPort=path.join(wikiHeroDir,'portrait-'+key(u.name)+path.extname(portFile));
        fs.copyFileSync(portFile,wikiPort);
        h.wikiPortrait='/assets/wiki/heroes/'+path.basename(wikiPort);
        h.img=h.wikiPortrait;
      }
    }
    let ref=recognition.find(r=>key(r.name)===key(u.name));
    if(!ref){ref={name:u.name,images:[]};recognition.push(ref);}
    const heroIconPath='/assets/hero-icons/'+key(u.name)+path.extname(u.icon||'.jpg');
    ref.images=[...new Set([u.face,u.icon,u.portrait,heroIconPath,...u.images,...(ref.images||[])].filter(Boolean))];
    console.log('updated',u.name,JSON.stringify({prev,next:{face:h.face,icon:h.icon,img:h.img}}));
  }
  catalog.draftBans={
    tournament:'PASIKLABAN',
    note:'Recent revamps — 2-week observation. Clear entries (or wait until date) to lift bans.',
    entries:[
      {name:'Bruno',reason:'Recent revamp — observation period',until:'2026-09-29'},
      {name:'Masha',reason:'Recent revamp — observation period',until:'2026-09-29'}
    ],
    updatedAt:new Date().toISOString()
  };
  catalog.updatedAt=new Date().toISOString();
  const manPath=path.join(dest,'manifest.json');
  if(fs.existsSync(manPath)){
    const man=JSON.parse(fs.readFileSync(manPath,'utf8'));
    const byId=new Map(man.heroes.map(h=>[h.id,h]));
    for(const u of updates){
      const row=byId.get(u.id)||{id:u.id,name:u.name};
      row.name=u.name;row.icon=u.icon;row.face=u.face;row.portrait=u.portrait;row.images=u.images;
      byId.set(u.id,row);
    }
    man.heroes=[...byId.values()].sort((a,b)=>a.id-b.id);
    const known=new Set((man.files||[]).map(f=>f.path));
    man.files=man.files||[];
    for(const entry of assets.values()){
      const sha=crypto.createHash('sha256').update(fs.readFileSync(entry.file)).digest('hex');
      if(!known.has(entry.path)) man.files.push({url:entry.url,path:entry.path,bytes:entry.bytes,sha256:sha});
      else {
        const f=man.files.find(x=>x.path===entry.path);
        if(f){f.bytes=entry.bytes;f.sha256=sha;f.url=entry.url;}
      }
    }
    man.updatedAt=new Date().toISOString();
    fs.writeFileSync(manPath,JSON.stringify(man,null,2));
  }
  fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2));
  fs.writeFileSync(recogPath,JSON.stringify(recognition,null,2));
  console.log('DONE');
  console.log(JSON.stringify(catalog.draftBans,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
