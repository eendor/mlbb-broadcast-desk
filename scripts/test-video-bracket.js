const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  const defsSvg = fs.readFileSync('public/assets/playoffs/bracket-defs.svg', 'utf8');
  const innerDefs = defsSvg.replace('</svg>', '<g data-playoff-live></g></svg>');
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; overflow: hidden; background: #000; }
        .bracket-container { position: relative; width: 1920px; height: 1080px; }
        .playoff-video-bg { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; }
        .bracket-svg { position: absolute; inset: 0; width: 1920px; height: 1080px; pointer-events: none; }
      </style>
    </head>
    <body>
      <div class="bracket-container">
        <video class="playoff-video-bg" src="http://localhost:3210/assets/playoffs/bracket.mp4" autoplay loop muted playsinline></video>
        ${innerDefs.replace('<svg ', '<svg class="bracket-svg" ')}
      </div>
    </body>
    </html>
  `);
  
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/test_video_frame_0s.png' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/test_video_frame_1.5s.png' });
  await browser.close();
  console.log('Video screenshots taken!');
})();
