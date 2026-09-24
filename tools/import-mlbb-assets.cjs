// Download the publisher's indexed hero pictures and equipment into the local desk.
// The CDN does not expose a directory listing; its official GMS index supplies URLs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'public/assets/mlbb-cdn');
const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const key=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
async function index(id){
 const option=process.argv.indexOf('--index-dir');
 if(option>=0){
  const folder=process.argv[option+1];if(!folder)throw Error('Pass a folder after --index-dir');
  const file=path.resolve(folder,id===2766683?'cdn-heroes.json':'cdn-items.json');
  const j=JSON.parse(fs.readFileSync(file,'utf8'));
  if(j.code!==0||!Array.isArray(j.data?.records)||j.data.records.length!==j.data.total)throw Error('Incomplete cached publisher index');
  return j.data.records.map(r=>r.data);
 }
 const rows=[];let total=Infinity;
 for(let pageIndex=1;rows.length<total;pageIndex++){
  const r=await fetch('https://api.gms.moontontech.com/api/gms/source/2713644/'+id,{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','X-Appid':'2636539','X-Lang':'en'},body:JSON.stringify({pageSize:500,pageIndex})});
  if(!r.ok)throw Error('Asset index HTTP '+r.status);
  const j=await r.json();if(j.code!==0||!Array.isArray(j.data?.records))throw Error('Invalid official asset index');
  total=j.data.total;if(!j.data.records.length)break;rows.push(...j.data.records.map(r=>r.data));
 }
 if(rows.length!==total)throw Error('Incomplete asset index');return rows;
}
(async()=>{
 fs.mkdirSync(dest,{recursive:true});
 const [heroes,items]=await Promise.all([index(2766683),index(2775075)]);
 const assets=new Map();
 function picture(url){
  if(!url)return null;const u=new URL(url.startsWith('//')?'https:'+url:url);
  if(u.protocol!=='https:'||u.hostname!=='akmweb.youngjoygame.com'||!/[.](png|jpe?g|webp)$/i.test(u.pathname))return null;
  const file=crypto.createHash('sha256').update(u.href).digest('hex').slice(0,20)+path.extname(u.pathname).toLowerCase();
  assets.set(u.href,{url:u.href,path:'/assets/mlbb-cdn/'+file});return '/assets/mlbb-cdn/'+file;
 }
 const catalog=json('public/assets/catalog.json');
 const names=new Map(catalog.heroes.map(h=>[key(h.name),h]));
 const canonical=n=>({dyrroth:'Dyrroth',fredrin:'Fredrinn'}[key(n)]||n);
 const heroRows=heroes.map(h=>{
  const d=h.hero.data,name=Number(h.hero_id)===133?'Hirara':canonical(d.name);
  const urls=[h.head,h.head_big,h.painting,d.head,d.painting,d.squarehead,d.squareheadbig,d.smallmap].filter(Boolean);
  const images=[...new Set(urls.map(picture).filter(Boolean))];
  return {id:Number(h.hero_id),name,icon:picture(h.head_big||h.head||d.head),face:picture(d.head||h.head),portrait:picture(h.painting||d.painting),images};
 });
 const itemRows=items.map(i=>({id:Number(i.equipid),name:i.equipname,icon:picture(i.equipicon)}));
 // Retain every community image referenced by the official hero index as well.
 const extra=[...new Set(JSON.stringify(heroes).match(/https:[^\s"<>\\]+/g)||[])].filter(u=>u.includes('/web/svnres/img/mlbb/community/'));
 extra.forEach(picture);
 let cursor=0,done=0;const entries=[...assets.values()],errors=[];
 await Promise.all(Array.from({length:6},async()=>{
  while(cursor<entries.length){
   const entry=entries[cursor++],file=path.join(root,'public',entry.path);
   try{
    let bytes;
    if(fs.existsSync(file))bytes=fs.readFileSync(file);
    else for(let attempt=0;attempt<3;attempt++)try{
     const r=await fetch(entry.url,{signal:AbortSignal.timeout(30000)});
     if(!r.ok)throw Error('Image HTTP '+r.status);
     bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<100||bytes.length>20000000)throw Error('Invalid image size');
     if(!(bytes[0]===255&&bytes[1]===216||bytes.subarray(1,4).toString()==='PNG'||bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'))throw Error('Response is not a supported image');
     fs.writeFileSync(file,bytes);break;
    }catch(error){if(attempt===2)throw error;}
    entry.bytes=bytes.length;entry.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
   }catch(error){errors.push({url:entry.url,error:error.message});}
   done++;if(done%50===0)console.log('Downloaded/verified '+done+'/'+entries.length);
  }
 }));
 if(errors.length){fs.writeFileSync(path.join(dest,'download-errors.json'),JSON.stringify(errors,null,2));throw Error(errors.length+' image downloads failed; existing catalog left intact');}
 fs.writeFileSync(path.join(dest,'download-errors.json'),'[]');
 const manifest={updatedAt:new Date().toISOString(),requestedBase:'https://akmweb.youngjoygame.com/web/svnres/img/mlbb/community/',index:'https://api.gms.moontontech.com/api/gms/source/2713644/',heroes:heroRows,items:itemRows,files:entries};
 fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
 const recognition=json('public/assets/hero-recognition.json');
 for(const h of heroRows){
  const existing=names.get(key(h.name))||{name:h.name};
  existing.gameId=h.id;existing.cdnImages=h.images;existing.icon=h.icon;existing.face=h.face;existing.iconSource=entries.find(f=>f.path===h.icon)?.url;
  // Keep established panel crops and real animations. New heroes get the official picture.
  existing.img||=h.portrait||h.icon;names.set(key(h.name),existing);
  let ref=recognition.find(r=>key(r.name)===key(h.name));
  if(!ref){ref={name:h.name,images:[]};recognition.push(ref);}
  ref.images=[...new Set([...ref.images,...h.images])];
 }
 catalog.heroes=[...names.values()].sort((a,b)=>a.name.localeCompare(b.name));catalog.items=itemRows;catalog.cdnArtwork={heroes:heroRows.length,items:itemRows.length,files:entries.length,updatedAt:manifest.updatedAt};
 fs.writeFileSync(path.join(root,'public/assets/catalog.json'),JSON.stringify(catalog,null,2));
 fs.writeFileSync(path.join(root,'public/assets/hero-recognition.json'),JSON.stringify(recognition,null,2));
 console.log(JSON.stringify({heroes:heroRows.length,items:itemRows.length,itemsWithArtwork:itemRows.filter(i=>i.icon).length,files:entries.length,communityFiles:entries.filter(f=>f.url.includes('/community/')).length,bytes:entries.reduce((n,f)=>n+f.bytes,0)}));
})().catch(error=>{console.error(error);process.exitCode=1;});
