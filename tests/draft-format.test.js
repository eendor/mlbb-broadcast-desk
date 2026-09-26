const {test}=require('node:test'),assert=require('node:assert/strict');
const Playoffs=require('../public/playoffs-model');
const DraftFormat=require('../public/draft-format');
const {defaults,validate}=require('../lib/state');

const roster=id=>Playoffs.team(id).players.slice(0,5).map((name,i)=>({name,role:['EXP','JUNGLE','MID','GOLD','ROAM'][i],hero:'',kda:'0/0/0',gold:0,level:0}));

test('quarterfinal pairings and the default state use three bans per side',()=>{
  const s=defaults();
  assert.equal(DraftFormat.roundKey(s),'quarterfinals');
  assert.equal(DraftFormat.banCount(s),3);
  s.blue.tag='JMES';s.blue.name=Playoffs.team('JMES').name;
  s.red.tag='PSITS';s.red.name=Playoffs.team('PSITS').name;
  assert.equal(DraftFormat.roundKey(s),'quarterfinals');
  assert.equal(DraftFormat.banCount(s),3);
});

test('semifinal pairings use five bans per side',()=>{
  const s=defaults();
  s.playoffs=Playoffs.migrate(s.playoffs);
  s.playoffs.matches[0].blueScore=2;
  s.playoffs.matches[1].blueScore=2;
  s.blue.tag='JMES';
  s.red.tag='ULS-CED';
  assert.equal(DraftFormat.roundKey(s),'semifinals');
  assert.equal(DraftFormat.banCount(s),5);
});

test('stage text names the third place and grand final rounds',()=>{
  const s=defaults();
  s.stage='THIRD PLACE MATCH';
  assert.equal(DraftFormat.roundKey(s),'third');
  assert.equal(DraftFormat.banCount(s),5);
  s.stage='GRAND FINALS';
  assert.equal(DraftFormat.roundKey(s),'final');
  assert.equal(DraftFormat.banCount(s),5);
  s.stage='SEMIFINALS';
  assert.equal(DraftFormat.banCount(s),5);
  s.stage='QUARTERFINALS';
  assert.equal(DraftFormat.banCount(s),3);
});

test('registered player IGNs identify the round when tags are not set',()=>{
  const s=defaults();
  s.blue.tag='';s.blue.name='';s.blue.players=roster('JMES');
  s.red.tag='';s.red.name='';s.red.players=roster('PSITS');
  assert.equal(DraftFormat.roundKey(s),'quarterfinals');
  assert.equal(DraftFormat.banCount(s),3);
});

test('reading the ban format never mutates the playoff bracket',()=>{
  const s=defaults();
  s.playoffs=Playoffs.migrate(s.playoffs);
  s.playoffs.matches[0].blueScore=2;
  const before=JSON.stringify(s.playoffs);
  DraftFormat.roundKey(s);
  DraftFormat.banCount(s);
  assert.equal(JSON.stringify(s.playoffs),before);
  validate(s);
});
