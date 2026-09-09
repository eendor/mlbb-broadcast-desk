(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OCRRuntime=api;})(globalThis,()=>{
  function stability(){
    const values=new Map();
    return {clear(){values.clear();},observe(field,value,required=2){
      const old=values.get(field);
      if(value===null){if(old)old.count=0;return false;}
      const next=old&&old.value===value?{...old,count:old.count+1}:{value,count:1};values.set(field,next);
      return next.count>=required;
    }};
  }
  function changed(previous,next,threshold=2){if(!previous||previous.length!==next.length)return true;let diff=0;for(let i=0;i<next.length;i++)diff+=Math.abs(previous[i]-next[i]);return diff/next.length>threshold;}
  // Two independent lanes consume fresh work without queuing stale frames.
  async function parallel(items,workers,job,isCurrent=()=>true){let index=0;await Promise.all(workers.map(async worker=>{while(isCurrent()){const i=index++;if(i>=items.length)return;await job(worker,items[i],i);}}));}
  return {stability,changed,parallel};
});
