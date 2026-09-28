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
  assert.ok(Model.profiles.game.some(r=>r.field==='blue.turtle'));assert.ok(Model.profiles.game.some(r=>r.field==='red.turtle'));
  const game=[{field:'gameTime',value:'01:47',confidence:95},{field:'red.kills',value:2,confidence:95}];
  const result=[{field:'resultStatus',value:'VICTORY',confidence:95}];
  assert.equal(Model.profiles.draft.filter(r=>Model.isHero(r.field)).length,20);assert.equal(Model.classify(game),'game');assert.equal(Model.classify(result),'result');
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
test('draft sync accepts five bans, phase and countdown without changing match data',()=>{
  const state=defaults();state.blue.bans[0]='Fanny';
  state.schedule=[{time:'20:00',blue:'Original',red:'Opponent',note:'Scheduled'}];
  const before=structuredClone(state);
  const out=prepare(state,body('draft',[{field:'draftPhase',value:'Enemy Team Pick'},{field:'draftTimer.remaining',value:19},{field:'blue.bans.4',value:'Paquito'},{field:'red.players.4.hero',value:'Suyou'}]),10000);
  assert.equal(out.patch.scene,'draft');assert.equal(out.patch.phase,'Enemy Team Pick');assert.equal(out.patch.draftTimer.endAt,29000);
  assert.equal(out.patch.blue.bans[0],'Fanny');assert.equal(out.patch.blue.bans[4],'Paquito');assert.equal(out.patch.red.players[4].hero,'Suyou');
  const merged=validate(merge(structuredClone(state),out.patch));assert.deepEqual(merged.schedule,before.schedule);assert.deepEqual(state,before);
  assert.throws(()=>prepare(state,body('draft',[{field:'blue.bans.5',value:'Akai'}]),10000));
  assert.throws(()=>prepare(state,body('draft',[{field:'blue.players.1.hero',value:'Unknown hero'}]),10000));
  assert.throws(()=>prepare(state,body('game',[{field:'blue.bans.0',value:'Akai'}]),10000));
  const manual=prepare(state,{...body('game',[]),switchScene:false},10000);assert.equal(manual.patch.scene,undefined);assert.equal(state.blue.bans[0],'Fanny');
});

test('draft requires both its explicit heading and a valid countdown',()=>{
  const phase={field:'draftPhase',value:'Allied Team Ban',confidence:96},clock={field:'draftTimer.remaining',value:21,confidence:96};
  assert.equal(Model.classify([phase,clock]),'draft');assert.equal(Model.classify([phase]),null);
  assert.equal(Model.draftClock('00:21'),21);assert.equal(Model.draftClock('6'),6);assert.equal(Model.draftClock('01:21'),null);
  assert.equal(Model.draftPhase('Last Change'),'Last Changes');assert.equal(Model.draftPhase('BAN PHASE'),null);
  const state=defaults();state.blue.bans=['','',''];validate(state);
  const {patch}=prepare(state,body('draft',[{field:'blue.bans.4',value:'Paquito'}]),10000);assert.equal(patch.blue.bans.length,5);validate(merge(state,patch));
});

test('calibrated spectator boxes match 1080p MLBB spectator layout exactly',()=>{
  const game = Model.profiles.game;
  const find = f => game.find(r => r.field === f);
  assert.deepEqual([find('gameTime').x, find('gameTime').y, find('gameTime').w, find('gameTime').h], [915, 38, 90, 42]);
  assert.deepEqual([find('blue.kills').x, find('blue.kills').y, find('blue.kills').w, find('blue.kills').h], [840, 38, 68, 44]);
  assert.deepEqual([find('red.kills').x, find('red.kills').y, find('red.kills').w, find('red.kills').h], [1012, 38, 68, 44]);
  assert.deepEqual([find('blue.gold').x, find('blue.gold').y, find('blue.gold').w, find('blue.gold').h], [742, 40, 85, 40]);
  assert.deepEqual([find('red.gold').x, find('red.gold').y, find('red.gold').w, find('red.gold').h], [1092, 40, 85, 40]);
  assert.deepEqual([find('blue.turrets').x, find('blue.turrets').y, find('blue.turrets').w, find('blue.turrets').h], [672, 40, 32, 40]);
  assert.deepEqual([find('red.turrets').x, find('red.turrets').y, find('red.turrets').w, find('red.turrets').h], [1216, 40, 32, 40]);
  assert.deepEqual([find('blue.players.0.name').x, find('blue.players.0.name').y, find('blue.players.0.name').w, find('blue.players.0.name').h], [10, 380, 160, 24]);
  assert.deepEqual([find('blue.players.0.kda').x, find('blue.players.0.kda').y, find('blue.players.0.kda').w, find('blue.players.0.kda').h], [72, 404, 92, 24]);
  assert.deepEqual([find('blue.players.0.level').x, find('blue.players.0.level').y, find('blue.players.0.level').w, find('blue.players.0.level').h], [6, 432, 26, 22]);
  assert.deepEqual([find('blue.players.0.hero').x, find('blue.players.0.hero').y, find('blue.players.0.hero').w, find('blue.players.0.hero').h], [14, 390, 46, 46]);
  assert.deepEqual([find('red.players.0.name').x, find('red.players.0.name').y, find('red.players.0.name').w, find('red.players.0.name').h], [1745, 380, 160, 24]);
  assert.deepEqual([find('red.players.0.kda').x, find('red.players.0.kda').y, find('red.players.0.kda').w, find('red.players.0.kda').h], [1745, 404, 92, 24]);
  assert.deepEqual([find('red.players.0.level').x, find('red.players.0.level').y, find('red.players.0.level').w, find('red.players.0.level').h], [1888, 432, 26, 22]);
  assert.deepEqual([find('red.players.0.hero').x, find('red.players.0.hero').y, find('red.players.0.hero').w, find('red.players.0.hero').h], [1860, 390, 46, 46]);
});

test('monotonic stat guards prevent kills, turrets, levels and kda from jumping downwards',()=>{
  const state = defaults();
  state.blue.kills = 8;
  state.blue.turrets = 3;
  state.blue.players[0].name = 'Player 1';
  state.blue.players[0].hero = 'Akai';
  state.blue.players[0].level = 9;
  state.blue.players[0].kda = '4/1/3';

  // Attempt to apply lower values due to temporary OCR misreads
  const out = prepare(state, body('game', [
    { field: 'blue.kills', value: 7 }, // lower than 8 -> held
    { field: 'blue.turrets', value: 2 }, // lower than 3 -> held
    { field: 'blue.players.0.hero', value: 'Akai' },
    { field: 'blue.players.0.level', value: 8 }, // lower than 9 -> held
    { field: 'blue.players.0.kda', value: '3/1/3' }, // kills decreased -> held
  ]), 10000);

  assert.equal(out.patch.blue?.kills, undefined);
  assert.equal(out.patch.blue?.turrets, undefined);
  assert.equal(out.patch.blue?.players?.[0]?.level, 9);
  assert.equal(out.patch.blue?.players?.[0]?.kda, '4/1/3');
  assert.equal(out.held.length, 4);

  // Valid non-decreasing values should apply cleanly
  const outGood = prepare(state, body('game', [
    { field: 'blue.kills', value: 9 },
    { field: 'blue.turrets', value: 4 },
    { field: 'blue.players.0.hero', value: 'Akai' },
    { field: 'blue.players.0.level', value: 10 },
    { field: 'blue.players.0.kda', value: '5/1/4' },
  ]), 10000);

  assert.equal(outGood.patch.blue.kills, 9);
  assert.equal(outGood.patch.blue.turrets, 4);
  assert.equal(outGood.patch.blue.players[0].level, 10);
  assert.equal(outGood.patch.blue.players[0].kda, '5/1/4');
  assert.equal(outGood.held.length, 0);
});

test('draft is detected during settling phases that display no countdown',()=>{
  const c=95,ph=v=>({field:'draftPhase',value:v,confidence:c}),tm=v=>({field:'draftTimer.remaining',value:v,confidence:c});
  // Ban/Pick always draw a countdown, so it is still required there.
  assert.equal(Model.classify([ph('Allied Team Ban'),tm(20)],65),'draft');
  assert.equal(Model.classify([ph('Allied Team Ban')],65),null);
  // Settling phases show no timer at all; the phase alone must be enough,
  // otherwise the desk drops out of draft for the whole phase.
  for(const phase of ['Last Change','Last Changes','Battle Preparation','Swap Heroes','Adjustment'])
    assert.equal(Model.classify([ph(phase)],65),'draft',phase);
  // Gameplay evidence must not be mistaken for a draft phase.
  assert.equal(Model.classify([{field:'gameTime',value:'08:12',confidence:95},{field:'blue.kills',value:5,confidence:95}],65),'game');
  assert.equal(Model.classify([ph('Some Unrelated Heading')],65),null);
  assert.equal(Model.classify([{field:'draftPhase',value:'Last Changes',confidence:30}],65),null);
  assert.equal(Model.phaseHasCountdown('Allied Team Pick'),true);
  assert.equal(Model.phaseHasCountdown('Last Changes'),false);
});
test('live OCR applies in-game Turtle counts to both teams',()=>{const state=defaults();const out=prepare(state,body('game',[{field:'blue.turtle',value:2},{field:'red.turtle',value:1}]),10000);assert.equal(out.patch.blue.turtle,2);assert.equal(out.patch.red.turtle,1);validate(merge(state,out.patch));});

test('draft clock accepts the drawn countdown formats',()=>{
  assert.equal(Model.draftClock('00:21'),21);
  assert.equal(Model.draftClock('00:59'),59);
  assert.equal(Model.draftClock('6'),6);
  assert.equal(Model.draftClock('01:21'),null);
  assert.equal(Model.draftClock(''),null);
});
