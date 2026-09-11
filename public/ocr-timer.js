let timer;
self.onmessage=({data})=>{
  clearTimeout(timer);
  if(!data.cancel)timer=setTimeout(()=>self.postMessage(data.id),data.delay);
};
