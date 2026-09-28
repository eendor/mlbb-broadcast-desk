const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('manual cloud analysis never disturbs the live local detection session',async t=>{
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ml-cloud-ai-'));
  const {app}=require('../server');
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(url,data)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};};

  // The local realtime OCR loop owns a detection session and drives the clock.
  const start=await post('/api/detection/start',{});
  assert.equal(start.status,200);
  const session=start.body.session;
  const now=Date.now();
  const live=await post('/api/detection',{session,mode:'game',sampledAt:now,readings:[{field:'gameTime',value:'07:24'}],live:true,switchScene:true});
  assert.ok(live.body.applied>=0);
  let state=await (await fetch(base+'/api/state')).json();
  assert.equal(state.gameTime,'07:24');
  assert.equal(state.gameClock.running,true);

  // A cloud request never receives or requires a detection session. Whether a
  // key is configured on this machine or not, the request must fail or succeed
  // without ever touching the local loop.
  const junkImage=await post('/api/ai/analyze',{image:'not-an-image',mode:'result'});
  assert.equal(junkImage.status,400);
  assert.ok(junkImage.body.error);

  const stateAfterCloud=await (await fetch(base+'/api/state')).json();
  assert.equal(stateAfterCloud.gameTime,'07:24');
  assert.equal(stateAfterCloud.gameClock.running,true);

  // The same session still applies newer local values => the local loop was not
  // replaced or expired by any cloud call.
  const later=await post('/api/detection',{session,mode:'game',sampledAt:now+500,readings:[{field:'blue.kills',value:4}],live:true,switchScene:true});
  assert.equal(later.body.expired,undefined);
  state=await (await fetch(base+'/api/state')).json();
  assert.equal(state.blue.kills,4);
  assert.equal(state.gameTime,'07:24');

  // The cloud endpoint rejects an unsupported mode and an empty image without
  // disturbing the live session.
  const badMode=await post('/api/ai/analyze',{image:'not-an-image',mode:'bogus',provider:'gemini',apiKey:'x'});
  assert.equal(badMode.status,400);
  const noImage=await post('/api/ai/analyze',{mode:'result',apiKey:'x'});
  assert.equal(noImage.status,400);
  const stillLive=await post('/api/detection',{session,mode:'game',sampledAt:now+900,readings:[{field:'red.kills',value:2}],live:true,switchScene:true});
  assert.equal(stillLive.body.expired,undefined);
});

test('post-match screenshot analysis defaults to Codex and stays isolated from realtime detection',async t=>{
  process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ml-codex-scoreboard-'));
  const CodexVision=require('../lib/codex-vision');
  const {app}=require('../server');
  let args;
  t.mock.method(CodexVision.CodexVision.prototype,'analyzeLiveScreen',async(...callArgs)=>{
    args=callArgs;
    return {mode:'result',engine:'Codex (gpt-6-luna Fast / low)',model:'gpt-6-luna',effort:'low',speedTier:'fast',data:{winner:'blue',gameTime:'14:32',blue:{players:[{name:'Blue player'}]},red:{players:[{name:'Red player'}]}},patch:{scene:'postgame'}};
  });
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,AAAA',mode:'result'})});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.provider,'codex');
  assert.equal(result.model,'gpt-6-luna');
  assert.equal(result.speedTier,'fast');
  assert.equal(args[0],'data:image/jpeg;base64,AAAA');
  assert.equal(args[3].realtime,false);
  assert.equal(result.autoApplied,false);
  const GeminiVision=require('../lib/gemini-vision');
  let geminiCalled=false;
  t.mock.method(GeminiVision,'analyzeScoreboard',async()=>{
    geminiCalled=true;
    return {engine:'Gemini Vision AI (fixture)',data:{winner:'red',gameTime:'10:00',blue:{players:[{name:'Blue player'}]},red:{players:[{name:'Red player'}]}},patch:{scene:'postgame'}};
  });
  const gemini=await fetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'fixture',mode:'result',provider:'gemini',apiKey:'test-key'})});
  assert.equal(gemini.status,200);
  assert.equal((await gemini.json()).provider,'gemini');
  assert.equal(geminiCalled,true);
});

test('postgame OCR exposes a real cloud entry point and no longer stubs it as local',()=>{
  const PostgameOCR=require('../public/postgame-ocr');
  assert.equal(typeof PostgameOCR.scanWithCloud,'function');
  // The old misleading alias pointed at local OCR; it must be gone.
  assert.equal(PostgameOCR.scanWithAI,undefined);
  assert.equal(typeof PostgameOCR.scanSource,'function');
});

test('cloud analysis requires the browser desk and reports a clear error headless',async()=>{
  const PostgameOCR=require('../public/postgame-ocr');
  await assert.rejects(()=>PostgameOCR.scanWithCloud({width:1920,height:1080}),/broadcast desk/i);
});

test('an empty cloud roster is reported instead of rendered as blank match data',()=>{
  const {cloudResultIssue}=require('../public/postgame-ocr');
  // The exact failure the live API returned on an unreadable capture:
  // team names resolved, but the player table came back empty.
  const emptyBoth={winner:'blue',gameTime:'00:00',
    blue:{teamId:'APO',teamName:'Alpha Phi Omega',kills:0,gold:0,players:[]},
    red:{teamId:'N/A',teamName:'N/A',kills:0,gold:0,players:[]}};
  assert.match(cloudResultIssue(emptyBoth),/blue and red player table/);
  // Only the blue table unreadable names just that side.
  assert.match(cloudResultIssue({...emptyBoth,red:{...emptyBoth.red,players:[{name:'Eendor',hero:'Akai'}]}}),/blue player table/);
  // Placeholder "?" names are not a readable roster either.
  assert.match(cloudResultIssue({...emptyBoth,red:{...emptyBoth.red,players:[{name:'?'}]}}),/red player table/);
  // A genuine roster passes.
  assert.equal(cloudResultIssue({winner:'red',gameTime:'13:35',
    blue:{teamName:'Blue',players:Array.from({length:5},(_,i)=>({name:'Player '+i,hero:'Akai'}))},
    red:{teamName:'Red',players:Array.from({length:5},(_,i)=>({name:'Enemy '+i,hero:'Fanny'}))}}),null);
  // Missing structure is still caught.
  assert.match(cloudResultIssue(null),/no readable scoreboard/);
  assert.match(cloudResultIssue({}),/no readable scoreboard/);
  assert.match(cloudResultIssue({blue:{}}),/no readable scoreboard/);
  // Present sides with no player rows are reported per side instead.
  assert.match(cloudResultIssue({blue:{},red:{}}),/blue and red player table/);
});
