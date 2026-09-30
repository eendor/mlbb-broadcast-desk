const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlbb-codex-test-'));
process.env.DATA_DIR = dataDir;
const Codex = require('../lib/codex-vision');
const Gemini = require('../lib/gemini-vision');

test('Codex starts local app-server in GPT-6 Astra Fast at max reasoning and returns schema-checked draft output', async () => {
  const requests = [], sent = [];
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin.on('data', chunk => {
    for (const line of chunk.toString().trim().split('\n')) {
      const request = JSON.parse(line); sent.push(request);
      if (request.method === 'initialized') continue;
      requests.push(request);
      const respond = (result, method, params) => child.stdout.write(JSON.stringify(method ? { method, params } : { id: request.id, result }) + '\n');
      if (request.method === 'initialize') respond({});
      else if (request.method === 'account/read') respond({ account: { type: 'chatgpt' } });
      else if (request.method === 'thread/start') respond({ thread: { id: 'thread-fixture' }, model: Codex.MODEL, reasoningEffort: Codex.EFFORT });
      else if (request.method === 'turn/start') {
        respond({ turn: { id: 'turn-fixture', status: 'inProgress' } });
        setImmediate(() => {
          const rows = side => ({ teamName: null, bans: ['', 'Lylia', '', '', ''], picks: Array.from({ length: 5 }, (_, slot) => ({
            slot, hero: slot === 0 ? side === 'blue' ? 'Nolan' : 'Ruby' : null, rawIgn: slot === 0 ? 'player-' + side : null, name: null
          })) });
          const payload = JSON.stringify({ mode: 'draft', draft: { phase: 'Last Change', timer: 6,
            blue: rows('blue'), red: rows('red') }, game: null, result: null });
          respond(null, 'item/completed', { threadId: 'thread-fixture', item: { type: 'agentMessage', text: payload } });
          respond(null, 'turn/completed', { threadId: 'thread-fixture', turn: { id: 'turn-fixture', status: 'completed' } });
        });
      } else if (request.method === 'thread/unsubscribe') respond({});
    }
  });
  const client = new Codex.CodexVision({ command: 'fixture-codex', spawnProcess(_command, args, options) {
    assert.equal(_command, 'fixture-codex');
    assert.equal(options.cwd, os.tmpdir());
    assert.ok(args.includes('-c') && args.some(arg => arg.includes('model="gpt-6-astra"')));
    assert.ok(args.includes('service_tier="fast"'));
    assert.ok(args.includes('model_reasoning_effort="max"'));
    assert.ok(args.includes('features.fast_mode=true'));
    for (const item of ['shell_tool', 'apps', 'plugins', 'multi_agent', 'computer_use']) assert.ok(args.includes(`features.${item}=false`));
    return child;
  }});
  try {
    const result = await client.analyzeLiveScreen('data:image/png;base64,aGVsbG8=', undefined, null, { realtime: true, supplementalImages: ['data:image/png;base64,bW9yZQ=='] });
    assert.equal(result.mode, 'draft');
    assert.equal(result.patch.phase, 'Last Changes');
    assert.equal(result.patch.draftTimer.remaining, 6);
    assert.equal(result.patch.blue.players[0].hero, 'Nolan');
    assert.equal(result.patch.red.players[0].hero, 'Ruby');
    assert.equal(result.model, 'gpt-6-astra');
    assert.equal(result.effort, 'max');
    assert.equal(result.speedTier, 'fast');
    const thread = sent.find(request => request.method === 'thread/start').params;
    assert.equal(thread.model, 'gpt-6-astra');
    assert.equal(thread.allowProviderModelFallback, false);
    assert.equal(thread.ephemeral, true);
    const turn = sent.find(request => request.method === 'turn/start').params;
    assert.equal(turn.model, 'gpt-6-astra');
    assert.equal(turn.effort, 'max');
    assert.ok(turn.outputSchema.properties.draft);
    assert.equal(turn.input.filter(item => item.type === 'image').length, 2);
    assert.match(turn.input[0].text, /enlarged blue-side and red-side player-table crops/);
    assert.ok(requests.some(request => request.method === 'thread/unsubscribe'));
  } finally { client.disconnect(); }
});

test('Gemini remains selectable and its saved key survives settings reads and provider changes', async t => {
  const { app } = require('../server');
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async () => { const response = await fetch(base + '/api/ai/config'); assert.equal(response.status, 200); return response.json(); };
  const save = async body => { const response = await fetch(base + '/api/ai/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(response.status, 200); return response.json(); };
  assert.equal(fs.existsSync(path.join(dataDir, 'ai-config.json')), false);
  await save({ provider: 'gemini', geminiApiKey: 'fixture-gemini-key' });
  assert.equal((await get()).hasKey, true);
  await save({ provider: 'codex' });
  const config = await get();
  assert.equal(config.provider, 'codex');
  assert.equal(config.hasKey, true);
  assert.equal(config.codex.model, 'gpt-6-astra');
  assert.equal(config.codex.effort, 'max');
  assert.equal(JSON.stringify(config).includes('fixture-gemini-key'), false);
  assert.ok(Gemini);
});

test('a newer local draft hero and ban survive an older Codex screenshot', () => {
  const state = { blue: { players: [{ hero: 'Marcel' }, {}, {}, {}, {}], bans: ['Brody', '', '', '', ''] }, red: { players: Array(5).fill({}), bans: ['', '', '', '', ''] } };
  const patch = { blue: { players: [{ hero: 'Nolan' }, {}, {}, {}, {}], bans: ['Cici'] }, red: { players: Array(5).fill({}), bans: [] } };
  const samples = new Map([['blue.players.0.hero', 200], ['blue.bans.0', 200]]);
  require('../lib/ai-live-state').protectNewerHud(patch, samples, 100, 'draft');
  assert.equal(patch.blue.players[0].hero, undefined);
  assert.equal(patch.blue.bans[0], '');
});
