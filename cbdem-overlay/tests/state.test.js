'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_STATE, sanitizePatch, normalizeState } = require('../lib/state');

const TEAMS = ['JPES', 'JMES', 'JPSPA', 'JPIA', 'JPAMS'];
const base = () => normalizeState({}, TEAMS);

test('defaults are complete and valid', () => {
  const state = base();
  assert.equal(state.blueTeam, 'JPES');
  assert.equal(state.redTeam, 'JMES');
  assert.equal(state.tournamentTitle, 'CBDEM DAGYAWAN 2026');
  assert.deepEqual(state.calibration, { center: 960, width: 945, height: 55, offsetY: 0 });
  assert.equal(state.partners.length, 2);
  assert.equal(state.partners[0].logo, 'msl-ph.png');
  assert.deepEqual(state.partners[1], { name: 'UEC PRODUCTION', logo: 'uec-production.png', show: true });
  assert.notEqual(state.partners, DEFAULT_STATE.partners, 'defaults must be copied, not shared');
});

test('team ids are normalised and checked against teams.json', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { blueTeam: ' jpia ' }, TEAMS), { blueTeam: 'JPIA' });
  assert.deepEqual(sanitizePatch(state, { blueTeam: 'NOPE' }, TEAMS), {});
  assert.deepEqual(sanitizePatch(state, { redTeam: 42 }, TEAMS), {});
});

test('picking the other side\'s team swaps sides and scores', () => {
  const state = { ...base(), blueScore: 1, redScore: 2 };
  assert.deepEqual(sanitizePatch(state, { blueTeam: 'JMES' }, TEAMS), {
    blueTeam: 'JMES', redTeam: 'JPES', blueScore: 2, redScore: 1,
  });
  assert.deepEqual(sanitizePatch(state, { redTeam: 'JPES' }, TEAMS), {
    redTeam: 'JPES', blueTeam: 'JMES', redScore: 1, blueScore: 2,
  });
});

test('both sides can never hold the same team', () => {
  const state = base();
  const out = sanitizePatch(state, { blueTeam: 'JPIA', redTeam: 'JPIA' }, TEAMS);
  assert.notEqual(out.blueTeam || state.blueTeam, out.redTeam || state.redTeam);
});

test('scores are whole numbers from 0 to 4', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { blueScore: 9, redScore: -3 }, TEAMS), { blueScore: 4, redScore: 0 });
  assert.deepEqual(sanitizePatch(state, { blueScore: '2', redScore: 1.6 }, TEAMS), { blueScore: 2, redScore: 2 });
  assert.deepEqual(sanitizePatch(state, { blueScore: 'abc', redScore: null }, TEAMS), {});
});

test('text is trimmed, single-spaced and capped at 60 characters', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { format: '  BO3   GRAND  FINALS ' }, TEAMS), { format: 'BO3 GRAND FINALS' });
  assert.equal(sanitizePatch(state, { tournamentTitle: 'X'.repeat(80) }, TEAMS).tournamentTitle.length, 60);
  assert.deepEqual(sanitizePatch(state, { format: 3 }, TEAMS), {});
  assert.deepEqual(sanitizePatch(state, { tournamentSubtitle: '' }, TEAMS), { tournamentSubtitle: '' });
});

test('switches only accept true or false', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { showEvent: false, sheen: true }, TEAMS), { showEvent: false, sheen: true });
  assert.deepEqual(sanitizePatch(state, { showEvent: 'false', showScore: 0 }, TEAMS), {});
});

test('glass is a whole number from 0 to 100', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { glass: 140 }, TEAMS), { glass: 100 });
  assert.deepEqual(sanitizePatch(state, { glass: 42.4 }, TEAMS), { glass: 42 });
  assert.deepEqual(sanitizePatch(state, { glass: 'lots' }, TEAMS), {});
});

test('calibration merges single keys and clamps each one', () => {
  const state = base();
  assert.deepEqual(sanitizePatch(state, { calibration: { center: 962 } }, TEAMS).calibration,
    { center: 962, width: 945, height: 55, offsetY: 0 });
  assert.deepEqual(sanitizePatch(state, { calibration: { center: 2000, width: 10, height: 999, offsetY: -99 } }, TEAMS).calibration,
    { center: 1020, width: 800, height: 90, offsetY: -20 });
  assert.deepEqual(sanitizePatch(state, { calibration: { bogus: 1 } }, TEAMS), {});
  assert.deepEqual(sanitizePatch(state, { calibration: [1, 2] }, TEAMS), {});
});

test('partners are capped at 4 and logo names are checked', () => {
  const state = base();
  const out = sanitizePatch(state, {
    partners: [
      { name: '  MSL   Philippines ', logo: 'msl-ph.png', show: false },
      { name: 'Hack', logo: '../../server.js' },
      { name: 'Svg', logo: 'logo.svg' },
      { name: '', logo: '' },
      { name: 'Fifth', logo: '' },
    ],
  }, TEAMS);
  assert.equal(out.partners.length, 4);
  assert.deepEqual(out.partners[0], { name: 'MSL Philippines', logo: 'msl-ph.png', show: false });
  assert.equal(out.partners[1].logo, '');
  assert.equal(out.partners[2].logo, '');
  assert.equal(out.partners[1].show, true);
  assert.deepEqual(out.partners[3], { name: '', logo: '', show: true }, 'empty rows stay so the panel can fill them in');
  assert.equal(sanitizePatch(state, { partners: [{ name: 'X'.repeat(50) }] }, TEAMS).partners[0].name.length, 40);
  assert.deepEqual(sanitizePatch(state, { partners: 'MSL' }, TEAMS), {});
});

test('unknown keys are ignored', () => {
  assert.deepEqual(sanitizePatch(base(), { hacked: true, updatedAt: 'now', __proto__: { x: 1 } }, TEAMS), {});
  assert.deepEqual(sanitizePatch(base(), null, TEAMS), {});
  assert.deepEqual(sanitizePatch(base(), [1, 2], TEAMS), {});
});

test('state saved by older versions is upgraded and the caster card keys are dropped', () => {
  const old = {
    blueTeam: 'JPES', redTeam: 'JMES', blueScore: 1, redScore: 0, format: 'BO3 GRAND FINALS',
    tournamentTitle: 'CBDEM MLBB TOURNAMENT', tournamentSubtitle: 'UNIVERSITY OF SOUTHERN MINDANAO',
    caster: 'GLEN', showCaster: true, showScore: true, updatedAt: '2026-10-12T18:07:08.814Z',
  };
  const state = normalizeState(old, TEAMS);
  assert.equal(state.blueScore, 1);
  assert.equal('caster' in state, false);
  assert.equal('showCaster' in state, false);
  assert.equal(state.showPartners, true);
  assert.equal(state.glass, 60);
  assert.equal(state.partners.length, 2);
  assert.equal(state.updatedAt, old.updatedAt);
});

test('a damaged state file falls back to defaults', () => {
  const state = normalizeState({ blueTeam: 'XYZ', blueScore: 'many', calibration: 'wide', partners: {} }, TEAMS);
  assert.equal(state.blueTeam, 'JPES');
  assert.equal(state.blueScore, 0);
  assert.deepEqual(state.calibration, { center: 960, width: 945, height: 55, offsetY: 0 });
  assert.equal(state.partners.length, 2);
});
