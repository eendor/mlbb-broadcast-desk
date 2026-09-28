const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const GeminiVision = require('../lib/gemini-vision');

test('AI capture delivery and clocks', async t => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-ai-delivery-'));
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() });
  const advance = ms => t.mock.timers.tick(ms);
  const { app } = require('../server');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function post(url, data) {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const start = async () => (await post('/api/detection/start', { source: 'ai' })).session;
  const state = async () => (await fetch(base + '/api/state')).json();
  const scan = (session, extra = {}) => post('/api/detection/ai-live', {
    session, sampledAt: Date.now(), image: 'fixture', provider: 'gemini', apiKey: 'test-key', live: true, autoApply: true, switchScene: true, ...extra
  });
  const game = (gameTime = '05:00', kills = 3) => ({ mode: 'game', patch: { scene: 'scoreboard', gameTime, blue: { kills } } });

  await t.test('capture timestamps reach OBS immediately with player stats through SSE', async t => {
    const session = await start(), sampledAt = Date.now() - 2400;
    const players = (await state()).blue.players;
    players[0].kda = '4/1/2';
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({ ...game(), patch: { ...game().patch, blue: { kills: 4, players } } }));
    const controller = new AbortController();
    const response = await fetch(base + '/api/events', { signal: controller.signal });
    const reader = response.body.getReader();
    await reader.read();
    const delivery = reader.read();
    const result = await scan(session, { sampledAt });
    assert.equal(result.applied, true);
    assert.equal(result.patch.gameClock.syncedAt, sampledAt);
    const event = new TextDecoder().decode((await delivery).value).split('\n').find(line => line.startsWith('data: '));
    const pushed = JSON.parse(event.slice(6));
    assert.equal(pushed.blue.players[0].kda, '4/1/2');
    assert.equal(pushed.blue.kills, 4);
    assert.equal(pushed.gameClock.syncedAt, sampledAt);
    assert.equal(pushed.gameClock.running, true);
    controller.abort();
  });

  await t.test('draft countdowns account for inference delay and stop at capture time when smoothing is off', async t => {
    const session = await start(), sampledAt = Date.now() - 2500;
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({ mode: 'draft', patch: { scene: 'draft', draftTimer: { remaining: 24 } } }));
    await scan(session, { sampledAt });
    assert.equal((await state()).draftTimer.endAt, sampledAt + 24000);
    await scan(session, { live: false });
    const stopped = await state();
    assert.equal(stopped.draftTimer.endAt, null);
    assert.equal(stopped.draftTimer.remaining, 24);
    assert.equal(stopped.gameClock.running, false);
  });

  await t.test('fixed frames and repeated frozen readings pause the broadcast clock', async t => {
    const session = await start();
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => game());
    await scan(session, { sampledAt: Date.now() - 3000 });
    await scan(session, { sampledAt: Date.now() - 1000 });
    assert.equal((await state()).gameClock.running, false);
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => game('05:01'));
    await scan(session);
    assert.equal((await state()).gameClock.running, true);
    await scan(session, { live: false });
    assert.equal((await state()).gameClock.running, false);
  });

  await t.test('stopping a session prevents an in-flight scan from overwriting the broadcast', async t => {
    const session = await start(), before = await state();
    let finish, entered;
    const started = new Promise(resolve => { entered = resolve; });
    t.mock.method(GeminiVision, 'analyzeLiveScreen', () => new Promise(resolve => { finish = resolve; entered(); }));
    const pending = scan(session);
    await started;
    await post('/api/detection/stop', { session });
    finish(game('12:00', 99));
    assert.equal((await pending).expired, true);
    assert.deepEqual(await state(), before);
  });

  await t.test('newer capture sessions and newer frames reject old responses', async t => {
    const oldSession = await start();
    let finish, entered;
    const started = new Promise(resolve => { entered = resolve; });
    t.mock.method(GeminiVision, 'analyzeLiveScreen', () => new Promise(resolve => { finish = resolve; entered(); }));
    const pending = scan(oldSession);
    await started;
    const session = await start();
    finish(game('01:00', 1));
    assert.equal((await pending).expired, true);
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => game('02:00', 2));
    await scan(session);
    const stale = await scan(session, { sampledAt: Date.now() - 1000 });
    assert.equal(stale.stale, true);
    assert.equal((await state()).blue.kills, 2);
  });

  await t.test('review mode, lobby and results hold clocks and scene following can be disabled', async t => {
    const session = await start();
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => game());
    await scan(session);
    await scan(session, { autoApply: false });
    assert.equal((await state()).gameClock.running, false);
    await scan(session);
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({ mode: 'other', patch: null }));
    await scan(session);
    assert.equal((await state()).gameClock.running, false);
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({ mode: 'result', patch: { scene: 'postgame', gameTime: '12:34' } }));
    await scan(session, { switchScene: false });
    const result = await state();
    assert.equal(result.scene, 'scoreboard');
    assert.equal(result.gameTime, '12:34');
    assert.equal(result.gameClock.running, false);
  });

  await t.test('lost clients freeze AI clocks after 15 seconds without freezing manual clocks', async t => {
    const session = await start();
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => game());
    await scan(session);
    advance(16000);
    const held = await state();
    assert.equal(held.gameClock.running, false);
    assert.equal(held.gameTime, '05:15');
    const manual = { running: true, seconds: 900, syncedAt: Date.now() };
    await post('/api/state', { gameClock: manual });
    advance(16000);
    assert.deepEqual((await state()).gameClock, manual);
  });

  await t.test('auto draft retains locked picks, bans, real player names, and identifies teams', async t => {
    const session = await start();
    // Frame 1: Blue bans Paquito, picks Marcel for LenXer., Atlas for Nocturne
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({
      mode: 'draft',
      patch: {
        scene: 'draft',
        phase: 'Allied Team Pick',
        draftTimer: { remaining: 28 },
        blue: {
          bans: ['Paquito', '', '', '', ''],
          players: [
            { slot: 0, hero: 'Marcel', name: 'LenXer.' },
            { slot: 1, hero: 'Atlas', name: 'Nocturne' },
            { slot: 2, hero: 'Cyclops', name: 'WesternK9' }
          ]
        },
        red: {
          bans: ['Angela', '', '', '', ''],
          players: [
            { slot: 0, hero: 'Kaja', name: 'flins' },
            { slot: 1, hero: 'Melissa', name: 'Licorice' },
            { slot: 2, hero: 'Khufra', name: 'Bubblegum' }
          ]
        }
      }
    }));
    await scan(session);
    let s = await state();
    assert.equal(s.scene, 'draft');
    assert.equal(s.blue.bans[0], 'Paquito');
    assert.equal(s.blue.players[0].hero, 'Marcel');
    assert.equal(s.blue.players[0].name, 'LenXer.');
    assert.equal(s.blue.tag, 'PSITS'); // Auto-identified team
    assert.equal(s.red.tag, 'JMES');  // Auto-identified team

    // Frame 2: Partial frame where slot 0 ban is blurred/empty, but ban 1 Fanny is added
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => ({
      mode: 'draft',
      patch: {
        scene: 'draft',
        phase: 'Enemy Team Pick',
        draftTimer: { remaining: 20 },
        blue: {
          bans: ['', 'Fanny', '', '', ''],
          players: [
            { slot: 0, hero: '', name: 'Player 1' },
            { slot: 1, hero: 'Atlas', name: 'Nocturne' },
            { slot: 2, hero: 'Claude', name: 'Seffyroth' }
          ]
        },
        red: {
          bans: ['Angela', 'Mathilda', '', '', ''],
          players: []
        }
      }
    }));
    await scan(session);
    s = await state();
    // Verify previous ban Paquito was kept, Fanny was added
    assert.equal(s.blue.bans[0], 'Paquito');
    assert.equal(s.blue.bans[1], 'Fanny');
    // Verify slot 0 hero Marcel and name LenXer. were preserved despite empty/placeholder incoming frame
    assert.equal(s.blue.players[0].hero, 'Marcel');
    assert.equal(s.blue.players[0].name, 'LenXer.');
    assert.equal(s.blue.players[2].hero, 'Claude');
    assert.equal(s.blue.players[2].name, 'Seffyroth');
    assert.equal(s.blue.tag, 'PSITS');
  });

  await t.test('frames that expire during AI processing cannot update the broadcast', async t => {
    const session = await start();
    const before = await state();
    t.mock.method(GeminiVision, 'analyzeLiveScreen', async () => { advance(31000); return game('30:00', 99); });
    const result = await scan(session);
    assert.equal(result.stale, true);
    assert.deepEqual(await state(), before);
  });
});
