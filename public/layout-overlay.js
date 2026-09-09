(() => {
  const preview=params.has('preview'),baseFonts=new WeakMap();
  let editing=false,selected='',nodes=new Map(),drag=null,pending=null,scene='';
  const selection=document.createElement('div');selection.className='hud-selection';selection.hidden=true;
  selection.innerHTML='<span></span><i title="Drag to resize"></i>';document.body.append(selection);
  function value(id){return {...HUDLayout.defaults(),...state.layouts.find(r=>r.scene===scene&&r.id===id),...(pending?.id===id?pending.value:{})};}
  function send(type,data={}){if(preview)parent.postMessage({type,...data},location.origin);}
  function info(){const el=nodes.get(selected);if(!el)return;const r=el.getBoundingClientRect();send('layout-selection',{scene,id:selected,label:el.dataset.layoutLabel,value:value(selected),width:el.offsetWidth,height:el.offsetHeight});selection.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;selection.hidden=!editing;selection.querySelector('span').textContent=el.dataset.layoutLabel;}
  function apply(){
    if(!state)return;
    const nextScene=params.get('scene')||state.scene;
    if(nextScene!==scene){scene=nextScene;selected='';pending=null;}
    nodes=new Map();
    for(const [key,label,selector]of HUDLayout.groups)stage.querySelectorAll(selector).forEach((el,i)=>{
      const id=key+':'+i;el.dataset.layoutId=id;el.dataset.layoutLabel=label+(stage.querySelectorAll(selector).length>1?' '+(i+1):'');nodes.set(id,el);
    });
    // Capture type sizes before applying any parent/child customizations.
    const textNodes=[...stage.querySelectorAll('*')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
    for(const el of textNodes)if(!baseFonts.has(el))baseFonts.set(el,parseFloat(getComputedStyle(el).fontSize));
    for(const [id,el]of nodes){const v=value(id);el.style.translate=`${v.x}px ${v.y}px`;el.style.scale=`${v.scaleX} ${v.scaleY}`;el.style.transformOrigin='center center';el.style.opacity=v.opacity;el.style.visibility=v.hidden&&!editing?'hidden':'';el.classList.toggle('hud-hidden',v.hidden&&editing);el.dataset.hudFontScale=v.fontScale;}
    for(const el of textNodes){let factor=1;for(let p=el;p&&p!==stage;p=p.parentElement)factor*=Number(p.dataset.hudFontScale||1);el.dataset.hudFontFactor=factor;el.style.fontSize=baseFonts.get(el)*factor+'px';}
    window.fitBroadcastText?.();
    if(editing){send('layout-elements',{scene,elements:[...nodes].map(([id,el])=>({id,label:el.dataset.layoutLabel})),selected});info();}
    selection.hidden=!editing||!nodes.has(selected);
  }
  window.applyLiveLayout=apply;
  const original=render;render=function(){original();apply();};
  function select(id){selected=id;pending=null;info();}
  function begin(e,id,resize=false){
    if(!editing||e.button!==0||!nodes.has(id))return;
    e.preventDefault();e.stopImmediatePropagation();select(id);
    const el=nodes.get(id),r=el.getBoundingClientRect();
    drag={id,x:e.clientX,y:e.clientY,value:value(id),resize,width:r.width,height:r.height,ratioX:r.width/(el.offsetWidth*value(id).scaleX),ratioY:r.height/(el.offsetHeight*value(id).scaleY)};
    e.target.setPointerCapture?.(e.pointerId);
  }
  if(preview){
    document.addEventListener('pointerdown',e=>{if(e.target===selection.querySelector('i'))return begin(e,selected,true);const el=e.target.closest('[data-layout-id]');if(el)begin(e,el.dataset.layoutId);},true);
    document.addEventListener('pointermove',e=>{
      if(!drag)return;e.preventDefault();const dx=e.clientX-drag.x,dy=e.clientY-drag.y,v={...drag.value};
      if(drag.resize){v.scaleX=Math.max(.1,Math.min(5,drag.value.scaleX*(1+dx*2/Math.max(1,drag.width))));v.scaleY=e.shiftKey?Math.max(.1,Math.min(5,drag.value.scaleY*(1+dy*2/Math.max(1,drag.height)))):v.scaleX/drag.value.scaleX*drag.value.scaleY;v.scaleY=Math.max(.1,Math.min(5,v.scaleY));}
      else{v.x=Math.max(-3840,Math.min(3840,drag.value.x+dx/drag.ratioX));v.y=Math.max(-2160,Math.min(2160,drag.value.y+dy/drag.ratioY));}
      pending={id:drag.id,value:v};apply();send('layout-change',{scene,id:drag.id,value:v,final:false});
    },true);
    document.addEventListener('pointerup',()=>{if(!drag)return;const id=drag.id;drag=null;if(pending)send('layout-change',{scene,id,value:pending.value,final:true});},true);
    document.addEventListener('click',e=>{if(editing){e.preventDefault();e.stopImmediatePropagation();}},true);
    document.addEventListener('keydown',e=>{
      if(!editing||!selected)return;
      const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!steps[e.key])return;
      e.preventDefault();const v=value(selected),[x,y]=steps[e.key],step=e.shiftKey?10:1;v.x=Math.max(-3840,Math.min(3840,v.x+x*step));v.y=Math.max(-2160,Math.min(2160,v.y+y*step));pending={id:selected,value:v};apply();send('layout-change',{scene,id:selected,value:v,final:true});
    },true);
    window.addEventListener('message',e=>{
      if(e.origin!==location.origin||e.source!==parent)return;const d=e.data;
      if(d?.type==='layout-mode'){editing=d.enabled;document.body.classList.toggle('layout-editing',editing);apply();}
      if(d?.type==='layout-select'&&nodes.has(d.id))select(d.id);
      if(d?.type==='layout-preview'){selected=d.id;pending={id:d.id,value:d.value};apply();}
      if(d?.type==='layout-saved'&&!drag){pending=null;apply();}
    });
    window.addEventListener('resize',info);
  }
})();
