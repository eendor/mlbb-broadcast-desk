// 16-team Swiss engine (BO3 series: first to 2 game wins takes the match).
// 3 series wins qualify, 3 series losses eliminate.
// R1: 0-0 (8) / R2: 1-0 (4) + 0-1 (4) / R3: 2-0 (2) + 1-1 (4) + 0-2 (2)
// R4: 2-1 (3) + 1-2 (3) / R5: 2-2 (3). Qualified 2+3+3=8, eliminated 2+3+3=8.
const SIZE = 16, QUALIFY_WINS = 3, ELIM_LOSSES = 3, GAMES_TO_WIN = 2;
const artworkLogos = require('../public/assets/swiss-bracket-logos.json');

function cleanName(n) {
  const s = String(n ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw Error('Team names cannot be empty');
  if (s.length > 100) throw Error(`Team name too long: ${s.slice(0, 40)}`);
  return s;
}

function pairKey(a, b) {
  const [x, y] = [a, b].sort((p, q) => p.localeCompare(q));
  return `${x}||${y}`;
}

function startSwiss(names) {
  if (!Array.isArray(names) || names.length !== SIZE) throw Error(`Swiss needs exactly ${SIZE} teams`);
  const teams = names.map(cleanName);
  const seen = new Set();
  for (const t of teams) {
    const k = t.toLowerCase();
    if (seen.has(k)) throw Error(`Duplicate team: ${t}`);
    seen.add(k);
  }
  const order = {};
  teams.forEach((t, i) => { order[t] = i; });
  const swiss = {
    game: 'swiss-bo1',
    teams: teams.map(name => ({ name, logoId: artworkLogos.find(l => l.name.toLowerCase() === name.toLowerCase())?.id ?? null, w: 0, l: 0, status: 'alive' })),
    rounds: [],
    currentRound: 1,
    complete: false,
    played: [],
  };
  const matches = [];
  for (let i = 0; i < SIZE; i += 2) {
    matches.push({ id: `R1M${i / 2 + 1}`, round: 1, pool: '0-0', blue: teams[i], red: teams[i + 1], winner: null, games: [] });
    swiss.played.push(pairKey(teams[i], teams[i + 1]));
  }
  swiss.rounds.push({ round: 1, matches });
  return { swiss, order };
}

// Internal: swiss object carries no order map; seeding order = index in teams[].
function teamIndex(swiss, name) {
  return swiss.teams.findIndex(t => t.name === name);
}

function recordOf(t) { return `${t.w}-${t.l}`; }

function currentMatches(swiss) {
  return swiss.rounds[swiss.rounds.length - 1].matches;
}

function findMatch(swiss, matchId) {
  for (const r of swiss.rounds) {
    const m = r.matches.find(m => m.id === matchId);
    if (m) return m;
  }
  return null;
}

function applyWin(swiss, teamName, won) {
  const t = swiss.teams.find(t => t.name === teamName);
  if (!t) throw Error(`Unknown team: ${teamName}`);
  if (won) t.w += 1; else t.l += 1;
  if (t.w >= QUALIFY_WINS) t.status = 'qualified';
  else if (t.l >= ELIM_LOSSES) t.status = 'eliminated';
  else t.status = 'alive';
}

function revertWin(swiss, teamName, wasWin) {
  const t = swiss.teams.find(t => t.name === teamName);
  if (wasWin) t.w -= 1; else t.l -= 1;
  t.status = t.w >= QUALIFY_WINS ? 'qualified' : t.l >= ELIM_LOSSES ? 'eliminated' : 'alive';
}

function reportResult(swiss, matchId, winner) {
  if (swiss.complete) throw Error('Swiss stage is complete');
  if (winner !== null && winner !== 'blue' && winner !== 'red') throw Error('Winner must be blue, red, or null to clear a result');
  const m = findMatch(swiss, matchId);
  if (!m) throw Error(`Unknown match: ${matchId}`);
  const latest = swiss.rounds[swiss.rounds.length - 1].round;
  if (m.round !== latest) throw Error(`${matchId} is locked (round ${m.round} already advanced)`);
  if (m.winner === winner) return { advanced: false, match: m };
  if (m.winner) {
    // Correction within the live round: revert previous result first.
    const prevWinner = m.winner === 'blue' ? m.blue : m.red;
    const prevLoser = m.winner === 'blue' ? m.red : m.blue;
    revertWin(swiss, prevWinner, true);
    revertWin(swiss, prevLoser, false);
  }
  m.winner = winner;
  if (winner === null) { m.games = []; return { advanced: false, match: m }; }
  const winName = winner === 'blue' ? m.blue : m.red;
  const loseName = winner === 'blue' ? m.red : m.blue;
  applyWin(swiss, winName, true);
  applyWin(swiss, loseName, false);
  const round = swiss.rounds[swiss.rounds.length - 1];
  if (round.matches.every(x => x.winner)) {
    return { advanced: generateNextRound(swiss), match: m };
  }
  return { advanced: false, match: m };
}

function seriesScore(m) {
  let blue = 0, red = 0;
  for (const g of m.games || []) { if (g.winner === 'blue') blue += 1; else if (g.winner === 'red') red += 1; }
  return { blue, red };
}

// Record one BO3 game. First side to GAMES_TO_WIN clinches the series and
// advances through the normal reportResult path. Never auto-overturns a
// manually recorded series winner — conflicts are reported for the marshal.
function reportGame(swiss, matchId, { winner, battleId = null, n = 0 } = {}) {
  if (swiss.complete) throw Error('Swiss stage is complete');
  if (winner !== 'blue' && winner !== 'red') throw Error('Game winner must be blue or red');
  const m = findMatch(swiss, matchId);
  if (!m) throw Error(`Unknown match: ${matchId}`);
  const latest = swiss.rounds[swiss.rounds.length - 1].round;
  if (m.round !== latest) throw Error(`${matchId} is locked (round ${m.round} already advanced)`);
  m.games ??= [];
  if (battleId && m.games.some(g => g.battleId === battleId)) {
    return { duplicate: true, match: m, series: seriesScore(m), clinched: null, applied: false, advanced: false };
  }
  const gameNo = Number.isInteger(n) && n > 0 ? n : m.games.reduce((a, g) => Math.max(a, g.n || 0), 0) + 1;
  const same = m.games.find(g => g.n === gameNo);
  if (same) {
    if (same.winner === winner) {
      return { duplicate: true, match: m, series: seriesScore(m), clinched: null, applied: false, advanced: false };
    }
    same.winner = winner; same.battleId = battleId || same.battleId || null; same.at = Date.now();
  } else {
    m.games.push({ n: gameNo, winner, battleId: battleId || null, at: Date.now() });
  }
  const series = seriesScore(m);
  const clinched = series.blue >= GAMES_TO_WIN ? 'blue' : series.red >= GAMES_TO_WIN ? 'red' : null;
  if (!clinched) return { match: m, series, clinched: null, applied: false, advanced: false };
  if (m.winner === clinched) return { match: m, series, clinched, applied: false, advanced: false, consistent: true };
  if (m.winner) return { match: m, series, clinched, applied: false, advanced: false, conflict: true };
  const { advanced } = reportResult(swiss, matchId, clinched);
  return { match: m, series, clinched, applied: true, advanced };
}

function generateNextRound(swiss) {
  const alive = swiss.teams.filter(t => t.status === 'alive');
  if (!alive.length) {
    swiss.complete = true;
    return true;
  }
  const groups = new Map();
  for (const t of alive) {
    const k = recordOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t.name);
  }
  const played = new Set(swiss.played);
  const nextRound = swiss.rounds.length + 1;
  const matches = [];
  let n = 0;
  const order = new Map(swiss.teams.map((t, i) => [t.name, i]));
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const [aw, al] = a.split('-').map(Number), [bw, bl] = b.split('-').map(Number);
    return bw - aw || al - bl;
  });
  for (const key of sortedKeys) {
    const pool = groups.get(key).sort((a, b) => order.get(a) - order.get(b));
    if (pool.length % 2) throw Error(`Odd ${key} pool (${pool.length}) — check reported results`);
    // Best-effort rematch avoidance within the pool: prefer fresh pairings,
    // but never block a live show — flag unavoidable rematches instead.
    for (let i = 0; i < pool.length; i += 2) {
      let a = pool[i], b = pool[i + 1];
      if (played.has(pairKey(a, b))) {
        for (let j = i + 2; j < pool.length; j += 2) {
          const c = pool[j], d = pool[j + 1];
          if (!played.has(pairKey(a, c)) && !played.has(pairKey(b, d))) {
            pool[i + 1] = c; pool[j] = b;
            b = c;
            break;
          }
          if (!played.has(pairKey(a, d)) && !played.has(pairKey(b, c))) {
            pool[i + 1] = d; pool[j + 1] = b;
            b = d;
            break;
          }
        }
      }
      n += 1;
      const rematch = played.has(pairKey(a, b));
      matches.push({ id: `R${nextRound}M${n}`, round: nextRound, pool: key, blue: a, red: b, winner: null, games: [], ...(rematch ? { rematch: true } : {}) });
      played.add(pairKey(a, b));
    }
  }
  swiss.played = [...played];
  swiss.rounds.push({ round: nextRound, matches });
  swiss.currentRound = nextRound;
  return true;
}

function qualified(swiss) { return swiss.teams.filter(t => t.status === 'qualified').map(t => t.name); }
function eliminated(swiss) { return swiss.teams.filter(t => t.status === 'eliminated').map(t => t.name); }

function renameTeams(swiss, names) {
  // Validate all names before changing any team, fixture or history entry.
  const clean = startSwiss(names).swiss.teams.map(t => t.name);
  const renamed = new Map(swiss.teams.map((t,i) => [t.name,clean[i]]));
  swiss.teams.forEach((t,i) => {
    if (t.logoId === undefined) t.logoId = artworkLogos.find(l => l.name.toLowerCase() === t.name.toLowerCase())?.id ?? null;
    t.name = clean[i];
  });
  for (const round of swiss.rounds) for (const match of round.matches) {
    match.blue = renamed.get(match.blue);
    match.red = renamed.get(match.red);
  }
  swiss.played = [...new Set(swiss.rounds.flatMap(r => r.matches.map(m => pairKey(m.blue,m.red))))];
  return swiss;
}

// Schedule rows for the overlay (max 8 per round — fits the raised display limit).
function toSchedule(swiss) {
  return currentMatches(swiss).map(m => ({
    time: `R${m.round} • ${m.pool}`,
    blue: m.blue,
    red: m.red,
    note: m.winner ? `FT • ${(m.winner === 'blue' ? m.blue : m.red).toUpperCase()} WINS` : `BO3 • ${m.pool}`,
  }));
}

function swissTicker(swiss) {
  const q = qualified(swiss), e = eliminated(swiss);
  const cur = currentMatches(swiss);
  const pools = [...new Set(cur.map(m => m.pool))].join(' + ');
  let s = `SWISS R${swiss.currentRound} • ${pools} • BO3  /  USM PASIKLABAN 2026`;
  if (q.length) s += `  /  QUALIFIED: ${q.join(', ').toUpperCase()}`;
  if (e.length) s += `  /  ELIMINATED: ${e.join(', ').toUpperCase()}`;
  return s.slice(0, 500);
}

function validateSwiss(s) {
  if (!s || typeof s !== 'object') throw Error('Invalid Swiss bracket');
  if (s.game !== 'swiss-bo1') throw Error('Invalid Swiss format');
  if (typeof s.currentRound !== 'number' || typeof s.complete !== 'boolean') throw Error('Invalid Swiss progress');
  if (!Array.isArray(s.teams) || s.teams.length !== SIZE) throw Error(`Swiss needs exactly ${SIZE} teams`);
  const names = new Set();
  for (const t of s.teams) {
    if (!t || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100) throw Error('Invalid Swiss team');
    const k = t.name.toLowerCase();
    if (names.has(k)) throw Error(`Duplicate Swiss team: ${t.name}`);
    names.add(k);
    if (t.logoId !== undefined && t.logoId !== null && !artworkLogos.some(l => l.id === t.logoId)) throw Error('Invalid Swiss team logo');
    if (!Number.isInteger(t.w) || !Number.isInteger(t.l) || t.w < 0 || t.l < 0 || t.w > 3 || t.l > 3) throw Error(`Invalid record: ${t.name}`);
    if (!['alive', 'qualified', 'eliminated'].includes(t.status)) throw Error(`Invalid status: ${t.name}`);
  }
  if (!Array.isArray(s.rounds) || !s.rounds.length || s.rounds.length > 5) throw Error('Invalid Swiss rounds');
  if (!Array.isArray(s.played)) throw Error('Invalid Swiss history');
  for (const r of s.rounds) {
    if (!Number.isInteger(r.round) || !Array.isArray(r.matches) || !r.matches.length || r.matches.length > 8) throw Error('Invalid Swiss round');
    for (const m of r.matches) {
      if (!m || typeof m.id !== 'string' || m.round !== r.round || typeof m.pool !== 'string') throw Error('Invalid Swiss match');
      if (typeof m.blue !== 'string' || typeof m.red !== 'string' || !names.has(m.blue.toLowerCase()) || !names.has(m.red.toLowerCase())) throw Error(`Invalid Swiss fixture: ${m.id}`);
      if (m.winner !== null && m.winner !== 'blue' && m.winner !== 'red') throw Error(`Invalid Swiss result: ${m.id}`);
      if (m.rematch !== undefined && typeof m.rematch !== 'boolean') throw Error(`Invalid Swiss flag: ${m.id}`);
      if (m.games !== undefined) {
        if (!Array.isArray(m.games)) throw Error(`Invalid Swiss games: ${m.id}`);
        for (const g of m.games) {
          if (!g || !Number.isInteger(g.n) || g.n < 1 || (g.winner !== 'blue' && g.winner !== 'red')) throw Error(`Invalid Swiss game: ${m.id}`);
          if (g.battleId !== null && g.battleId !== undefined && (typeof g.battleId !== 'string' || !/^[a-zA-Z0-9_-]{6,100}$/.test(g.battleId))) throw Error(`Invalid Swiss game id: ${m.id}`);
        }
      }
    }
  }
  return s;
}

module.exports = { SIZE, GAMES_TO_WIN, startSwiss, reportResult, reportGame, seriesScore, currentMatches, findMatch, qualified, eliminated, renameTeams, toSchedule, swissTicker, validateSwiss, recordOf };
