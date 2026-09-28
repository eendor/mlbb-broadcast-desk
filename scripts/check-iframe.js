const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await page.goto('http://127.0.0.1:3210');
  await page.waitForTimeout(3000);
  
  const frame = page.frame({ url: /overlay\.html/ });
  if (frame) {
    const info = await frame.evaluate(() => {
      const v = document.querySelector('video');
      const err = document.querySelector('.ad-playback-error');
      return {
        hasVideo: !!v,
        videoSrc: v?.src,
        videoPaused: v?.paused,
        videoCurrentTime: v?.currentTime,
        errorHidden: err?.hidden
      };
    });
    console.log('Iframe info:', JSON.stringify(info, null, 2));
  }
  
  await page.screenshot({ path: 'desk_monitor_fixed.png' });
  await browser.close();
})();
