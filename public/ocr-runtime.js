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
  function goldJump(previous,next,elapsedMs){return previous!==undefined&&next>previous+Math.max(5000,Math.max(0,elapsedMs)*1);}
  // Two independent lanes consume fresh work without queuing stale frames.
  async function parallel(items,workers,job,isCurrent=()=>true){let index=0;await Promise.all(workers.map(async worker=>{while(isCurrent()){const i=index++;if(i>=items.length)return;await job(worker,items[i],i);}}));}
  // Schedule recognition in a worker so a covered control tab does not add
  // the browser's background-window timer delay to every detection cycle.
  function scheduler(callback){
    let worker=null,timer=null,version=0;
    return {
      schedule(delay=80){
        this.cancel();const id=version;
        if(typeof Worker==='function'){
          if(!worker){worker=new Worker('/ocr-timer.js');worker.onmessage=e=>{if(e.data===version)callback();};}
          worker.postMessage({id,delay});
        }else timer=setTimeout(()=>{if(id===version)callback();},delay);
      },
      cancel(){version++;clearTimeout(timer);timer=null;worker?.postMessage({cancel:true});},
      close(){this.cancel();worker?.terminate();worker=null;}
    };
  }
  return {stability,changed,parallel,scheduler,goldJump};
});
