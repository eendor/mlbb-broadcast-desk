// Preserve the supplied SVG artwork and move its sixteen team logos into reusable definitions.
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const teams = [
  ['ULS',137], ['USM EARTH SAVERS CLUB',167], ['JMES',298], ['FTSS',140],
  ['APO',168], ['ABES',184], ['PICE',188], ['DEVCOM',199],
  ['PSITS',212], ['JIECEP',227], ['JPEDS',279], ['AMS',280],
  ['FSMS',281], ['PNSA',282], ['ICPEP',283], ['UFTTS',284],
];
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2048, height: 1152 } });
    await page.setContent('<style>body{margin:0}</style>' + fs.readFileSync('swiss stage.svg', 'utf8'));
    const devcomFile=fs.readFileSync('Org Logos/DEVCOM.png');
    const devcom={src:'data:image/png;base64,'+devcomFile.toString('base64'),width:devcomFile.readUInt32BE(16),height:devcomFile.readUInt32BE(20)};
    const prepared = await page.evaluate(({teams,devcom}) => {
      const svg = document.querySelector('svg'), children = [...svg.children], defs = children[0];
      if (children.length !== 299 || svg.getAttribute('viewBox') !== '0 0 1536 863.999991') throw Error('Unexpected source bracket layout');
      const logos = teams.map(([name, index], i) => {
        const node = children[index], b = node.getBoundingClientRect();
        if (node.querySelectorAll('image').length !== 1 || b.x > 360 || b.y < 150) throw Error('Unexpected team logo: ' + name);
        const box = [b.x,b.y,b.width,b.height].map(n => +(n * .75).toFixed(4));
        const id = 'swiss-logo-' + i;
        node.id = id;
        return { name, id, box, node };
      });
      for (const logo of logos) defs.append(logo.node);
      const replacement=document.createElementNS('http://www.w3.org/2000/svg','g');
      replacement.id='swiss-logo-7';
      const image=document.createElementNS('http://www.w3.org/2000/svg','image');
      image.setAttribute('href',devcom.src);image.setAttribute('width',devcom.width);image.setAttribute('height',devcom.height);
      image.setAttribute('data-source','/assets/logos/DEVCOM.png');
      replacement.append(image);logos[7].node.replaceWith(replacement);logos[7].box=[0,0,devcom.width,devcom.height];
      logos[7].source='/assets/logos/DEVCOM.png';
      svg.setAttribute('width', '1920');
      svg.setAttribute('height', '1080');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Swiss stage tournament bracket');
      svg.setAttribute('data-source', 'swiss stage.svg');
      return { svg: new XMLSerializer().serializeToString(svg), logos: logos.map(({node,...logo})=>logo) };
    }, {teams,devcom});
    // Visible extents exclude transparent padding in four of the embedded logos.
    for (const [i,box] of [[0,[67.5,168,52,52]],[2,[67,237,53,54]],[10,[67,502,51,53]],[12,[67,572,54,54]]]) prepared.logos[i].box = box;
    fs.writeFileSync('public/assets/swiss-bracket-template.svg', prepared.svg);
    fs.writeFileSync('public/assets/swiss-bracket-logos.json', JSON.stringify(prepared.logos, null, 2) + '\n');
    console.log('Prepared original SVG with', prepared.logos.length, 'reusable team logos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
