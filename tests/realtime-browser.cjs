const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-realtime-browser-'));
  const Gemini = require('../lib/gemini-vision');
  let release, requestCount = 0;
  Gemini.analyzeLiveScreen = () => {
    requestCount++;
    return new Promise(resolve => { release = () => resolve(Gemini.formatLiveResult({ mode: 'game', game: {
      gameTime: '06:44', blue: { kills: 10, players: [{ slot: 0, rawIgn: '[Computer] Layla', hero: 'Layla', level: 8,
        itemsVisible: true, items: ['Demon Boots', '?', 'Windtalker'] }] }, red: { kills: 6 }
    } })); });
  };
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'ai-config.json'), JSON.stringify({ provider: 'gemini' }));
  const { app } = require('../server');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const overlay = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.waitForFunction(() => state?.scene);
    await overlay.goto(base + '/overlay.html?scene=scoreboard');
    await page.click('nav [data-tab=ocr]');
    const real = process.argv[2];
    await page.evaluate(async src => {
      localStorage.setItem('geminiApiKey', 'fixture-key');
      document.querySelector('#captureCursor').value = 'always';
      const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
      window.fixture = canvas; window.fixtureKills = 10; window.fixtureClock = '06:44';
      const ctx = canvas.getContext('2d');
      let image;
      if (src) { image = new Image(); image.src = src; await image.decode(); }
      window.paintHud = (changed = false) => {
        if (image) ctx.drawImage(image, 0, 0, 1920, 1080);
        else { ctx.fillStyle = '#14293d'; ctx.fillRect(0, 0, 1920, 1080); }
        for (const r of LiveDetectionModel.profiles.game.filter(r => !r.field.includes('.players.'))) {
          if (image && !changed) continue;
          if (image && !['gameTime', 'blue.kills'].includes(r.field)) continue;
          const values = { gameTime: fixtureClock, 'blue.kills': fixtureKills, 'red.kills': 6,
            'blue.gold': '15.7k', 'red.gold': '15.4k', 'blue.turrets': 0, 'red.turrets': 1 };
          ctx.fillStyle = '#102036'; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = 'white'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(values[r.field]), r.x + r.w / 2, r.y + r.h / 2);
        }
      };
      paintHud();
      window.paintTimer = setInterval(() => paintHud(window.changedFixture), 50);
      window.captureRequests = [];
      navigator.mediaDevices.getDisplayMedia = async options => { captureRequests.push(options.video); return canvas.captureStream(20); };
    }, real ? 'data:image/png;base64,' + fs.readFileSync(real).toString('base64') : null);
    await page.click('#aiLiveLoopBtn');
    await overlay.waitForFunction(() => state.blue.kills === 10 && state.red.kills === 6 && state.blue.gold === 15700 && state.red.gold === 15400,
      {}, { timeout: 15000 }).catch(async error => { console.log(await page.evaluate(() => ({ hud: document.querySelector('#aiHudStatus').textContent, ai: document.querySelector('#aiLiveStatus').textContent, state }))); throw error; });
    assert.equal(requestCount, 1, 'HUD updates while the first cloud request remains pending');
    assert.equal((await page.evaluate(() => captureRequests[0])).displaySurface, 'monitor');
    assert.equal((await page.evaluate(() => captureRequests[0])).cursor, 'always');
    assert.equal(await page.evaluate(() => LiveDetection.normalizeSourceForAI(fixture).width), 1920);
    const changedAt = Date.now();
    await page.evaluate(() => { fixtureKills = 11; fixtureClock = '06:45'; window.changedFixture = true; paintHud(true); });
    await overlay.waitForFunction(() => state.blue.kills === 11 && state.gameTime === '06:45', {}, { timeout: 3000 });
    const updateMs = Date.now() - changedAt;
    release();
    await overlay.waitForFunction(() => state.blue.players[0].items?.[2]?.icon && state.blue.players[0].level === 8);
    assert.equal(await overlay.evaluate(() => state.blue.kills), 11, 'Late cloud score cannot overwrite local score');
    await page.waitForFunction(() => document.querySelector('#aiLiveDisplay img[title="Windtalker"]'));
    assert.match(await page.locator('#aiLiveDisplay').innerText(), /Lvl 8/);
    await page.click('#aiLiveLoopBtn');
    release();
    await page.waitForTimeout(100);
    assert.equal(await overlay.evaluate(() => state.gameClock.running), false);
    await page.click('#stopCapture');
    await page.evaluate(() => {
      window.denied = 0;
      navigator.mediaDevices.getDisplayMedia = async () => { denied++; throw new DOMException('Capture cancelled', 'NotAllowedError'); };
    });
    await page.click('#capture');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Capture cancelled'));
    assert.equal(await page.evaluate(() => denied), 1, 'Cancellation must not reopen the picker');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', fixture: real ? 'saved game capture' : 'synthetic HUD', updateMs,
      checks: ['local OCR while cloud is pending', 'newest scores preserved', 'partial items and levels reach OBS and monitor', '1920px detail input', 'monitor capture with cursor', 'single cancellation', 'stop holds clocks'] }));
  } finally {
    release?.(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
