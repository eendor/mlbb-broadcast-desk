const {test}=require('node:test'),assert=require('node:assert/strict');
const Playoffs=require('../public/playoffs-model');
const Results=require('../lib/playoff-results');
const {normalize}=require('../lib/parser');
const {defaults,merge,validate}=require('../lib/state');

function result(blue='JMES',red='PSITS',winner='blue',seconds=900){
  return {data:{status:'result',battleData:{win_camp:winner==='blue'?2:1,blue_camp_kill:24,red_camp_kill:12,game_time:seconds,player_list:
    [[blue,2],[red,1]].flatMap(([id,camp])=>Playoffs.team(id).players.slice(0,5).map((name,pos)=>({camp,pos,name,kill_num:pos,dead_num:1,assist_num:2,gold_total:6000+pos,heroid:1,equip_list:[]})))}}};
}
function apply(state,raw,options){const out=Results.prepareResult(state,normalize(raw,{}, {},state).patch,options);return {...out,state:validate(merge(structuredClone(state),out.patch))};}

test('registered IGNs identify organizations despite case, decoration, small caps and substitutes',()=>{
  const OCR=require('../public/ocr-model');for(const t of Playoffs.teams)for(const ign of t.players)assert.equal(OCR.parse(ign,'blue.players.0.name'),ign);
  assert.equal(Playoffs.identify(['NADSKIE','yaoshi','ᴇʟᴇᴠᴇɴ','Unknown','MORRIE'])?.team.id,'UFTTS');
  assert.equal(Playoffs.identify(['CHEIFUU','FLINS','hedgehog'])?.team.id,'JMES');
  assert.equal(Playoffs.identify(['CEEJAY','CEEJAY','CEEJAY','CEEJAY','Unknown']),null);
  assert.equal(Playoffs.identify(['CEEJAY','Gravity','Unknown','Unlisted','Other']),null);
  const patch=normalize(result()).patch;
  assert.deepEqual({name:patch.blue.name,tag:patch.blue.tag,logo:patch.blue.logo},Playoffs.identity(Playoffs.team('JMES')));
  assert.equal(patch.red.tag,'PSITS');assert.equal(patch.winner,'blue');
});

test('wins belong to the organization after sides swap, clinch BO3 and advance the correct semifinal slot',()=>{
  const original=defaults(),snapshot=structuredClone(original);
  let out=apply(original,result(),{id:'game_001'});
  assert.deepEqual(original,snapshot);assert.equal(out.report.status,'applied');
  assert.equal(out.state.playoffs.matches[0].blueScore,1);assert.equal(out.state.blue.score,1);assert.equal(out.state.game,1);
  out=apply(out.state,result('PSITS','JMES','red',960),{id:'game_002'});
  assert.equal(out.state.winner,'red');assert.equal(out.state.red.tag,'JMES');assert.equal(out.state.red.score,2);assert.equal(out.state.blue.score,0);
  assert.equal(out.state.playoffs.matches[0].blueScore,2);assert.equal(out.state.playoffs.matches[0].redScore,0);
  assert.equal(out.report.clinched,true);assert.equal(Playoffs.resolved(out.state.playoffs)[4].blue,'JMES');
  assert.equal(Playoffs.resolved(out.state.playoffs)[4].red,'');assert.equal(out.state.game,2);
  assert.deepEqual(out.state.schedule,original.schedule);assert.deepEqual(out.state.swiss,original.swiss);
});

test('result history survives persistence, blocks replays and detects conflicting winners',()=>{
  const first=apply(defaults(),result(),{id:'game_001'});
  const restored=JSON.parse(JSON.stringify(first.state));
  const again=apply(restored,result(),{id:'game_001'});
  assert.equal(again.report.status,'duplicate');assert.equal(again.state.playoffs.matches[0].blueScore,1);
  assert.equal(again.state.playoffs.results.length,1);
  const conflict=apply(restored,result('JMES','PSITS','red'),{id:'game_001'});
  assert.equal(conflict.report.status,'conflict');assert.equal(conflict.state.playoffs.matches[0].redScore,0);
  const capture=apply(restored,result(),{source:'capture'});
  assert.equal(capture.report.status,'duplicate');
  const distinct=apply(restored,result(),{id:'game_002'});
  assert.equal(distinct.report.status,'applied','Different official IDs identify distinct games even with identical statistics');
});

test('unmatched rosters, disabled automation and incomplete outcomes cannot change playoff scores',()=>{
  const state=defaults();
  assert.equal(apply(state,result('PICE','ULS-CED'),{}).report.status,'unmatched');
  const raw=result();raw.data.battleData.win_camp=0;
  const pending=apply(state,raw,{});assert.equal(pending.report.status,'waiting');assert.equal(pending.state.playoffs.matches[0].blueScore,0);
  state.playoffs.autoResults=false;
  const disabled=apply(state,result(),{});assert.equal(disabled.report.status,'disabled');assert.equal(disabled.state.blue.tag,'JMES');assert.equal(disabled.state.playoffs.results.length,0);
});

test('BO5 series advances at three wins and rejects further games in a completed series',()=>{
  let state=defaults();state.playoffs.bestOf[0]=5;
  for(let i=1;i<=3;i++){
    const out=apply(state,result('JMES','PSITS','blue',900+i),{id:'bo5_'+i+'00'});state=out.state;
    assert.equal(out.report.clinched,i===3);assert.equal(state.bestOf,5);
  }
  const extra=apply(state,result('JMES','PSITS','red',999),{id:'bo5_extra'});
  assert.equal(extra.report.status,'complete');assert.equal(extra.state.playoffs.matches[0].redScore,0);
});

test('live result batches need fresh roster evidence and remain latched across capture restarts',()=>{
  let state=defaults();state.blue.players=normalize(result()).patch.blue.players;state.red.players=normalize(result()).patch.red.players;
  const observed=new Map();
  const deliver=(mode,readings)=>{
    const out=Results.prepareDetection(state,{mode,readings},observed);
    state=validate(merge(state,out.patch));return out;
  };
  let out=deliver('result',[{field:'resultStatus',value:'VICTORY'},{field:'gameTime',value:'15:00'},{field:'blue.kills',value:24},{field:'red.kills',value:12}]);
  assert.equal(out.report.status,'waiting','Existing on-air rosters cannot identify a new captured result');
  for(let i=0;i<3;i++)out=deliver('result',['blue','red'].map(side=>({field:side+'.players.'+i+'.name',value:state[side].players[i].name})));
  assert.equal(out.report.status,'applied');assert.equal(state.playoffs.matches[0].blueScore,1);assert.equal(state.playoffs.captureArmed,false);
  out=deliver('result',[{field:'blue.kills',value:25}]);assert.equal(out.report.status,'held');assert.equal(state.playoffs.results.length,1);
  const restarted=Results.prepareDetection(JSON.parse(JSON.stringify(state)),{mode:'result',readings:[...observed].map(([field,value])=>({field,value}))},new Map());
  assert.equal(restarted.report.status,'held');
  observed.clear();deliver('game',[{field:'gameTime',value:'00:45'}]);assert.equal(state.playoffs.captureArmed,true);
});

test('old four-match playoff backups migrate with automatic advancement and result history defaults',()=>{
  const p=Playoffs.defaults();const legacy={matches:p.matches.slice(0,4),featuredTeam:p.featuredTeam,useVideo:false,bestOf:p.bestOf,portraits:[]};
  const migrated=Playoffs.validate(Playoffs.migrate(legacy));assert.equal(migrated.matches.length,7);assert.equal(migrated.autoResults,true);assert.deepEqual(migrated.results,[]);
});

module.exports={result};
