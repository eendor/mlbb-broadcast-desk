const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const fs = require('fs');
  const imgBuffer = fs.readFileSync('C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/.user_uploaded/uploaded_media_1_1790413772959.png');
  const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;
  await page.setContent(`<body style="margin:0;padding:0;background:#000;"><img src="${base64}" style="width:1920px;height:1080px;display:block;"></body>`);
  await page.waitForTimeout(500);
  
  // Crop Blue player row 1 (Kayn)
  await page.screenshot({
    path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/crop_ref_blue_row1.png',
    clip: { x: 35, y: 195, width: 750, height: 160 }
  });
  
  // Crop Red player row 1 (SpiderMilez)
  await page.screenshot({
    path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/crop_ref_red_row1.png',
    clip: { x: 1135, y: 195, width: 750, height: 160 }
  });
  
  // Crop Center Column (Objectives, Kill Map, Sponsor)
  await page.screenshot({
    path: 'C:/Users/Rodnee/.gemini/antigravity-cli/brain/7674be3f-5914-4c8e-ba2c-36634156652c/crop_ref_center.png',
    clip: { x: 795, y: 195, width: 330, height: 750 }
  });

  await browser.close();
  console.log('Cropped reference successfully!');
})();
