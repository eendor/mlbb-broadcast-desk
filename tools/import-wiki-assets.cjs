// Import hero icons/portraits, battle spells and emblems from the Mobile Legends
// Fandom wiki (static.wikia.nocookie.net) into the local broadcast desk.
//
//   node tools/import-wiki-assets.cjs
//
// Writes images under public/assets/wiki/{heroes,spells,emblems} and updates
// public/assets/catalog.json with wiki hero art plus `spells` and `emblems`.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'public/assets/wiki');
const API='https://mobile-legends.fandom.com/api.php';
const UA={'User-Agent':'Mozilla/5.0 OBS-ML-Setup Asset Importer'};
// The image CDN (static.wikia.nocookie.net) rejects non-browser agents with 403,
// so downloads use a full browser UA and a wiki Referer.
const IMG_HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','Referer':'https://mobile-legends.fandom.com/','Accept':'image/avif,image/webp,image/*,*/*'};
const catalogPath=path.join(root,'public/assets/catalog.json');
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));
const key=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');

async function api(params){
  const u=API+'?'+new URLSearchParams({format:'json',...params}).toString();
  const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Wiki API HTTP '+r.status);
  return r.json();
}
// Resolve File:Name.png -> direct CDN url. Batches of 40.
async function resolveUrls(fileTitles){
  const out=new Map();
  for(let i=0;i<fileTitles.length;i+=40){
    const batch=fileTitles.slice(i,i+40);
    const j=await api({action:'query',titles:batch.join('|'),prop:'imageinfo',iiprop:'url'});
    const pages=j.query&&j.query.pages||{};
    // Wiki normalizes spaces->underscores; map back by normalized title.
    const norm=new Map((j.query&&j.query.normalized||[]).map(n=>[n.to,n.from]));
    for(const k in pages){
      const p=pages[k];
      const title=norm.get(p.title)||p.title;
      if(p.imageinfo&&p.imageinfo[0])out.set(title,p.imageinfo[0].url);
    }
  }
  return out;
}
async function pageImages(title){
  const j=await api({action:'parse',page:title,prop:'images'});
  return (j.parse&&j.parse.images)||[];
}
function ext(url){const m=url.split('?')[0].match(/\.(png|jpe?g|webp)$/i);return m?m[0].toLowerCase():'.png';}
async function download(url){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(url,{headers:IMG_HEADERS,signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw Error('HTTP '+r.status);
      const b=Buffer.from(await r.arrayBuffer());
      if(b.length<80)throw Error('empty image');
      return b;
    }catch(e){if(attempt===2)throw e;}
  }
}
async function pool(items,worker,size=8){
  let i=0;const errors=[];
  await Promise.all(Array.from({length:size},async()=>{
    while(i<items.length){const item=items[i++];try{await worker(item);}catch(e){errors.push({item,error:e.message});}}
  }));
  return errors;
}
function localName(prefix,name,url){
  return prefix+'-'+key(name)+ext(url);
}

(async()=>{
  fs.mkdirSync(path.join(dest,'heroes'),{recursive:true});
  fs.mkdirSync(path.join(dest,'spells'),{recursive:true});
  fs.mkdirSync(path.join(dest,'emblems'),{recursive:true});

  // ---- Heroes: HeroXXX1-icon.png / HeroXXX1-portrait.png (XXX = gameId padded to >=2) ----
  const heroesWithId=catalog.heroes.filter(h=>h.gameId);
  const heroFileFor=(h,kind)=>`File:Hero${String(h.gameId).padStart(2,'0')}1-${kind}.png`;
  const wanted=[];
  for(const h of heroesWithId){wanted.push(heroFileFor(h,'icon'),heroFileFor(h,'portrait'));}
  console.log('Resolving '+wanted.length+' hero image URLs...');
  const heroUrls=await resolveUrls(wanted);
  // Fallback: for heroes missing either art, read their page image list.
  for(const h of heroesWithId){
    const iconT=heroFileFor(h,'icon'),portT=heroFileFor(h,'portrait');
    if(!heroUrls.has(iconT)||!heroUrls.has(portT)){
      try{
        const imgs=await pageImages(h.name);
        const icon=imgs.find(x=>/^Hero\d+-icon\.png$/i.test(x));
        const port=imgs.find(x=>/-portrait\.png$/i.test(x));
        const extra=[];
        if(icon)extra.push('File:'+icon);
        if(port)extra.push('File:'+port);
        if(extra.length){
          const more=await resolveUrls(extra);
          if(icon&&more.has('File:'+icon))heroUrls.set(iconT,more.get('File:'+icon));
          if(port&&more.has('File:'+port))heroUrls.set(portT,more.get('File:'+port));
        }
      }catch(e){/* leave missing */}
    }
  }

  const heroErrors=await pool(heroesWithId,async h=>{
    const iconUrl=heroUrls.get(heroFileFor(h,'icon'));
    const portUrl=heroUrls.get(heroFileFor(h,'portrait'));
    if(iconUrl){
      const fn=localName('icon',h.name,iconUrl);
      fs.writeFileSync(path.join(dest,'heroes',fn),await download(iconUrl));
      h.wikiIcon='/assets/wiki/heroes/'+fn;
    }
    if(portUrl){
      const fn=localName('portrait',h.name,portUrl);
      fs.writeFileSync(path.join(dest,'heroes',fn),await download(portUrl));
      h.wikiPortrait='/assets/wiki/heroes/'+fn;
    }
  });
  const iconCount=heroesWithId.filter(h=>h.wikiIcon).length;
  const portCount=heroesWithId.filter(h=>h.wikiPortrait).length;
  console.log('Heroes: '+iconCount+' icons, '+portCount+' portraits');

  // ---- Battle spells ----
  const spellImgs=await pageImages('Battle spells');
  // Actual battle spells only (icons are plain File:Name.png, not HeroNNN-icon).
  const spellFiles=spellImgs.filter(f=>/\.png$/i.test(f)&&!/^Hero\d+-icon/i.test(f)&&!/^Aegis.*Bug/i.test(f)&&!/^Basic_Attack/i.test(f)&&!/History/i.test(f));
  const spellUrls=await resolveUrls(spellFiles.map(f=>'File:'+f));
  const spells=[];
  const spellErrors=await pool([...spellUrls.entries()],async([title,url])=>{
    const name=title.replace(/^File:/,'').replace(/\.png$/i,'').replace(/_/g,' ');
    const fn=localName('spell',name,url);
    fs.writeFileSync(path.join(dest,'spells',fn),await download(url));
    spells.push({id:key(name),name,icon:'/assets/wiki/spells/'+fn});
  });
  spells.sort((a,b)=>a.name.localeCompare(b.name));
  console.log('Spells: '+spells.length);

  // ---- Emblems ----
  const emblemImgs=await pageImages('Emblems');
  const emblemFiles=emblemImgs.filter(f=>/\.png$/i.test(f)&&!/^Battle_Points|^Diamond|History/i.test(f));
  const emblemUrls=await resolveUrls(emblemFiles.map(f=>'File:'+f));
  const emblems=[];
  const emblemErrors=await pool([...emblemUrls.entries()],async([title,url])=>{
    const name=title.replace(/^File:/,'').replace(/\.png$/i,'').replace(/_/g,' ');
    // Classify role emblems vs talents for grouping in the UI.
    const group=/Emblem$/.test(name)?'emblem':/^Subtalent/.test(name)?'subtalent':'talent';
    const fn=localName('emblem',name,url);
    fs.writeFileSync(path.join(dest,'emblems',fn),await download(url));
    emblems.push({id:key(name),name,group,icon:'/assets/wiki/emblems/'+fn});
  });
  emblems.sort((a,b)=>a.name.localeCompare(b.name));
  console.log('Emblems: '+emblems.length);

  catalog.spells=spells;
  catalog.emblems=emblems;
  catalog.wikiAssets={heroesIcons:iconCount,heroesPortraits:portCount,spells:spells.length,emblems:emblems.length,updatedAt:new Date().toISOString()};
  fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2));

  const errors=[...heroErrors,...spellErrors,...emblemErrors];
  if(errors.length){
    fs.writeFileSync(path.join(dest,'import-errors.json'),JSON.stringify(errors,null,2));
    console.log('Completed with '+errors.length+' errors (see public/assets/wiki/import-errors.json)');
  }else{
    console.log('All wiki assets imported cleanly.');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
