const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-ai-browser-'));
  const GeminiVision = require('../lib/gemini-vision');
  let mode = 'game', kills = 4, delay = 2200, origin = Date.now(), hold = false, release, entered;
  GeminiVision.analyzeLiveScreen = async () => {
    const elapsed = Math.floor((Date.now() - origin) / 1000), seconds = 180 + elapsed;
    const result = GeminiVision.formatLiveResult(mode === 'game' ? {
      mode, game: {
        gameTime: String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'),
        blue: { kills, players: [{ name: 'Live player', kda: '4/1/2', level: 8 }] }, red: { kills: 2 }
      }
    } : { mode, draft: { phase: 'Allied Team Ban', timer: Math.max(0, 45 - elapsed) } });
    if (hold) return new Promise(resolve => { release = () => resolve(result); entered(); });
    const wait = delay;
    delay = 100;
    await new Promise(resolve => setTimeout(resolve, wait));
    return result;
  };
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'ai-config.json'), JSON.stringify({ provider: 'gemini' }));
  const { app } = require('../server');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch();
    const panel = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const overlay = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const page of [panel, overlay]) page.on('pageerror', error => errors.push(error.message));
    await panel.goto(base);
    await panel.waitForFunction(() => state?.scene);
    await panel.evaluate(() => {
      localStorage.setItem('geminiApiKey', 'test-key');
      const canvas = document.createElement('canvas');
      canvas.width = 1920; canvas.height = 1080;
      canvas.getContext('2d').fillRect(0, 0, 1920, 1080);
      window.aiFixture = canvas;
      window.aiFixtureTimer = setInterval(() => canvas.getContext('2d').fillRect(0, 0, 1920, 1080), 50);
      navigator.mediaDevices.getDisplayMedia = async () => canvas.captureStream(20);
    });
    await panel.click('nav [data-tab="ocr"]');
    await overlay.goto(base + '/overlay.html?scene=scoreboard');
    await panel.click('#aiLiveLoopBtn');
    await overlay.waitForFunction(() => state?.blue.kills === 4 && state.gameClock.running, {}, { timeout: 10000 }).catch(async error => {
      console.log('AI control diagnostics:', await panel.evaluate(() => ({
        status: document.getElementById('aiLiveStatus').textContent,
        toast: document.getElementById('toast').textContent,
        running: LiveDetection.isAiLoopRunning(), source: !!source(),
        clock: state.gameClock, kills: state.blue.kills
      })), errors);
      throw error;
    });
    await panel.waitForFunction(() => document.getElementById('aiLiveClock')?.textContent.startsWith('03:'));
    const clock = await overlay.evaluate(() => ({
      shown: document.querySelector('.sb-center>strong').textContent,
      expected: state.gameClock.seconds + Math.floor((Date.now() - state.gameClock.syncedAt) / 1000)
    }));
    const parts = clock.shown.split(':').map(Number);
    assert.ok(Math.abs(parts[0] * 60 + parts[1] - clock.expected) <= 1);
    assert.equal(await overlay.evaluate(() => state.blue.players[0].kda), '4/1/2');

    const changedAt = Date.now();
    kills = 5;
    await overlay.waitForFunction(() => state.blue.kills === 5);
    const statUpdateMs = Date.now() - changedAt;
    assert.ok(statUpdateMs < 3000, 'A fast response should not add a multi-second cooldown');
    await panel.uncheck('#aiSmoothClock');
    await overlay.waitForFunction(() => !state.gameClock.running);
    await panel.click('#aiLiveLoopBtn');
    await panel.waitForFunction(() => !LiveDetection.isAiLoopRunning());

    // Stop while recognition is still pending; the completed frame must be ignored.
    kills = 99; hold = true;
    const pending = new Promise(resolve => { entered = resolve; });
    await panel.check('#aiSmoothClock');
    await panel.click('#aiLiveLoopBtn');
    await pending;
    await panel.click('#aiLiveLoopBtn');
    release();
    await panel.waitForTimeout(200);
    assert.equal(await overlay.evaluate(() => state.blue.kills), 5);
    assert.equal(await panel.evaluate(() => LiveDetection.isAiLoopRunning()), false);

    mode = 'draft'; hold = false; origin = Date.now(); delay = 2200;
    await overlay.goto(base + '/overlay.html?scene=draft');
    await panel.click('#aiLiveLoopBtn');
    await overlay.waitForFunction(() => state?.draftTimer.endAt !== null && state?.scene === 'draft');
    await panel.waitForFunction(() => document.getElementById('aiLiveModeBadge').textContent.includes('DRAFT'));
    const draft = await panel.locator('#aiLiveClock').textContent();
    assert.ok(Number(draft.split(':')[1]) <= 43, 'Draft countdown must include recognition latency');
    await panel.click('#aiLiveLoopBtn');
    await overlay.waitForFunction(() => state.draftTimer.endAt === null);
    assert.deepEqual(errors, []);
    console.log(`PASS: live AI controls, latency-adjusted game/draft clocks, SSE player stats (${statUpdateMs} ms), smoothing and cancellation`);
  } finally {
    release?.();
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
