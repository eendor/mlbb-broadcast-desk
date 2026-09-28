const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.goto('http://127.0.0.1:3210');
  await page.waitForTimeout(500);
  await page.click('button[data-tab="breaks"]');
  await page.waitForTimeout(800);
  const adPanel = await page.$('.ad-panel');
  if (adPanel) {
    await adPanel.screenshot({ path: 'ad_playlist_panel.png' });
    console.log('Ad panel screenshot saved');
  }
  await browser.close();
})();
