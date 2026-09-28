const catalog = require('../public/assets/catalog.json');
const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const heroes = new Map(catalog.heroes.map(hero => [key(hero.name), hero.name]));
const placeholder = name => !name || /^Player\s*\d+$/i.test(name);
const canonicalHero = name => heroes.get(key(name)) || '';

// Recognition rows may reorder. Keep the broadcast roster attached to names,
// then unique confirmed heroes, and only use the row for a still-unknown slot.
function mergePlayers(current, incoming, rawRows, memory, sampledAt) {
  const output = structuredClone(current), used = new Set();
  for (let row = 0; row < incoming.length; row++) {
    const p = incoming[row] || {}, raw = rawRows?.find((v, i) => (v.slot ?? i) === (p.slot ?? row)) || (rawRows ? {} : p);
    const name = String(raw.rawIgn || raw.name || p.name || '').trim();
    const bot = name.match(/^\[Computer\]\s*(.+)$/i);
    const hero = canonicalHero(bot ? bot[1] : raw.hero);
    const named = placeholder(name) ? [] : current.map((v, i) => key(v.name) === key(name) ? i : -1).filter(i => i >= 0);
    const sameHero = hero ? current.map((v, i) => v.hero === hero ? i : -1).filter(i => i >= 0) : [];
    let target = named.length === 1 ? named[0] : sameHero.length === 1 ? sameHero[0] : (p.slot ?? row);
    if (target < 0 || target >= 5 || used.has(target)) continue;
    const previous = memory.get(target), cur = current[target];
    if (previous?.locked && !placeholder(name) && previous.name && previous.name !== key(name) && named.length !== 1 && sameHero.length !== 1) continue;
    used.add(target);
    let evidence = previous || { name: placeholder(name) ? '' : key(name), hero: '', count: 0, at: 0, locked: '' };
    if (hero && !evidence.locked && sampledAt > evidence.at) {
      evidence = { ...evidence, name: placeholder(name) ? evidence.name : key(name), hero, count: evidence.hero === hero ? evidence.count + 1 : 1, at: sampledAt };
      if (bot || evidence.count >= 2) evidence.locked = hero;
    }
    memory.set(target, evidence);
    // A conflicting portrait is not evidence that a player changed heroes.
    if (evidence.locked && hero && hero !== evidence.locked) continue;
    const next = { ...cur };
    if (evidence.locked) {
      if (cur.hero && cur.hero !== evidence.locked) { next.items = []; next.itemsKnown = false; }
      next.hero = evidence.locked;
    }
    next.identityPending = !!hero && !evidence.locked;
    if (!placeholder(name)) next.name = String(p.name || name);
    for (const field of ['kda', 'gold']) if (raw[field] !== undefined && p[field] !== undefined) next[field] = p[field];
    if (Number.isInteger(raw.level) && raw.level >= 1 && raw.level <= 15) next.level = Math.max(cur.level || 0, raw.level);
    // Hidden equipment is unknown, not an empty inventory. Resolve every item
    // before replacing a build; never substitute a battle spell for equipment.
    const visible = raw.itemsVisible === true || (raw.itemsVisible !== false && Array.isArray(raw.items) && raw.items.length > 0);
    next.itemsVisible = visible;
    if (visible && Array.isArray(p.items)) {
      next.items = p.items.slice(0, 6).map((item, slot) => {
        if (item?.id > 0 && item.icon) return item;
        if (raw.items?.[slot] === '') return { id: 0, name: '', icon: '' };
        return cur.items?.[slot] || { id: 0, name: 'Unreadable slot', icon: '' };
      });
      next.itemsKnown = p.items.every((item, slot) => item?.id > 0 && item.icon || raw.items?.[slot] === '');
      next.itemsSampledAt = sampledAt;
    }
    output[target] = next;
  }
  return output;
}

function protectNewerHud(patch, samples, sampledAt, mode) {
  const newer = field => (samples.get(field) || 0) > sampledAt;
  if (newer('gameTime')) { delete patch.gameTime; delete patch.gameClock; }
  if (newer('draftTimer.remaining')) delete patch.draftTimer;
  if (newer('draftPhase')) delete patch.phase;
  for (const side of ['blue', 'red']) for (const field of ['kills', 'gold', 'turrets', 'lord', 'turtle']) {
    if (patch[side] && newer(side + '.' + field)) delete patch[side][field];
  }
  if (mode === 'draft') for (const side of ['blue', 'red']) {
    patch[side]?.players?.forEach((player, slot) => { if (newer(`${side}.players.${slot}.hero`)) delete player.hero; });
    patch[side]?.bans?.forEach((hero, slot, bans) => { if (newer(`${side}.bans.${slot}`)) bans[slot] = ''; });
  }
  return patch;
}

module.exports = { mergePlayers, protectNewerHud };
