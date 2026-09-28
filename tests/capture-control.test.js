const test=require('node:test');
const assert=require('node:assert/strict');

test('LAN OCR controller can send settings and commands; host status does not replay commands',async t=>{
  const {app}=require('../server');
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const get=async()=>{const r=await fetch(base+'/api/capture/control');assert.equal(r.status,200);return r.json();};
  const start=await get();
  let response=await fetch(base+'/api/capture/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'toggle-ocr'})});
  let control=await response.json();
  assert.equal(control.revision,start.revision+1);
  assert.equal(control.command,'toggle-ocr');
  assert.equal(control.commandRevision,control.revision);
  const commandRevision=control.commandRevision;
  response=await fetch(base+'/api/capture/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{profile:'auto',confidence:'75'}})});
  control=await response.json();
  assert.equal(control.settings.confidence,'75');
  assert.equal(control.commandRevision,commandRevision);
  response=await fetch(base+'/api/capture/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:true,ocrRunning:true,aiRunning:false,settings:{profile:'auto'}})});
  control=await response.json();
  assert.equal(control.ocrRunning,true);
  assert.equal(control.revision,start.revision+2);
  assert.equal(control.commandRevision,commandRevision);
  response=await fetch(base+'/api/capture/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'arbitrary-action'})});
  assert.equal(response.status,400);
});
