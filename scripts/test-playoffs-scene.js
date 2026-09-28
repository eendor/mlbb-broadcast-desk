const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://localhost:3210/overlay.html?scene=playoffs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/verified_playoffs_scene_0s.png' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/verified_playoffs_scene_1.5s.png' });
  await browser.close();
  console.log('Playoffs scene test complete!');
})();
