const {test}=require('node:test'),assert=require('node:assert/strict');
const Model=require('../public/live-detection-model'),{prepare}=require('../lib/live-detection'),{defaults,validate,merge}=require('../lib/state');
const body=(mode,readings)=>({mode,readings,live:true,switchScene:true,sampledAt:10000});
test('spectator names with brackets identify players and explicit computer heroes',()=>{
  const OCR=require('../public/ocr-model'),state=defaults();
  assert.equal(OCR.parse('[Computer] Aurora','blue.players.1.name'),'[Computer] Aurora');
  assert.equal(OCR.parse('<script>','blue.players.1.name'),null);
  assert.equal(Model.spectatorHero('[Computer] Aurora',[{name:'Aurora'}]),'Aurora');
  assert.equal(Model.spectatorHero('Aurora',[{name:'Aurora'}]),null);
  assert.equal(Model.spectatorHero('[Computer] Unknown',[{name:'Aurora'}]),null);
  const {patch}=prepare(state,body('game',[{field:'blue.players.1.name',value:'[Computer] Aurora'},{field:'blue.players.1.kda',value:'3/1/2'}]),10000);
  assert.equal(patch.blue.players[1].name,'[Computer] Aurora');assert.equal(patch.blue.players[1].kda,'3/1/2');
});
test('match result switches to postgame and synchronizes winner, score and player totals',()=>{
  const state=defaults();state.blue.players[0].name='eendor';state.red.players[0].name='[Computer] Dyrroth';
  const out=prepare(state,{...body('result',[
    {field:'resultStatus',value:'VICTORY'},{field:'blue.kills',value:16},{field:'red.kills',value:22},{field:'gameTime',value:'13:35'},
    {field:'blue.players.0.name',value:'eendor'},{field:'blue.players.0.kda',value:'3/6/0'},{field:'blue.players.0.gold',value:7187},
    {field:'red.players.0.name',value:'[Computer] Dyrroth'},{field:'red.players.0.kda',value:'8/4/0'},{field:'red.players.0.gold',value:7571}
  ]),live:false},10000);
  assert.equal(out.patch.scene,'postgame');assert.equal(out.patch.winner,'blue');assert.equal(out.patch.blue.kills,16);assert.equal(out.patch.red.kills,22);assert.equal(out.patch.gameTime,'13:35');
  assert.equal(out.patch.blue.players[0].gold,7187);assert.equal(out.patch.red.players[0].kda,'8/4/0');validate(merge(state,out.patch));
  assert.equal(Model.resultOutcome('DEFEAT'),'red');
});
test('result rows sync by table order without prior gameplay identity',()=>{
  const state=defaults();state.blue.players[2].name='Old identity';state.blue.players[2].hero='Akai';
  const out=prepare(state,{...body('result',[{field:'resultStatus',value:'VICTORY'},{field:'blue.players.2.name',value:'[Computer] Alpha'},{field:'blue.players.2.kda',value:'2/6/0'},{field:'blue.players.2.gold',value:5102}]),live:false},10000);
  assert.equal(out.held.length,0);assert.equal(out.patch.blue.players[2].name,'[Computer] Alpha');assert.equal(out.patch.blue.players[2].hero,'Akai');assert.equal(out.patch.blue.players[2].gold,5102);
});
test('live layouts fit the capture and detect distinct HUD evidence across frames',()=>{
  for(const [mode,rows]of Object.entries(Model.profiles))Model.validateRegions(rows,mode);
  const game=[{field:'gameTime',value:'01:47',confidence:95},{field:'red.kills',value:2,confidence:95}];
  const result=[{field:'resultStatus',value:'VICTORY',confidence:95}];
  assert.equal(Model.profiles.draft,undefined);assert.equal(Model.classify(game),'game');assert.equal(Model.classify(result),'result');
  assert.equal(Model.classify([game[0]]),null);
  const gate=Model.sceneGate();assert.equal(gate.observe('result'),null);assert.equal(gate.observe('game'),null);assert.equal(gate.observe('game'),'game');assert.equal(gate.observe(null),null);assert.equal(gate.observe('game'),null);
});
test('spectator KDA follows a uniquely recognized hero when player rows reorder',()=>{
  const state=defaults();state.blue.players[0].hero='Akai';state.blue.players[0].name='TEAM Captain';state.blue.players[1].hero='Fanny';
  const {patch}=prepare(state,body('game',[{field:'blue.players.3.hero',value:'Akai'},{field:'blue.players.3.name',value:'Captain'},{field:'blue.players.3.kda',value:'4/1/2'},{field:'gameTime',value:'01:47'}]),10000);
  assert.equal(patch.blue.players[0].kda,'4/1/2');assert.equal(patch.blue.players[0].name,'TEAM Captain');assert.equal(patch.blue.players[1].hero,'Fanny');assert.equal(patch.scene,'scoreboard');assert.equal(patch.gameClock.seconds,107);validate(merge(state,patch));
});
test('unidentified or conflicting player rows never overwrite a populated roster',()=>{
  const state=defaults();state.blue.players.forEach((p,i)=>{p.name='Known '+i;p.hero=['Akai','Fanny','Alpha','Aamon','Angela'][i];});
  const out=prepare(state,body('game',[{field:'blue.players.0.kda',value:'8/1/1'}]),10000);
  assert.equal(out.patch.blue,undefined);assert.equal(out.held.length,1);
  const conflict=prepare(state,body('game',[{field:'blue.players.0.hero',value:'Akai'},{field:'blue.players.1.hero',value:'Akai'},{field:'blue.players.1.kda',value:'8/1/1'}]),10000);
  assert.equal(conflict.patch.blue,undefined);
});
test('draft detection is rejected while manual draft state remains untouched',()=>{
  const state=defaults();state.blue.bans[0]='Fanny';
  assert.throws(()=>prepare(state,body('draft',[]),10000));
  assert.throws(()=>prepare(state,body('game',[{field:'blue.bans.0',value:'Akai'}]),10000));
  const manual=prepare(state,{...body('game',[]),switchScene:false},10000);assert.equal(manual.patch.scene,undefined);assert.equal(state.blue.bans[0],'Fanny');
});
