const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');
const { createCutout } = require(path.join(projectDir, 'lib/photo-cutout'));
const cutout = createCutout(projectDir, path.join(projectDir, 'data'));
const library = JSON.parse(fs.readFileSync(path.join(projectDir, 'public/assets/playoffs/player-photos.json'), 'utf8'));

// Prioritize PICE and ULS, then all other teams
const freestyle = library.poses.filter(p => p.pose === 'freestyle');
const priority = freestyle.filter(p => ['PICE', 'ULS', 'ULS-CED'].includes(p.team));
const others = freestyle.filter(p => !['PICE', 'ULS', 'ULS-CED'].includes(p.team));
const queue = [...priority, ...others];

console.log(`Starting cutout generation for ${queue.length} freestyle poses...`);

async function run() {
  const cutouts = {};
  const cacheFile = path.join(projectDir, 'public/assets/playoffs/freestyle-cutouts.json');
  if (fs.existsSync(cacheFile)) {
    Object.assign(cutouts, JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
  }

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      console.log(`[${i + 1}/${queue.length}] Processing ${item.team} - ${item.filename}...`);
      const res = await cutout(item.url);
      cutouts[item.url] = res.url;
      // Save progress incrementally
      fs.writeFileSync(cacheFile, JSON.stringify(cutouts, null, 2));
      console.log(` -> Saved cutout: ${res.url}`);
    } catch (e) {
      console.error(` -> Failed ${item.filename}:`, e.message);
    }
  }
  console.log('All freestyle cutouts generated!');
}

run();
