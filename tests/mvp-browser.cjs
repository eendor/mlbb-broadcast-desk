const {chromium}=require('@playwright/test');const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  fs.mkdirSync('data',{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-mvp-'));
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3222',DATA_DIR:dir},windowsHide:true});
  let browser;
  try{
    const base='http://127.0.0.1:3222';
    for(let i=0;i<50;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    // Seed an MVP with a hero, item, emblem and spell present in the catalog.
    const catalog=JSON.parse(fs.readFileSync('public/assets/catalog.json','utf8'));
    const hero=catalog.heroes.find(h=>h.img&&h.img.includes('/wiki/'))?.name||catalog.heroes[0].name;
    const item=catalog.items[0].name, emblem=catalog.emblems.find(e=>e.group==='emblem').name, spell=catalog.spells[0].name;
    await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:'mvp',mvp:{player:'red.1',name:'PAYAM',hero,kda:'8/1/6',gpm:'897',kp:'82%',items:[item,'','','','',''],emblems:[emblem,'','',''],spell}})});
    browser=await chromium.launch();
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/overlay.html?scene=mvp');
    await page.waitForSelector('.mvp-scene',{timeout:5000});
    const result=await page.evaluate(()=>{
      const q=s=>document.querySelector(s);
      return {
        title:q('.mvp-title')?.textContent,
        name:q('.mvp-nameplate b')?.textContent,
        statCount:document.querySelectorAll('.mvp-stat').length,
        stats:[...document.querySelectorAll('.mvp-stat b')].map(e=>e.textContent),
        splash:!!q('.mvp-splash'),
        splashSrc:q('.mvp-splash')?.getAttribute('src'),
        itemImgs:[...document.querySelectorAll('.mvp-equipment img')].length,
        emblemImgs:[...document.querySelectorAll('.mvp-emblem img')].length,
        spellImg:!!q('.mvp-spell img'),
        spellSrc:q('.mvp-spell img')?.getAttribute('src'),
      };
    });
    // Confirm the actual asset files load (not 404).
    const check=async url=>{const r=await fetch(base+url);return r.ok;};
    const splashOk=result.splashSrc?await check(result.splashSrc):false;
    const spellOk=result.spellSrc?await check(result.spellSrc):false;
    if(errors.length)throw Error('Page errors: '+errors.join('\n'));
    if(result.title!=='GAME MVP')throw Error('Missing title: '+result.title);
    if(result.name!=='PAYAM')throw Error('Missing name: '+result.name);
    if(result.statCount!==3)throw Error('Expected 3 stat cards, got '+result.statCount);
    if(!result.splash)throw Error('Missing hero splash');
    if(!result.itemImgs)throw Error('No equipment icon rendered');
    if(!result.emblemImgs)throw Error('No emblem icon rendered');
    if(!result.spellImg)throw Error('No spell icon rendered');
    if(!splashOk)throw Error('Hero splash asset 404: '+result.splashSrc);
    if(!spellOk)throw Error('Spell asset 404: '+result.spellSrc);
    // Verify draft no longer emits animated media.
    await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:'draft'})});
    await page.goto(base+'/overlay.html?scene=draft');
    await page.waitForSelector('.broadcast-draft');
    const videoCount=await page.evaluate(()=>document.querySelectorAll('.broadcast-draft video,.hero-gif-badge').length);
    if(videoCount>0)throw Error('Draft still emits animated hero media: '+videoCount);
    console.log('PASS',{...result,splashOk,spellOk,draftVideoCount:videoCount});
  }finally{await browser?.close();child.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
