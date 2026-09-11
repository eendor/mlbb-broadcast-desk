const {test}=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate,merge}=require('../lib/state');
const Layout=require('../public/layout-model'),Runtime=require('../public/ocr-runtime'),OCR=require('../lib/live-ocr');
test('scene layouts survive state validation; reject invalid positions and prototype keys',()=>{
  const s=defaults();s.layouts=[{scene:'scoreboard',id:'rails:0',...Layout.defaults(),x:42,scaleY:.8}];validate(s);
  assert.throws(()=>Layout.validate([{...s.layouts[0],x:Infinity}]));
  assert.throws(()=>Layout.validate([{...s.layouts[0],id:'__proto__:0'}]));
  assert.throws(()=>Layout.validate([{...s.layouts[0],scaleX:0}]));
  assert.throws(()=>Layout.validate([s.layouts[0],s.layouts[0]]));
});
test('OCR applies to the latest player state and anchors a live clock to capture time',()=>{
  const state=defaults();state.blue.players[0].name='MANUAL EDIT';state.blue.players[1].hero='Fanny';
  const patch=OCR.prepare(state,{live:true,sampledAt:9500,readings:[{field:'blue.players.0.gold',value:3400},{field:'gameTime',value:'01:47'}]},10000);
  assert.equal(patch.blue.players[0].name,'MANUAL EDIT');assert.equal(patch.blue.players[1].hero,'Fanny');
  assert.deepEqual(patch.gameClock,{running:true,seconds:107,syncedAt:9500});validate(merge(state,patch));
  assert.throws(()=>OCR.prepare(state,{live:true,sampledAt:0,readings:[{field:'blue.logo',value:'/bad'}]},10000));
  assert.throws(()=>OCR.prepare(state,{live:true,sampledAt:0,readings:[{field:'red.kills',value:4}]},40000));
});
test('isolated OCR spikes and low-confidence interruptions require confirmation again',()=>{
  const gate=Runtime.stability();assert.equal(gate.observe('red.kills',2),false);assert.equal(gate.observe('red.kills',2),true);
  assert.equal(gate.observe('red.kills',4),false);assert.equal(gate.observe('red.kills',2),false);assert.equal(gate.observe('red.kills',null),false);assert.equal(gate.observe('red.kills',2),false);assert.equal(gate.observe('red.kills',2),true);
  gate.clear();assert.equal(gate.observe('red.kills',2),false);
});
test('fast OCR fields finish before slow fields; cancellation discards queued work',async()=>{
  const completed=[];await Runtime.parallel([80,5,5],[{},{}],async(_,ms)=>{await new Promise(r=>setTimeout(r,ms));completed.push(ms);});
  assert.deepEqual(completed,[5,5,80]);let current=true,run=0;
  await Runtime.parallel([1,2,3],[{}],async()=>{run++;current=false;},()=>current);assert.equal(run,1);
  assert.equal(Runtime.changed(new Uint8Array([3,3]),new Uint8Array([3,3])),false);
  assert.equal(Runtime.changed(new Uint8Array([3,3]),new Uint8Array([20,20])),true);
});
test('gold spike guard permits normal growth and blocks decimal-point spikes',()=>{
  assert.equal(Runtime.goldJump(undefined,24700,0),false);
  assert.equal(Runtime.goldJump(24100,24700,1000),false);
  assert.equal(Runtime.goldJump(24700,275000,1000),true);
});
