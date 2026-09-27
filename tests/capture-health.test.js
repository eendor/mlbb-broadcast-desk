const {test}=require('node:test'),assert=require('node:assert/strict');
const CH=require('../public/capture-health');

// Build a synthetic RGBA buffer of a given size from a luma generator.
function frame(w,h,fn){
  const p=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=Math.max(0,Math.min(255,fn(x,y)));
    const i=(y*w+x)*4;p[i]=p[i+1]=p[i+2]=v;p[i+3]=255;
  }
  return p;
}
const sample=(p,w,h,extra={})=>Object.assign({width:w,height:h,...CH.analyze(p,w,h),trackState:'live'},extra);

test('a black capture is rejected before it can reach live detection',()=>{
  const m=CH.create();
  const black=sample(frame(64,36,()=>0),64,36);
  for(let i=0;i<6;i++){
    const r=m.observe(black,1000+i*100);
    assert.equal(r.ok,false,'black frame must never be ok');
    assert.equal(r.state,'black');
  }
});

test('a near-black and a flat-colour frame are both rejected',()=>{
  const m=CH.create();
  const nearBlack=sample(frame(64,36,()=>3),64,36);
  assert.equal(m.observe(nearBlack,1000).ok,false);
  // Uniform mid-grey is not black but carries no HUD features.
  const flat=sample(frame(64,36,()=>128),64,36);
  const r=m.observe(flat,1100);
  assert.equal(r.ok,false);
  assert.equal(r.state,'black');
});

test('a moving game frame is accepted and the monitor reports ok',()=>{
  const m=CH.create();
  let t=0;
  for(let i=0;i<8;i++){
    t+=37;
    const s=sample(frame(64,36,(x,y)=>40+((x*7+y*13+t)%180)),64,36);
    const r=m.observe(s,2000+i*80);
    assert.equal(r.ok,true,'moving frame '+i+' should be accepted, got '+r.state);
  }
  assert.equal(m.state,'ok');
});

test('a stalled stream that repeats the same frame is caught as frozen',()=>{
  const m=CH.create({freezeFrames:5});
  // A single busy frame, then an identical repeat: the track is live but the
  // source stopped painting. This is the fullscreen/occlusion failure.
  const busy=sample(frame(64,36,(x,y)=>30+((x*5+y*11)%200)),64,36);
  assert.equal(m.observe(busy,3000).ok,true);
  for(let i=0;i<6;i++){
    const r=m.observe(busy,3100+i*80);
    // The reference frame counts as run 1, so the threshold is reached on the
    // 4th repeat with freezeFrames:5.
    if(i>=4){assert.equal(r.ok,false,'repeating frame must stop being accepted');assert.equal(r.state,'frozen');}
  }
  assert.equal(m.state,'frozen');
});

test('a black burst does not poison the freeze reference and recovers cleanly',()=>{
  const m=CH.create({freezeFrames:5});
  const busy=sample(frame(64,36,(x,y)=>30+((x*5+y*11)%200)),64,36);
  m.observe(busy,4000);
  const black=sample(frame(64,36,()=>0),64,36);
  const r=m.observe(black,4100);
  assert.equal(r.ok,false);
  // The first real frame after the blackout must be accepted immediately,
  // not be treated as a huge jump away from the black frame.
  let t=90;
  for(let i=0;i<4;i++){
    t+=29;
    const back=m.observe(sample(frame(64,36,(x,y)=>30+((x*5+y*11+t)%200)),64,36),4200+i*80);
    assert.equal(back.ok,true,'frame after blackout '+i+' should be accepted, got '+back.state);
  }
  assert.equal(m.state,'ok');
});

test('track state alone is enough to reject a muted or ended source',()=>{
  const m=CH.create();
  const good=sample(frame(64,36,(x,y)=>20+((x*3+y*7)%200)),64,36);
  m.observe(good,5000);
  const muted=m.observe(Object.assign({},good,{trackState:'muted'}),5100);
  assert.equal(muted.ok,false);assert.equal(muted.state,'muted');
  const ended=m.observe(Object.assign({},good,{trackState:'ended'}),5200);
  assert.equal(ended.ok,false);assert.equal(ended.state,'ended');
});

test('an unexpected resolution change is reported so calibration can be checked',()=>{
  const m=CH.create();
  let t=0;
  const push=(w,h)=>{t+=31;return m.observe(sample(frame(w,h,(x,y)=>25+((x*5+y*t)%190)),w,h),6000+t);};
  push(128,72);push(128,72);
  assert.equal(m.resolutionChangedAt,0);
  // OBS Virtual Camera or a fullscreen resolution switch mid-match.
  const r=push(192,108);
  assert.ok(m.resolutionChangedAt>0,'resolution change must be timestamped');
  assert.equal(r.ok,true,'a new resolution is still a usable frame');
});

test('a first frame before any picture arrives is reported as starting',()=>{
  const m=CH.create();
  const r=m.observe({width:0,height:0,trackState:'live'},1000);
  assert.equal(r.ok,false);assert.equal(r.state,'starting');
});

test('monitor options are tunable and defaults are sane',()=>{
  const strict=CH.create({darkRatio:0.5});
  const grey=sample(frame(64,36,()=>20),64,36);
  // With a stricter dark ratio the same frame is still flat, but a normal
  // dark-heavy game frame would be judged differently than under the default.
  assert.equal(strict.options.darkRatio,0.5);
  assert.equal(CH.DEFAULTS.settleFrames,2);
  assert.ok(CH.analyze(frame(8,8,()=>255),8,8).mean>254);
});

test('recovery is signalled exactly once per outage',()=>{
  const m=CH.create({freezeFrames:3,settleFrames:2});
  const busy=sample(frame(64,36,(x,y)=>30+((x*5+y*11)%200)),64,36);
  m.observe(busy,7000);
  // Outage: repeated identical frames.
  let flags=[];
  for(let i=0;i<5;i++)flags.push(m.observe(busy,7100+i*80).recovered===true);
  assert.equal(flags.some(Boolean),false,'no recovery may be reported while still frozen');
  // Feed returns, still static for a frame or two before it truly moves.
  let t=0,reported=0;
  for(let i=0;i<8;i++){
    t+=41;
    const r=m.observe(sample(frame(64,36,(x,y)=>30+((x*5+y*11+t)%200)),64,36),7600+i*80);
    if(r.recovered)reported++;
  }
  assert.equal(reported,1,'recovery must be reported exactly once, saw '+reported);
  assert.equal(m.state,'ok');
  // A steady good feed afterwards must stay silent.
  t+=53;
  assert.equal(m.observe(sample(frame(64,36,(x,y)=>30+((x*5+y*11+t)%200)),64,36),8300).recovered,false);
});
