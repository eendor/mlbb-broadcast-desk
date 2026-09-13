const { test } = require('node:test'), assert = require('node:assert/strict');
const Swiss = require('../lib/swiss');
const { defaults, merge, validate } = require('../lib/state');

const TEAMS = ['ULS', 'USM EARTH SAVERS CLUB', 'JMES', 'FTSS', 'APO', 'ABES', 'PICE', 'DEVCOM', 'PSITS', 'JIECEP', 'JPEDS', 'AMS', 'FSMS', 'PNSA', 'ICPEP', 'UFTTS'];

test('Swiss starts with 8 Round 1 matches in bracket order', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  const m = Swiss.currentMatches(swiss);
  assert.equal(m.length, 8);
  assert.equal(m[0].blue, 'ULS');
  assert.equal(m[0].red, 'USM EARTH SAVERS CLUB');
  assert.equal(m[7].blue, 'ICPEP');
  assert.equal(m[7].red, 'UFTTS');
  assert.ok(m.every(x => x.pool === '0-0' && x.winner === null));
  Swiss.validateSwiss(swiss);
});

test('Swiss rejects bad team lists', () => {
  assert.throws(() => Swiss.startSwiss(TEAMS.slice(0, 15)), /exactly 16/);
  assert.throws(() => Swiss.startSwiss([...TEAMS.slice(0, 15), 'ULS']), /Duplicate/);
  assert.throws(() => Swiss.startSwiss(TEAMS.map(() => '  ')), /empty/);
});

test('completing Round 1 auto-generates 1-0 and 0-1 pools', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  for (const m of Swiss.currentMatches(swiss)) Swiss.reportResult(swiss, m.id, 'blue');
  assert.equal(swiss.currentRound, 2);
  const pools = [...new Set(Swiss.currentMatches(swiss).map(m => m.pool))];
  assert.deepEqual(pools, ['1-0', '0-1']);
  assert.equal(Swiss.currentMatches(swiss).length, 8);
  Swiss.validateSwiss(swiss);
});

test('full Swiss completes with 8 qualified and 8 eliminated', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  let guard = 0;
  while (!swiss.complete && guard++ < 8) {
    for (const [i, m] of Swiss.currentMatches(swiss).entries()) Swiss.reportResult(swiss, m.id, i % 2 ? 'red' : 'blue');
  }
  assert.equal(swiss.complete, true);
  assert.equal(Swiss.qualified(swiss).length, 8);
  assert.equal(Swiss.eliminated(swiss).length, 8);
  assert.equal(swiss.rounds.length, 5);
  Swiss.validateSwiss(swiss);
});

test('results can be corrected within the live round', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  Swiss.reportResult(swiss, 'R1M1', 'blue');
  Swiss.reportResult(swiss, 'R1M1', 'red');
  const uls = swiss.teams.find(t => t.name === 'ULS');
  assert.deepEqual([uls.w, uls.l], [0, 1]);
  Swiss.validateSwiss(swiss);
});

test('locked prior rounds and finished brackets reject edits', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  for (const m of Swiss.currentMatches(swiss)) Swiss.reportResult(swiss, m.id, 'blue');
  assert.throws(() => Swiss.reportResult(swiss, 'R1M1', 'red'), /locked/);
});

test('schedule rows fit overlay validation', () => {
  const { swiss } = Swiss.startSwiss(TEAMS);
  const rows = Swiss.toSchedule(swiss);
  assert.equal(rows.length, 8);
  const s = validate(merge(defaults(), { swiss, schedule: rows }));
  assert.equal(s.schedule.length, 8);
});

test('state accepts a null bracket and rejects a corrupt one', () => {
  validate(merge(defaults(), { swiss: null }));
  const { swiss } = Swiss.startSwiss(TEAMS);
  swiss.teams.length = 15;
  assert.throws(() => validate(merge(defaults(), { swiss })), /16/);
});

test('clearing a live result restores both records without advancing', () => {
  const {swiss} = Swiss.startSwiss(TEAMS);
  Swiss.reportResult(swiss,'R1M3','blue');
  Swiss.reportResult(swiss,'R1M3',null);
  assert.equal(Swiss.findMatch(swiss,'R1M3').winner,null);
  assert.ok(swiss.teams.every(t=>t.w===0&&t.l===0));
  assert.equal(swiss.currentRound,1);
});

test('name corrections preserve results, logos and future opponent history', () => {
  const {swiss} = Swiss.startSwiss(TEAMS);
  for(const match of Swiss.currentMatches(swiss)) Swiss.reportResult(swiss,match.id,'blue');
  const names = [...TEAMS];names[0]='University Laboratory School';
  const before = structuredClone(swiss.teams[0]);
  Swiss.renameTeams(swiss,names);
  assert.deepEqual(swiss.teams[0],{...before,name:names[0]});
  assert.equal(swiss.rounds[0].matches[0].blue,names[0]);
  assert.equal(swiss.rounds[1].matches[0].blue,names[0]);
  assert.ok(swiss.played.some(pair=>pair.includes(names[0])));
  const snapshot = structuredClone(swiss);
  assert.throws(()=>Swiss.renameTeams(swiss,Array(16).fill('Duplicate')),/Duplicate/);
  assert.deepEqual(swiss,snapshot);
});
