/* Local portrait matching. A score measures artwork similarity, not a probability.
   Unseen skins and weak/ambiguous matches remain unknown. No frames leave this PC. */
if(typeof document==='undefined'){
  const size=8,dimension=size*size;
  let library=[],learned=[],references=[];
  const integrals=new WeakMap();
  function feature(pixels,width,height,x=0,y=0,w=width,h=height,flip=false){
    let integral=integrals.get(pixels);const stride=width+1;
    if(!integral){integral=new Float32Array(stride*(height+1));for(let yy=0;yy<height;yy++){let row=0;for(let xx=0;xx<width;xx++){const p=(yy*width+xx)*4;row+=pixels[p]*.299+pixels[p+1]*.587+pixels[p+2]*.114;integral[(yy+1)*stride+xx+1]=integral[yy*stride+xx+1]+row;}}integrals.set(pixels,integral);}
    const raw=new Float32Array(dimension);let mean=0;
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const column=flip?size-i-1:i,left=Math.max(0,Math.min(width-1,Math.round(x+column*w/size))),right=Math.max(left+1,Math.min(width,Math.round(x+(column+1)*w/size)));
      const top=Math.max(0,Math.min(height-1,Math.round(y+j*h/size))),bottom=Math.max(top+1,Math.min(height,Math.round(y+(j+1)*h/size)));
      const value=(integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left])/((right-left)*(bottom-top));
      raw[j*size+i]=value;mean+=value/dimension;
    }
    let norm=0;for(const v of raw)norm+=(v-mean)**2;norm=Math.sqrt(norm);
    if(norm<55)return null;
    return Int8Array.from(raw,v=>Math.round((v-mean)/norm*127));
  }
  function dot(a,b,offset=0){let n=0;for(let i=0;i<dimension;i++)n+=a[i]*b[offset+i];return n/16129;}
  async function build(){
    const catalog=await (await fetch('/assets/hero-recognition.json')).json();
    for(const hero of catalog){
      const rows=[];
      for(const url of hero.images)try{
        const response=await fetch(url);if(!response.ok)continue;
        const bitmap=await createImageBitmap(await response.blob()),width=80,height=Math.round(80*bitmap.height/bitmap.width),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height);bitmap.close();
        const pixels=ctx.getImageData(0,0,width,height).data;
        for(const scale of [.22,.3,.4,.53,.7,1]){
          const side=scale*width;if(side>height)continue;
          const step=Math.max(4,side/5),nx=Math.max(1,Math.ceil((width-side)/step)),ny=Math.max(1,Math.ceil((height-side)/step));
          for(let yi=0;yi<=ny;yi++)for(let xi=0;xi<=nx;xi++){
            const x=(width-side)*xi/nx,y=(height-side)*yi/ny;
            const f=feature(pixels,width,height,x,y,side,side);if(f)rows.push(f);
          }
        }
      }catch{/* Missing artwork cannot become a match. */}
      const packed=new Int8Array(rows.length*dimension);rows.forEach((r,i)=>packed.set(r,i*dimension));library.push({name:hero.name,packed});
    }
    return library.length;
  }
  self.onmessage=async({data})=>{
    try{
      if(data.action==='load'){learned=data.learned||[];self.postMessage({id:data.id,count:await build()});return;}
      if(data.action==='learn'){learned=data.learned;self.postMessage({id:data.id});return;}
      if(data.action==='clear-references'){references=[];return;}
      if(data.action==='reference'){
        for(const sample of data.samples){references=references.filter(r=>r.hero!==sample.hero||r.kind!==sample.kind);references.push(sample);}
        references=references.slice(-50);self.postMessage({id:data.id});return;
      }
      const matches=data.queries.map(q=>{
        const a=feature(q.pixels,16,16),b=feature(q.pixels,16,16,0,0,16,16,true);
        if(!a)return {field:q.field,value:null,similarity:0,reason:'Empty or obscured portrait'};
        const ranked=[];
        for(const hero of library){let best=-1;for(let offset=0;offset<hero.packed.length;offset+=dimension)best=Math.max(best,dot(a,hero.packed,offset),dot(b,hero.packed,offset));ranked.push({name:hero.name,score:best,learned:false});}
        for(const sample of [...learned,...references]){if(sample.kind!==q.kind)continue;const f=feature(sample.pixels,16,16);if(!f)continue;const score=Math.max(dot(a,f),dot(b,f)),entry=ranked.find(h=>h.name===sample.hero);if(entry&&score>entry.score){entry.score=score;entry.learned=true;}}
        ranked.sort((a,b)=>b.score-a.score);const first=ranked[0],margin=first?first.score-(ranked[1]?.score||0):0;
        // Default artwork must match strongly at a distinctly better score than
        // every other hero. Saved, labeled capture samples use a stricter score.
        const accepted=!!first&&first.score>=(first.learned ? .91 : .88)&&margin>=.065;
        return {field:q.field,value:accepted?first.name:null,candidate:first?.name,similarity:Math.round((first?.score||0)*100),reason:accepted?'Artwork matched':'Unknown / needs a matching skin sample'};
      });
      self.postMessage({id:data.id,matches});
    }catch(error){self.postMessage({id:data.id,error:error.message});}
  };
}else{
  window.HeroRecognition=(()=>{
    let worker=null,ready=null,nextId=0;const pending=new Map();
    const readLearned=()=>{try{const rows=JSON.parse(localStorage.getItem('liveHeroSamples')||'[]');return Array.isArray(rows)?rows.filter(r=>typeof r.hero==='string'&&typeof r.kind==='string'&&Array.isArray(r.pixels)&&r.pixels.length===1024&&r.pixels.every(v=>Number.isInteger(v)&&v>=0&&v<=255)).slice(-150):[];}catch{return [];}};
    function send(message){return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({id,...message});});}
    function init(){
      if(ready)return ready;
      worker=new Worker('/hero-recognition.js');worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data);};
      worker.onerror=e=>{for(const job of pending.values())job.reject(Error(e.message||'Portrait matcher stopped'));pending.clear();ready=null;worker?.terminate();worker=null;};
      ready=send({action:'load',learned:readLearned()});return ready;
    }
    function query(frame,r,mode){
      const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(frame,r.x/1920*frame.width,r.y/1080*frame.height,r.w/1920*frame.width,r.h/1080*frame.height,0,0,16,16);
      const pixels=[...ctx.getImageData(0,0,16,16).data];c.width=c.height=96;ctx.drawImage(frame,r.x/1920*frame.width,r.y/1080*frame.height,r.w/1920*frame.width,r.h/1080*frame.height,0,0,96,96);
      return {field:r.field,kind:r.field.includes('.bans.')?'ban':mode+'Hero',pixels,thumbnail:c.toDataURL()};
    }
    async function match(queries){await init();return (await send({action:'match',queries:queries.map(({field,kind,pixels})=>({field,kind,pixels}))})).matches;}
    async function reference(samples){if(!samples.length)return;await init();await send({action:'reference',samples});}
    function clearReferences(){worker?.postMessage({action:'clear-references'});}
    async function learn(q,hero){const rows=readLearned();rows.push({hero,kind:q.kind,pixels:q.pixels});const saved=rows.slice(-150);localStorage.setItem('liveHeroSamples',JSON.stringify(saved));await init();await send({action:'learn',learned:saved});}
    function close(){worker?.terminate();worker=null;ready=null;for(const p of pending.values())p.reject(Error('Portrait matching canceled'));pending.clear();}
    return {init,query,match,learn,close,reference,clearReferences};
  })();
}
