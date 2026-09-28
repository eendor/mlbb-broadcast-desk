const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  await page.goto('http://127.0.0.1:3210');
  await page.waitForTimeout(500);
  await page.click('button[data-tab="breaks"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'breaks_tab_with_ads.png' });
  await browser.close();
  console.log('Breaks tab with ads screenshot saved');
})();
