const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiVision = require('../lib/gemini-vision');

test('Gemini screenshot analysis attaches full-screen and zoomed team crops', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }) };
  });
  const result = await GeminiVision.callVisionApi([
    'data:image/png;base64,c2NyZWVu', 'data:image/jpeg;base64,Ymx1ZQ==', 'data:image/jpeg;base64,cmVk'
  ], 'test-key', 'Read the full screen and crops', {});
  assert.equal(result._modelUsed, GeminiVision.DEFAULT_MODELS[0]);
  const parts = payload.contents[0].parts;
  assert.equal(parts.length, 4);
  assert.equal(parts[0].text, 'Read the full screen and crops');
  assert.deepEqual(parts.slice(1).map(part => part.inline_data.mime_type), ['image/png', 'image/jpeg', 'image/jpeg']);
});
const Playoffs = require('../public/playoffs-model');
const PlayoffResults = require('../lib/playoff-results');

test('GeminiVision system prompt and roster context includes registered teams', () => {
  const rosterContext = GeminiVision.formatRosterContext(Playoffs.teams);
  assert.ok(rosterContext.includes('PSITS'));
  assert.ok(rosterContext.includes('JMES'));
  assert.ok(rosterContext.includes('PICE'));
  assert.ok(rosterContext.includes('Nocturne'));
  assert.ok(rosterContext.includes('LenXer.'));

  const prompt = GeminiVision.buildPrompt(Playoffs.teams);
  assert.ok(prompt.includes('Mobile Legends'));
  assert.ok(prompt.includes('EXP Lane'));
  assert.ok(prompt.includes('gold MVP crown') || prompt.includes('golden crown'));
  assert.ok(prompt.includes('strip squad prefixes') || prompt.includes('Strip squad prefixes'));
  assert.ok(prompt.includes('AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION'));
  assert.ok(prompt.includes('MuMuPlayer'));

  const draftPrompt = GeminiVision.buildDraftPrompt(Playoffs.teams);
  assert.ok(draftPrompt.includes('AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION'));
  assert.ok(draftPrompt.includes('MuMuPlayer'));
  assert.ok(draftPrompt.includes('DRAFT STRUCTURE & SEMANTIC LAYOUT'));

  const inGamePrompt = GeminiVision.buildInGamePrompt(Playoffs.teams);
  assert.ok(inGamePrompt.includes('AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION'));
  assert.ok(inGamePrompt.includes('MATCH CLOCK & OBJECTIVES'));
  assert.ok(inGamePrompt.includes('PLAYER TELEMETRY'));

  const livePrompt = GeminiVision.buildLivePrompt(Playoffs.teams);
  assert.ok(livePrompt.includes('AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION'));
  assert.ok(livePrompt.includes('SCREEN CLASSIFICATION & DATA EXTRACTION'));

  // Ensure all latest models with fallback cascade are configured
  assert.deepEqual(GeminiVision.DEFAULT_MODELS, [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ]);
});

test('GeminiVision model cooldowns and active model cascade', () => {
  GeminiVision._modelCooldowns.clear();
  const allModels = GeminiVision.getActiveModels();
  assert.equal(allModels.length, 7);
  assert.equal(allModels[0], 'gemini-3.1-flash-lite');

  // Set cooldown on 3.8 and 3.7
  GeminiVision.setModelCooldown('gemini-3.8-flash', 60000, 'Daily quota reached');
  GeminiVision.setModelCooldown('gemini-3.7-flash', 60000, 'High demand 503');

  const afterCooldown = GeminiVision.getActiveModels();
  assert.equal(afterCooldown.length, 5);
  assert.equal(afterCooldown[0], 'gemini-3.1-flash-lite');

  const status = GeminiVision.getModelStatus();
  assert.equal(status.length, 7);
  assert.equal(status[0].model, 'gemini-3.1-flash-lite');
  assert.equal(status[0].status, 'available');
  assert.equal(status[6].reason, 'Daily quota reached');
  assert.equal(status[2].model, 'gemini-3-flash-preview');
  assert.equal(status[2].status, 'available');

  // Clear cooldowns
  GeminiVision._modelCooldowns.clear();
  assert.equal(GeminiVision.getActiveModels().length, 7);
});

test('GeminiVision formatResult normalizes raw AI output and resolves squad prefixes', () => {
  const rawAiData = {
    winner: 'blue',
    gameTime: '11:24',
    blue: {
      teamId: 'PSITS',
      teamName: 'Philippine Society of Information Technology Students',
      kills: 18,
      gold: 35120,
      players: [
        { slot: 0, role: 'EXP', hero: 'Yu Zhong', rawIgn: 'SIMP LenXer.', name: 'LenXer.', kda: '3/1/6', gold: 7120, level: 13, isMvp: false },
        { slot: 1, role: 'JUNGLE', hero: 'Fanny', rawIgn: 'ÁŚ Nocturne', name: 'Nocturne', kda: '6/0/4', gold: 8900, level: 15, isMvp: true },
        { slot: 2, role: 'MID', hero: 'Valentina', rawIgn: 'ÁŚ WesternK9', name: 'WesternK9', kda: '4/1/8', gold: 6850, level: 13, isMvp: false },
        { slot: 3, role: 'GOLD', hero: 'Claude', rawIgn: 'PSITS Seffyroth', name: 'Seffyroth', kda: '4/2/5', gold: 7450, level: 14, isMvp: false },
        { slot: 4, role: 'ROAM', hero: 'Tigreal', rawIgn: 'NOVA KZO', name: 'KZO', kda: '1/2/11', gold: 4800, level: 12, isMvp: false }
      ]
    },
    red: {
      teamId: 'JMES',
      teamName: 'Junior Marketing Executives Society',
      kills: 6,
      gold: 24800,
      players: [
        { slot: 0, role: 'EXP', hero: 'Terizla', rawIgn: 'why cant u for once', name: 'why cant u for once', kda: '1/3/2', gold: 5100, level: 12, isMvp: false },
        { slot: 1, role: 'JUNGLE', hero: 'Ling', rawIgn: 'flins', name: 'flins', kda: '0/4/1', gold: 5800, level: 12, isMvp: false },
        { slot: 2, role: 'MID', hero: 'Pharsa', rawIgn: '+hedgehog+', name: '+hedgehog+', kda: '0/3/3', gold: 4900, level: 11, isMvp: false },
        { slot: 3, role: 'GOLD', hero: 'Beatrix', rawIgn: 'Licorice', name: 'Licorice', kda: '4/3/1', gold: 5600, level: 12, isMvp: false },
        { slot: 4, role: 'ROAM', hero: 'Khufra', rawIgn: 'Bubblegum', name: 'Bubblegum', kda: '1/5/3', gold: 3400, level: 10, isMvp: false }
      ]
    },
    mvp: {
      side: 'blue',
      slot: 1,
      name: 'Nocturne',
      hero: 'Fanny',
      kda: '6/0/4',
      reason: 'Highest kill participation and golden crown badge'
    }
  };

  const formatted = GeminiVision.formatResult(rawAiData, Playoffs.teams);
  assert.equal(formatted.success, true);
  assert.equal(formatted.patch.winner, 'blue');
  assert.equal(formatted.patch.gameTime, '11:24');

  // Verify squad prefixes stripped to registered IGNs
  assert.equal(formatted.patch.blue.players[0].name, 'LenXer.');
  assert.equal(formatted.patch.blue.players[1].name, 'Nocturne');
  assert.equal(formatted.patch.blue.players[2].name, 'WesternK9');
  assert.equal(formatted.patch.blue.players[3].name, 'Seffyroth');
  assert.equal(formatted.patch.blue.players[4].name, 'KZO');
  assert.equal(formatted.patch.red.players[1].name, 'flins');

  // Verify MVP object
  assert.equal(formatted.patch.mvp.player, 'blue.1');
  assert.equal(formatted.patch.mvp.name, 'Nocturne');
  assert.equal(formatted.patch.mvp.hero, 'Fanny');
  assert.equal(formatted.patch.mvp.kda, '6/0/4');

  // Verify compatibility with PlayoffResults.prepareResult
  const state = {
    playoffs: Playoffs.defaults(),
    game: 1,
    bestOf: 3,
    winner: 'blue',
    blue: { name: 'Philippine Society of Information Technology Students', tag: 'PSITS', score: 0, kills: 18, gold: 35000, players: [] },
    red: { name: 'Junior Marketing Executives Society', tag: 'JMES', score: 0, kills: 6, gold: 24000, players: [] }
  };

  // Match 0 pairing: JMES (red) vs PSITS (blue)
  const playoffResult = PlayoffResults.prepareResult(state, formatted.patch, { source: 'gemini-vision' });
  assert.equal(playoffResult.report.status, 'applied');
  assert.equal(playoffResult.patch.blue.score, 1);
  assert.equal(playoffResult.patch.red.score, 0);
});

test('GeminiVision matchItem resolves items to catalog icons and ids', () => {
  const item = GeminiVision.matchItem('Demon Boots');
  assert.ok(item);
  assert.ok(item.name.toLowerCase().includes('demon boots'));
  assert.ok(item.icon);

  const unknown = GeminiVision.matchItem('NonExistentItem999');
  assert.equal(unknown.id, 0);
  assert.equal(unknown.name, 'NonExistentItem999');
});

test('GeminiVision formatDraftResult builds complete draft scene patch', () => {
  const draftData = {
    phase: 'Allied Team Ban',
    timer: 24,
    blue: {
      bans: ['Brody', 'Valentina', 'Angela'],
      picks: [
        { slot: 0, hero: 'Marcel', name: 'LenXer.' },
        { slot: 1, hero: 'Atlas', name: 'Nocturne' }
      ]
    },
    red: {
      bans: ['Diggie', 'Mathilda', 'Helcurt', 'Phoveus', 'Leomord'],
      picks: [
        { slot: 0, hero: 'Kaja', name: 'flins' },
        { slot: 1, hero: 'Melissa', name: 'Licorice' }
      ]
    }
  };

  const formatted = GeminiVision.formatDraftResult(draftData, Playoffs.teams);
  assert.equal(formatted.success, true);
  assert.equal(formatted.patch.scene, 'draft');
  assert.equal(formatted.patch.phase, 'Allied Team Ban');
  assert.equal(formatted.patch.draftTimer.remaining, 24);
  assert.equal(formatted.patch.blue.bans[0], 'Brody');
  assert.equal(formatted.patch.blue.bans.length, 5);
  assert.equal(formatted.patch.blue.players[0].hero, 'Marcel');
  assert.equal(formatted.patch.red.bans[4], 'Leomord');
});

test('GeminiVision formatInGameResult builds live scoreboard patch with items and levels', () => {
  const gameData = {
    gameTime: '05:37',
    blue: {
      kills: 8,
      gold: 17200,
      turrets: 0,
      players: [
        { slot: 0, hero: 'Cyclops', name: 'WesternK9', level: 7, kda: '0/0/5', items: ['Magic Shoes', 'Enchanted Talisman'] }
      ]
    },
    red: {
      kills: 2,
      gold: 14300,
      turrets: 1,
      players: [
        { slot: 0, hero: 'Valentina', name: 'Sensui.', level: 6, kda: '1/2/1', items: ['Arcane Boots', 'Clock of Destiny'] }
      ]
    }
  };

  const formatted = GeminiVision.formatInGameResult(gameData, Playoffs.teams);
  assert.equal(formatted.success, true);
  assert.equal(formatted.patch.scene, 'scoreboard');
  assert.equal(formatted.patch.gameTime, '05:37');
  assert.equal(formatted.patch.blue.kills, 8);
  assert.equal(formatted.patch.blue.players[0].level, 7);
  assert.equal(formatted.patch.blue.players[0].items.length, 2);
  assert.ok(formatted.patch.blue.players[0].items[0].icon);
});

test('GeminiVision formatLiveResult classifies screens and creates valid broadcast state patches', () => {
  const { defaults, merge, validate } = require('../lib/state');

  // 1. Live Draft Mode
  const draftLiveOutput = {
    mode: 'draft',
    draft: {
      phase: 'Allied Team Pick',
      timer: 18,
      blue: {
        bans: ['Fanny', 'Diggie'],
        picks: [
          { slot: 0, hero: 'Yu Zhong', name: 'LenXer.' },
          { slot: 1, hero: 'Aamon', name: 'Nocturne' }
        ]
      },
      red: {
        bans: ['Brody', 'Angela'],
        picks: [
          { slot: 0, hero: 'Terizla', name: 'why cant u for once' }
        ]
      }
    }
  };

  const draftFormatted = GeminiVision.formatLiveResult(draftLiveOutput, Playoffs.teams);
  assert.equal(draftFormatted.mode, 'draft');
  assert.equal(draftFormatted.patch.scene, 'draft');
  assert.equal(draftFormatted.patch.phase, 'Allied Team Pick');
  assert.equal(draftFormatted.patch.draftTimer.remaining, 18);
  assert.doesNotThrow(() => validate(merge(defaults(), draftFormatted.patch)));

  // 2. In-Game Spectator HUD Mode
  const gameLiveOutput = {
    mode: 'game',
    game: {
      gameTime: '12:45',
      blue: {
        kills: 14,
        gold: 38200,
        turrets: 4,
        players: [
          { slot: 0, hero: 'Yu Zhong', name: 'LenXer.', level: 14, kda: '2/1/7', gold: 8100, items: ['War Axe', 'Bloodlust Axe', 'Warrior Boots'] },
          { slot: 1, hero: 'Fanny', name: 'Nocturne', level: 15, kda: '8/0/3', gold: 9800, items: ['Blade of the Heptaseas', 'Hunter Strike', 'Malefic Roar'] }
        ]
      },
      red: {
        kills: 5,
        gold: 27900,
        turrets: 1,
        players: [
          { slot: 0, hero: 'Terizla', name: 'flins', level: 12, kda: '1/4/2', gold: 6200, items: ['Dominance Ice', 'Tough Boots'] }
        ]
      }
    }
  };

  const gameFormatted = GeminiVision.formatLiveResult(gameLiveOutput, Playoffs.teams);
  assert.equal(gameFormatted.mode, 'game');
  assert.equal(gameFormatted.patch.scene, 'scoreboard');
  assert.equal(gameFormatted.patch.gameTime, '12:45');
  assert.equal(gameFormatted.patch.blue.kills, 14);
  assert.equal(gameFormatted.patch.blue.players[0].level, 14);
  assert.equal(gameFormatted.patch.blue.players[0].items[0].name, 'War Axe');
  assert.doesNotThrow(() => validate(merge(defaults(), gameFormatted.patch)));

  // 3. Post-Game Scoreboard Mode
  const resultLiveOutput = {
    mode: 'result',
    result: {
      winner: 'blue',
      gameTime: '14:20',
      blue: {
        teamId: 'PSITS',
        kills: 22,
        gold: 44000,
        players: [
          { slot: 0, role: 'EXP', hero: 'Yu Zhong', name: 'LenXer.', kda: '4/2/9', gold: 8900, level: 15, isMvp: false, items: ['War Axe', 'Dominance Ice'] },
          { slot: 1, role: 'JUNGLE', hero: 'Fanny', name: 'Nocturne', kda: '12/1/5', gold: 11200, level: 15, isMvp: true, items: ['Blade of Despair', 'Malefic Roar'] }
        ]
      },
      red: {
        teamId: 'JMES',
        kills: 8,
        gold: 31000,
        players: [
          { slot: 0, role: 'EXP', hero: 'Terizla', name: 'flins', kda: '2/6/3', gold: 6700, level: 13, isMvp: false, items: ['Antique Cuirass'] }
        ]
      },
      mvp: {
        side: 'blue',
        slot: 1,
        name: 'Nocturne',
        hero: 'Fanny',
        kda: '12/1/5'
      }
    }
  };

  const resultFormatted = GeminiVision.formatLiveResult(resultLiveOutput, Playoffs.teams);
  assert.equal(resultFormatted.mode, 'result');
  assert.equal(resultFormatted.patch.scene, 'postgame');
  assert.equal(resultFormatted.patch.winner, 'blue');
  assert.equal(resultFormatted.patch.mvp.name, 'Nocturne');
  assert.doesNotThrow(() => validate(merge(defaults(), resultFormatted.patch)));
});
