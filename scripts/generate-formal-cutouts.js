const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');
const { createCutout } = require(path.join(projectDir, 'lib/photo-cutout'));
const cutout = createCutout(projectDir, path.join(projectDir, 'data'));
const library = JSON.parse(fs.readFileSync(path.join(projectDir, 'public/assets/playoffs/player-photos.json'), 'utf8'));

// Prioritize PICE and ULS/ULS-CED, then all other teams
const formal = library.poses.filter(p => p.pose === 'formal');
const priority = formal.filter(p => ['PICE', 'ULS', 'ULS-CED'].includes(p.team));
const others = formal.filter(p => !['PICE', 'ULS', 'ULS-CED'].includes(p.team));
const queue = [...priority, ...others];

console.log(`Starting formal cutout generation for ${queue.length} formal poses...`);

async function run() {
  const cutouts = {};
  const cacheFile = path.join(projectDir, 'public/assets/playoffs/formal-cutouts.json');
  if (fs.existsSync(cacheFile)) {
    try {
      Object.assign(cutouts, JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    } catch {}
  }

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (cutouts[item.url] && fs.existsSync(path.join(projectDir, 'public', cutouts[item.url]))) {
      console.log(`[${i + 1}/${queue.length}] Already cached ${item.team} - ${item.filename}`);
      continue;
    }
    try {
      console.log(`[${i + 1}/${queue.length}] Processing ${item.team} - ${item.filename}...`);
      const res = await cutout(item.url);
      cutouts[item.url] = res.url;
      fs.writeFileSync(cacheFile, JSON.stringify(cutouts, null, 2));
      console.log(` -> Saved formal cutout: ${res.url}`);
    } catch (e) {
      console.error(` -> Failed ${item.filename}:`, e.message);
    }
  }
  console.log('All formal cutouts generated!');
}

run();
