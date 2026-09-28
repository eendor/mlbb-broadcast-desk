// Rename the supplied formal pose photos to the IGN they were visually paired with.
// Run from the repository root with: node scripts/rename-playoff-formal-photos.js
const fs = require('node:fs');
const path = require('node:path');
const teams = require('../public/playoffs-model').teams;
const manifestPath = path.join(__dirname, '../public/assets/playoffs/player-photos.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const folders = {
  'APO':'APO', 'FSMS':'FSMS', 'JMES':'JMESS', 'PICE':'PICE', 'PSITS':'PSITS',
  'ULS-CED':'ULS', 'EARTH SAVERS':'USM EARTH SAVERS', 'UFTTS':'UTTTS'
};
const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/[ .]+$/g, '');
const sourceOverrides = {
  'JMES':{'+hedgehog+':'IMG_0099.jpg','cheifûū':'IMG_0105.jpg'},
  'ULS-CED':{'KiKiKaKa':'IMG_0072.jpg','seomi':'IMG_0016.jpg'}
};
const renamePairs = [];
for (const team of teams) {
  const roster = team.players;
  const poses = manifest.poses.filter(p => p.team === team.id && p.pose === 'formal');
  if (poses.length !== roster.length) throw Error(`${team.id}: expected ${roster.length} formal poses, found ${poses.length}`);
  const assigned = manifest.formalPlayers.filter(p => p.team === team.id);
  if (assigned.length !== roster.length) throw Error(`${team.id}: formal IGN mapping incomplete`);
  for (const [index, record] of assigned.entries()) {
    record.ign = roster[index];
    const target = `${safe(record.ign)}.jpg`;
    const sourceFilename = poses.some(p => p.filename === target) ? target : sourceOverrides[team.id]?.[record.ign] || record.source;
    const pose = poses.find(p => p.filename === sourceFilename);
    if (!pose) throw Error(`${team.id}/${record.ign}: source ${sourceFilename} not found`);
    const sourcePath = path.join(__dirname, '..', 'PLAYOFFS', 'POSE Formal Individual Players', folders[team.id], pose.filename);
    const targetPath = path.join(path.dirname(sourcePath), target);
    if (!fs.existsSync(sourcePath)) throw Error(`Missing source ${sourcePath}`);
    renamePairs.push({ team:team.id, record, pose, sourcePath, targetPath, target });
  }
}
for (const [index, pair] of renamePairs.entries()) {
  pair.tempPath = `${pair.sourcePath}.ign-rename-${index}.tmp`;
  fs.renameSync(pair.sourcePath, pair.tempPath);
}
for (const pair of renamePairs) {
  if (fs.existsSync(pair.targetPath)) throw Error(`Refusing to overwrite ${pair.targetPath}`);
  fs.renameSync(pair.tempPath, pair.targetPath);
  pair.pose.filename = pair.target;
  pair.record.source = pair.target;
  pair.record.url = pair.pose.url;
  pair.record.thumb = pair.pose.thumb;
  console.log(`${pair.team}: ${pair.target}`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Renamed ${renamePairs.length} formal photos and updated ${manifestPath}`);
