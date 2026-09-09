(() => {
  const panel=document.createElement('div');panel.className='layout-workbench';
  panel.innerHTML=`<div class="layout-toolbar"><button id="layoutMode" aria-pressed="false">Adjust HUD layout</button><span id="layoutStatus" role="status">Click content to edit it. Adjust layout to move or resize it.</span><button id="layoutUndo" disabled>Undo layout change</button><button id="previewExpand">Expand preview</button></div><div id="layoutInspector" hidden><div class="layout-help">Changes go live. Drag an element to move it; drag its corner to resize. Hold Shift for independent height. Arrow keys nudge; Shift + arrows move 10 px.</div><div class="layout-fields"><label>Element<select id="layoutElement"></select></label>${[['x','X offset (px)'],['y','Y offset (px)'],['scaleX','Width (%)'],['scaleY','Height (%)'],['fontScale','Text size (%)'],['opacity','Opacity (%)']].map(([key,label])=>`<label>${label}<input type="number" data-layout-value="${key}" step="${['x','y'].includes(key)?1:5}" min="${key==='x'?-3840:key==='y'?-2160:key==='opacity'?0:10}" max="${key==='x'?3840:key==='y'?2160:key==='opacity'?100:500}"></label>`).join('')}</div><div class="layout-actions"><label class="check"><input type="checkbox" id="layoutHidden"> Hide this element</label><button id="layoutReset">Reset element</button><button id="layoutResetScene">Reset this scene</button></div></div>`;
  $('.previewfoot').before(panel);
  let enabled=false,selection=null,pending=null,busy=false,timer,history=[],baseline=null;
  const frame=$('.preview iframe');const send=data=>frame.contentWindow.postMessage(data,location.origin);
  function status(text){$('#layoutStatus').textContent=text;}
  $('#layoutMode').onclick=()=>{enabled=!enabled;$('#layoutMode').setAttribute('aria-pressed',enabled);$('#layoutMode').classList.toggle('primary',enabled);$('#layoutInspector').hidden=!enabled;send({type:'layout-mode',enabled});};
  frame.addEventListener('load',()=>send({type:'layout-mode',enabled}));
  $('#previewExpand').onclick=()=>{const on=$('.previewpanel').classList.toggle('expanded-preview');$('#previewExpand').textContent=on?'Close expanded preview':'Expand preview';};
  $('#layoutElement').onchange=e=>send({type:'layout-select',id:e.target.value});
  function currentValue(){const v=HUDLayout.defaults();$$('[data-layout-value]').forEach(el=>v[el.dataset.layoutValue]=Number(el.value)/(['x','y'].includes(el.dataset.layoutValue)?1:100));v.hidden=$('#layoutHidden').checked;return v;}
  function queue(change){
    try{if(change.value!==null)HUDLayout.validate([{scene:change.scene,id:change.id,...change.value}]);}catch(e){status(e.message);return;}
    if(!baseline){baseline={scene:change.scene,id:change.id,value:state.layouts.find(r=>r.scene===change.scene&&r.id===change.id)||null};history.push(baseline);if(history.length>30)history.shift();$('#layoutUndo').disabled=false;}
    pending=change;status('Saving layout…');clearTimeout(timer);timer=setTimeout(flush,60);
  }
  async function flush(){if(busy||!pending)return;busy=true;const change=pending;pending=null;try{state=await api('/api/layout',change);status('Layout saved · synced to OBS');if(!pending)send({type:'layout-saved'});}catch(e){status('Layout not saved: '+e.message);toast(e.message,true);}finally{busy=false;if(pending)flush();}}
  $$('[data-layout-value],#layoutHidden').forEach(el=>{el.oninput=()=>{if(!selection)return;const value=currentValue();send({type:'layout-preview',id:selection.id,value});queue({scene:selection.scene,id:selection.id,value});};el.onchange=()=>{baseline=null;};});
  $('#layoutReset').onclick=()=>{if(!selection)return;send({type:'layout-preview',id:selection.id,value:HUDLayout.defaults()});queue({scene:selection.scene,id:selection.id,value:null});baseline=null;};
  $('#layoutResetScene').onclick=run(async()=>{if(!selection)return;while(busy)await new Promise(r=>setTimeout(r,25));await flush();state=await api('/api/layout',{scene:selection.scene,resetScene:true});send({type:'layout-saved'});status('Scene layout reset');});
  $('#layoutUndo').onclick=run(async()=>{if(busy||pending){status('Finish saving before undo');return;}const old=history.pop();if(!old)return;const {scene,id,value}=old;state=await api('/api/layout',{scene,id,value:value?Object.fromEntries(Object.keys(HUDLayout.defaults()).map(k=>[k,value[k]])):null});baseline=null;send({type:'layout-saved'});$('#layoutUndo').disabled=!history.length;status('Layout change undone');});
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==frame.contentWindow)return;const d=e.data;
    if(d?.type==='layout-elements'){const select=$('#layoutElement'),signature=JSON.stringify([d.scene,d.elements]);if(select.dataset.signature!==signature){select.innerHTML='<option value="">Select a HUD element</option>'+d.elements.map(el=>`<option value="${esc(el.id)}">${esc(el.label)}</option>`).join('');select.dataset.signature=signature;}if(d.selected)select.value=d.selected;}
    if(d?.type==='layout-selection'){selection=d;$('#layoutElement').value=d.id;$$('[data-layout-value]').forEach(el=>{if(el!==document.activeElement)el.value=Math.round(d.value[el.dataset.layoutValue]*(['x','y'].includes(el.dataset.layoutValue)?1:100)*10)/10;});$('#layoutHidden').checked=d.value.hidden;}
    if(d?.type==='layout-change'){queue({scene:d.scene,id:d.id,value:Object.fromEntries(Object.keys(HUDLayout.defaults()).map(k=>[k,d.value[k]]))});if(d.final)baseline=null;}
  });
})();
