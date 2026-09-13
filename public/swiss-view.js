(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwissView=api;})(globalThis,()=>{
  // Camera areas use the original artwork's 1920 x 1080 coordinates.
  const views = [
    ['overview','Full bracket',[0,0,1920,1080]],
    ['r1-upper','Round 1 — upper matches',[42,142,296,394]],
    ['r1-lower','Round 1 — lower matches',[42,536,296,365]],
    ['1-0','Round 2 — 1–0 pool',[352,106,302,402]],
    ['0-1','Round 2 — 0–1 pool',[352,507,302,400]],
    ['2-0','Round 3 — 2–0 pool',[658,85,278,263]],
    ['1-1','Round 3 — 1–1 pool',[658,346,278,361]],
    ['0-2','Round 3 — 0–2 pool',[658,706,278,261]],
    ['2-1','Round 4 — 2–1 pool',[943,185,295,349]],
    ['1-2','Round 4 — 1–2 pool',[943,530,295,347]],
    ['2-2','Round 5 — 2–2 pool',[1250,389,298,348]],
    ['3-0','Qualified — 3–0',[943,14,295,176]],
    ['3-1','Qualified — 3–1',[1250,113,298,274]],
    ['3-2','Qualified — 3–2',[1589,198,295,344]],
    ['0-3','Eliminated — 0–3',[943,877,295,171]],
    ['1-3','Eliminated — 1–3',[1250,737,298,274]],
    ['2-3','Eliminated — 2–3',[1589,545,295,344]],
  ];
  function box(id) {
    const [x,y,w,h] = (views.find(v=>v[0]===id)||views[0])[2];
    const width=Math.max(w,h*16/9),height=width*9/16;
    const left=Math.max(0,Math.min(1920-width,x+w/2-width/2));
    const top=Math.max(0,Math.min(1080-height,y+h/2-height/2));
    return [left,top,width,height].map(n=>n*.8);
  }
  return {views,box,valid:id=>views.some(v=>v[0]===id)};
});
