const test = require('node:test');
const assert = require('node:assert/strict');
const Gemini = require('../lib/gemini-vision');
const AiState = require('../lib/ai-live-state');
const { defaults } = require('../lib/state');

test('shuffled player rows keep levels and partly readable equipment attached to their slots', () => {
  const state = defaults(), memory = new Map();
  const raw = { blue: { players: [
    { slot: 3, name: '[Computer] Miya', hero: 'Miya', level: 9, itemsVisible: true, items: ['Demon Boots', '?', 'Windtalker'] },
    { slot: 0, name: '[Computer] Layla', hero: 'Layla', level: 7, itemsVisible: false, items: [] }
  ] } };
  const formatted = Gemini.formatInGameResult(raw);
  const merge = (input, now) => AiState.mergePlayers(state.blue.players, Gemini.formatInGameResult(input).patch.blue.players,
    input.blue.players, memory, now);
  state.blue.players = merge(raw, 1000);
  const miya = state.blue.players[3];
  assert.equal(miya.hero, 'Miya');
  assert.equal(miya.level, 9);
  assert.equal(miya.items[0].name, 'Demon Boots');
  assert.ok(miya.items[0].icon);
  assert.equal(miya.items[2].name, 'Windtalker');
  assert.equal(miya.itemsKnown, false);
  assert.equal(state.blue.players[0].level, 7);
  assert.equal(state.blue.players[1].level, 0);
  assert.equal(formatted.patch.gameTime, undefined);
  assert.equal(formatted.patch.blue.gold, undefined);

  const hidden = { blue: { players: [{ slot: 3, name: '[Computer] Miya', hero: 'Miya', level: null, itemsVisible: false, items: [] }] } };
  state.blue.players = merge(hidden, 2000);
  assert.equal(state.blue.players[3].level, 9);
  assert.deepEqual(state.blue.players[3].items, miya.items);
  assert.equal(state.blue.players[3].itemsVisible, false);

  const empty = { blue: { players: [{ ...hidden.blue.players[0], itemsVisible: true, items: [] }] } };
  state.blue.players = merge(empty, 3000);
  assert.deepEqual(state.blue.players[3].items, []);
  assert.equal(state.blue.players[3].itemsKnown, true);
});

test('live vision bounds fallback attempts and disables lengthy thinking', async t => {
  Gemini._modelCooldowns.clear();
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: false, status: 503, headers: new Headers(), json: async () => ({ error: { message: 'Overloaded' } }) };
  });
  await assert.rejects(Gemini.callVisionApi('fixture', 'test-key', 'extract', {}, { realtime: true }), /Overloaded/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => !c.url.includes('test-key')));
  assert.equal(calls[0].body.generationConfig.maxOutputTokens, 4096);
  assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  for (const model of Gemini.DEFAULT_MODELS) Gemini.setModelCooldown(model, 60000);
  await assert.rejects(Gemini.callVisionApi('fixture', 'test-key', 'extract', {}, { realtime: true }), /cooling down/);
  assert.equal(calls.length, 2);
  Gemini._modelCooldowns.clear();
});

test('live vision cancellation reaches the provider and incomplete JSON never becomes match state', async t => {
  const controller = new AbortController();
  const provider = t.mock.method(global, 'fetch', async (url, { signal }) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    signal.throwIfAborted();
  });
  await assert.rejects(Gemini.callVisionApi('fixture', 'test-key', 'extract', {}, { realtime: true, signal: controller.signal }), { name: 'AbortError' });
  provider.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }) }));
  await assert.rejects(Gemini.callVisionApi('fixture', 'test-key', 'extract', {}, { realtime: true }), /Incomplete AI response/);
});

test('newer local scores survive slow AI while player items and levels still arrive', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-realtime-delivery-'));
  const { app } = require('../server');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (url, body) => {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); return response.json();
  };
  const { session } = await post('/api/detection/start', { source: 'ai' });
  let finish, entered;
  const begun = new Promise(resolve => { entered = resolve; });
  t.mock.method(Gemini, 'analyzeLiveScreen', () => new Promise(resolve => { finish = resolve; entered(); }));
  const sampledAt = Date.now() - 1000;
  const pending = post('/api/detection/ai-live', { session, provider: 'gemini', apiKey: 'test-key', image: 'fixture', realtime: true, sampledAt, live: true, autoApply: true });
  await begun;
  const fresh = await post('/api/detection', { session, mode: 'game', sampledAt: Date.now(), live: true, switchScene: true, localHud: true,
    readings: [{ field: 'blue.kills', value: 8 }, { field: 'gameTime', value: '05:01' }] });
  assert.equal(fresh.patch.blue.kills, 8);
  finish(Gemini.formatLiveResult({ mode: 'game', game: { gameTime: '05:00', blue: { kills: 7, players: [
    { slot: 0, hero: 'Layla', rawIgn: '[Computer] Layla', level: 8, itemsVisible: true, items: ['Demon Boots', '?', 'Windtalker'] }
  ] } } }));
  const result = await pending;
  assert.equal(result.patch.blue.kills, 8);
  assert.equal(result.patch.gameTime, '05:01');
  assert.equal(result.patch.blue.players[0].level, 8);
  assert.ok(result.patch.blue.players[0].items[0].icon);
  assert.ok(result.patch.blue.players[0].items[2].icon);
  await post('/api/detection/stop', { session });
});
