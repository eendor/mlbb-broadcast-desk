/* CBDEM Dagyawan 2026 · Mobile Legends: Bang Bang — overlay logic.
   Draws the server's state onto a fixed 1920x1080 stage and follows live changes
   over Server-Sent Events. Runs in OBS's built-in browser (Chromium 103). */
(() => {
  'use strict';

  const STAGE_W = 1920;
  const STAGE_H = 1080;

  // Same ranges as lib/state.js
  const LIMITS = { center: [900, 1020], width: [800, 1100], height: [30, 90], offsetY: [-20, 40] };

  // Drawn when the server can't be reached (same as the defaults in lib/state.js)
  const DEFAULTS = {
    blueTeam: 'JPES',
    redTeam: 'JMES',
    blueScore: 0,
    redScore: 0,
    format: 'BO3 GRAND FINALS',
    tournamentTitle: 'CBDEM DAGYAWAN 2026',
    tournamentSubtitle: 'UNIVERSITY OF SOUTHERN MINDANAO',
    showScore: true,
    showEvent: true,
    showEmblem: true,
    showPartners: true,
    showGuides: false,
    partnersLabel: 'IN PARTNERSHIP WITH',
    partners: [
      { name: 'MSL PHILIPPINES', logo: 'msl-ph.png', show: true },
      { name: 'UEC PRODUCTION', logo: 'uec-production.png', show: true },
    ],
    glass: 60,
    sheen: true,
    calibration: { center: 960, width: 945, height: 55, offsetY: 0 },
  };

  const FONTS = ['700 46px Teko', '700 13px Rajdhani', '700 11px "Chakra Petch"'];
  const MODES = ['preview', 'blur', 'mask', 'guides'];

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');

  const sides = {
    blue: {
      pod: $('podBlue').querySelector('.pod'), logo: $('logoBlue'), id: $('idBlue'),
      plate: $('plateBlue'), full: $('fullBlue'), acro: $('acroBlue'), pips: $('pipsBlue'), pipsSlot: $('pipsBlueSlot'),
    },
    red: {
      pod: $('podRed').querySelector('.pod'), logo: $('logoRed'), id: $('idRed'),
      plate: $('plateRed'), full: $('fullRed'), acro: $('acroRed'), pips: $('pipsRed'), pipsSlot: $('pipsRedSlot'),
    },
  };

  const teams = {};       // id -> { name, lines, colors }
  const autoColors = {};  // id -> colours picked from the logo, for teams without colours in teams.json
  let latest = null;      // last state from the server
  let booted = false;     // first frame drawn
  let partnersKey = null; // what the partners row was last built from
  let partnerTimer = null; // turns the partner pages
  const PARTNER_PAGE_MS = 7000;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const num = (value, fallback) => {
    const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const show = (el, on) => el.classList.toggle('off', !on);

  // ---------- stage scaling ----------

  function fitStage() {
    const w = window.innerWidth || STAGE_W;
    const h = window.innerHeight || STAGE_H;
    const scale = Math.min(w / STAGE_W, h / STAGE_H);
    const x = (w - STAGE_W * scale) / 2;
    const y = (h - STAGE_H * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  // ---------- helpers ----------

  // True when the text is wider than its box. scrollWidth and clientWidth are whole pixels, so
  // text up to a pixel too wide passed that check and then lost its last letters to an ellipsis.
  function overflows(part) {
    if (part.scrollWidth > part.clientWidth) return true;
    const style = getComputedStyle(part);
    const extra = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const border = style.boxSizing === 'border-box' ? parseFloat(style.width) : parseFloat(style.width) + extra;
    const outer = part.getBoundingClientRect().width;
    if (!border || !outer) return false;
    const range = document.createRange();
    range.selectNodeContents(part);
    // both rectangles are on screen, so dividing by the element's own scale undoes the stage scaling
    return range.getBoundingClientRect().width / (outer / border) > border - extra + 0.01;
  }

  // Shrinks the font size until the text fits its box (it never wraps).
  // `parts` are the boxes to check when the text sits in child elements.
  function fit(el, max, min, step = 0.5, parts = [el]) {
    const over = () => parts.some(overflows);
    let size = max;
    el.style.fontSize = `${size}px`;
    while (size > min && over()) {
      size = Math.max(min, Math.round((size - step) * 100) / 100);
      el.style.fontSize = `${size}px`;
    }
    return !over();
  }

  // Restarts a one-off CSS animation
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const done = (event) => {
      if (event.target !== el) return;
      el.classList.remove(cls);
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
  }

  // Splits a name into two lines at the space nearest the middle ("MSL" / "PHILIPPINES")
  function splitName(name, keepShort = 0) {
    const words = text(name).split(' ').filter(Boolean);
    if (words.length < 2 || words.join(' ').length <= keepShort) return words.length ? [words.join(' ')] : [];
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  // ---------- loading ----------

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const all = Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => null)));
    return Promise.race([all, wait(1500)]);
  }

  async function loadTeams() {
    try {
      const res = await fetch('teams.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      for (const team of Array.isArray(list) ? list : []) {
        if (!team || !team.id) continue;
        const lines = Array.isArray(team.lines) && team.lines.length
          ? team.lines.slice(0, 2).map(text)
          : splitName(team.name);
        teams[String(team.id).toUpperCase()] = { name: text(team.name), lines: lines.filter(Boolean), colors: readColors(team) };
      }
    } catch (err) {
      console.warn('teams.json could not be loaded, so only team ids are shown.', err);
    }
  }

  // ---------- series ----------

  function series(s) {
    const match = /BO\s*(\d+)/i.exec(s.format || '');
    const bestOf = clamp(match ? parseInt(match[1], 10) : 3, 1, 7);
    const winsNeeded = clamp(Math.floor(bestOf / 2) + 1, 1, 4);
    const b = clamp(Math.round(num(s.blueScore, 0)), 0, 4);
    const r = clamp(Math.round(num(s.redScore, 0)), 0, 4);
    const decided = b >= winsNeeded || r >= winsNeeded;
    const game = decided ? Math.max(1, b + r) : Math.min(b + r + 1, bestOf);
    return { bestOf, winsNeeded, b, r, decided, game };
  }

  // ---------- team colours ----------

  // Used when a team has no colours in teams.json and none can be read from its logo
  const SIDE_COLORS = {
    blue: { color: '#1e6bff', color2: '#0b3aa8', accent: '#5cc8ff' },
    red: { color: '#e8344f', color2: '#9e1430', accent: '#ff8fa1' },
  };
  const HEX = /^#[0-9a-f]{6}$/i;

  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

  // Darker (f < 1) or mixed towards white (f > 1)
  function shade(hex, f) {
    return rgbToHex(hexToRgb(hex).map((v) => (f < 1 ? v * f : v + (255 - v) * (f - 1))));
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      const u = ((t % 1) + 1) % 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
  }

  // "color", "color2" and "accent" from teams.json (null when there's no "color")
  function readColors(team) {
    if (!HEX.test(team.color || '')) return null;
    const color = team.color.toLowerCase();
    return {
      color,
      color2: HEX.test(team.color2 || '') ? team.color2.toLowerCase() : shade(color, 0.58),
      accent: HEX.test(team.accent || '') ? team.accent.toLowerCase() : shade(color, 1.45),
    };
  }

  // Picks a team colour from its logo: the most common strong hue, kept dark enough for white text
  function colorsFromLogo(img) {
    try {
      const size = 40;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const bins = Array.from({ length: 24 }, () => [0, 0, 0, 0]); // weight, r, g, b per hue
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        const val = max / 255;
        if (sat < 0.35 || val < 0.22) continue; // skip white, grey, black and faint pixels
        const bin = bins[Math.floor(rgbToHsl(r, g, b)[0] * 24) % 24];
        const w = sat * val;
        bin[0] += w;
        bin[1] += r * w;
        bin[2] += g * w;
        bin[3] += b * w;
      }
      const weight = (i) => bins[i][0] + 0.5 * (bins[(i + 23) % 24][0] + bins[(i + 1) % 24][0]);
      let best = 0;
      for (let i = 1; i < 24; i += 1) if (weight(i) > weight(best)) best = i;
      const [w, r, g, b] = bins[best];
      if (!w) return null;
      const [h, s, l] = rgbToHsl(r / w, g / w, b / w);
      const sat = Math.min(Math.max(s, 0.5), 0.9);
      const light = clamp(l, 0.34, 0.44);
      return {
        color: rgbToHex(hslToRgb(h, sat, light)),
        color2: rgbToHex(hslToRgb(h, sat, light * 0.58)),
        accent: rgbToHex(hslToRgb(h, Math.min(Math.max(s, 0.55) + 0.1, 0.9), 0.62)),
      };
    } catch (err) {
      return null;
    }
  }

  function teamColors(key, id) {
    const team = teams[id];
    return (team && team.colors) || autoColors[id] || SIDE_COLORS[key];
  }

  function applyColors(key, id) {
    const colors = teamColors(key, id);
    stage.style.setProperty(`--team-${key}`, colors.color);
    stage.style.setProperty(`--team-${key}-2`, colors.color2);
    stage.style.setProperty(`--team-${key}-accent`, colors.accent);
  }

  // ---------- teams ----------

  function setLogo(key, id) {
    const side = sides[key];
    const sources = [`assets/logos-transparent/${encodeURIComponent(id)}.png`, `assets/logos/${encodeURIComponent(id)}.png`];
    let attempt = 0;
    side.logo.dataset.team = id;
    side.logo.alt = `${id} logo`;
    side.id.textContent = id;
    side.pod.classList.remove('missing');
    side.logo.onload = () => {
      // no colours in teams.json: take them from the logo
      if (side.logo.dataset.team !== id || (teams[id] && teams[id].colors)) return;
      if (!autoColors[id]) autoColors[id] = colorsFromLogo(side.logo);
      if (autoColors[id]) applyColors(key, id);
    };
    side.logo.onerror = () => {
      if (side.logo.dataset.team !== id) return;
      attempt += 1;
      if (attempt < sources.length) side.logo.src = sources[attempt];
      else side.pod.classList.add('missing');
    };
    side.logo.src = sources[0];
  }

  function renderTeam(key, id) {
    const side = sides[key];
    if (side.logo.dataset.team !== id) {
      const team = teams[id] || { lines: [] };
      const [first = '', second = ''] = team.lines;
      setLogo(key, id);
      applyColors(key, id);
      side.acro.textContent = id;
      side.full.children[0].textContent = first;
      side.full.children[1].textContent = second;
      side.plate.classList.toggle('no-name', !first && !second);
      if (booted) {
        replay(side.logo, 'swap-in');
        replay(side.id, 'swap-in');
        replay(side.full, 'swap-in');
        replay(side.acro, 'swap-in');
      }
    }
    // the acronym first: the full name gets whatever space is left
    fit(side.acro, 46, 28);
    fit(side.full, 13, 9.5, 0.25, Array.from(side.full.children));
  }

  function renderPips(container, count, wins) {
    let rebuilt = false;
    if (container.children.length !== count) {
      container.textContent = '';
      for (let i = 0; i < count; i += 1) container.appendChild(el('span', 'pip'));
      rebuilt = true;
    }
    Array.prototype.forEach.call(container.children, (pip, i) => {
      const on = i < wins;
      if (on && !pip.classList.contains('on') && booted && !rebuilt) replay(pip, 'pop');
      pip.classList.toggle('on', on);
    });
  }

  // ---------- event card ----------

  // One line of the title. A year at the very end is drawn in gold: "CBDEM DAGYAWAN <em>2026</em>"
  function titleLine(line, last) {
    const span = el('span', 'ln');
    const match = last ? /^(.*?)(\d{4})$/.exec(line) : null;
    if (match && (match[1] === '' || /\s$/.test(match[1]))) {
      span.append(match[1], el('em', '', match[2]));
    } else {
      span.textContent = line;
    }
    return span;
  }

  // The title shrinks to fit on one line; a long one moves onto two lines
  function renderTitle(node, title) {
    node.textContent = '';
    node.classList.remove('two');
    node.appendChild(titleLine(title, true));
    if (fit(node, 34, 20, 0.5, [node.firstChild])) return;
    const lines = splitName(title);
    if (lines.length < 2) return; // a single long word stays on one line, with an ellipsis
    node.textContent = '';
    node.classList.add('two');
    node.append(titleLine(lines[0], false), titleLine(lines[1], true));
    fit(node, 18, 13, 0.5, Array.from(node.children));
  }

  // "BO3 GRAND FINALS" -> BO3 on a gold tab, then GRAND FINALS
  function setFormat(node, format) {
    node.textContent = '';
    const match = /^\s*(BO\s*\d+)\s*[-·:|]?\s*(.*)$/i.exec(format);
    if (!match || !match[2]) {
      node.appendChild(el('span', 'rest', match ? match[1].replace(/\s+/g, '').toUpperCase() : format));
      return;
    }
    node.appendChild(el('span', 'bo', match[1].replace(/\s+/g, '').toUpperCase()));
    node.appendChild(el('span', 'rest', match[2]));
  }

  // ---------- partners ----------

  function visiblePartners(list) {
    return (Array.isArray(list) ? list : []).filter((p) => p && p.show !== false && (text(p.name) || p.logo));
  }

  function partnerTile() {
    const tile = el('span', 'partner-tile');
    tile.appendChild($('gamepadIcon').content.cloneNode(true));
    return tile;
  }

  function partnerItem(partner) {
    const item = el('div', 'partner');
    const name = text(partner.name);
    if (partner.logo) {
      const img = el('img', 'partner-logo');
      img.alt = name || 'Partner logo';
      img.draggable = false;
      img.addEventListener('error', () => {
        img.replaceWith(partnerTile());
        item.classList.add('no-logo');
        fitPartners();
      }, { once: true });
      img.src = `assets/partners/${encodeURIComponent(partner.logo)}`;
      item.appendChild(img);
    } else {
      item.appendChild(partnerTile());
      item.classList.add('no-logo');
    }
    if (name) {
      const label = el('div', 'partner-name');
      for (const line of splitName(name, 12)) label.appendChild(el('span', '', line));
      item.appendChild(label);
    }
    return item;
  }

  function partnerPage(list) {
    const page = el('div', 'partners-page');
    list.forEach((partner, i) => {
      if (i) page.appendChild(el('span', 'partner-sep'));
      page.appendChild(partnerItem(partner));
    });
    return page;
  }

  // Shrinks the names on a page until it fits. False if it doesn't fit even at the smallest size.
  function fitPage(page) {
    let size = 12.5;
    page.style.setProperty('--pn', `${size}px`);
    while (size > 10 && page.scrollWidth > page.clientWidth) {
      size -= 0.5;
      page.style.setProperty('--pn', `${size}px`);
    }
    return page.scrollWidth <= page.clientWidth;
  }

  function fitPartners() {
    Array.prototype.forEach.call($('partnersRow').children, fitPage);
  }

  // All partners on one page when they fit; otherwise pages of two that take turns
  function buildPartners(list) {
    const row = $('partnersRow');
    clearInterval(partnerTimer);
    row.textContent = '';
    if (!list.length) return;
    row.appendChild(partnerPage(list));
    if (list.length > 2 && !fitPage(row.firstChild)) {
      row.textContent = '';
      for (let i = 0; i < list.length; i += 2) row.appendChild(partnerPage(list.slice(i, i + 2)));
    }
    row.firstChild.classList.add('on');
    if (row.children.length < 2) return;
    let current = 0;
    partnerTimer = setInterval(() => {
      const pages = row.children;
      const next = (current + 1) % pages.length;
      Array.prototype.forEach.call(pages, (page) => page.classList.remove('out'));
      pages[current].classList.remove('on');
      pages[current].classList.add('out');
      pages[next].classList.add('on');
      current = next;
    }, PARTNER_PAGE_MS);
  }

  function renderPartners(s) {
    const list = visiblePartners(s.partners);
    const label = text(s.partnersLabel);
    $('partnersLabel').textContent = label;
    $('partners').classList.toggle('no-label', !label);
    const key = JSON.stringify(list.map((p) => [text(p.name), p.logo || '']));
    if (key !== partnersKey) {
      partnersKey = key;
      buildPartners(list);
    }
    fitPartners();
    return list.length;
  }

  // ---------- look ----------

  function applyLook(s) {
    const cal = s.calibration || {};
    const pick = (key) => clamp(Math.round(num(cal[key], DEFAULTS.calibration[key])), LIMITS[key][0], LIMITS[key][1]);
    const center = pick('center');
    const width = pick('width');
    const height = pick('height');
    const offsetY = pick('offsetY');
    const half = Math.round(width / 2);
    const style = stage.style;
    style.setProperty('--c', `${center}px`);
    style.setProperty('--l', `${center - half}px`);
    style.setProperty('--r', `${center + half}px`);
    style.setProperty('--h', `${height}px`);
    style.setProperty('--oy', `${offsetY}px`);
    style.setProperty('--glass', String(clamp(num(s.glass, 60), 0, 100) / 100));
    stage.classList.toggle('no-sheen', s.sheen === false);
    stage.classList.toggle('guides-on', s.showGuides === true);
    $('guideLabel').textContent = `MLBB SCOREBOARD · CENTER ${center} · WIDTH ${width} · HEIGHT ${height} · Y ${offsetY}`;
  }

  // ---------- render ----------

  function withDefaults(raw) {
    const s = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    s.calibration = Object.assign({}, DEFAULTS.calibration, s.calibration && typeof s.calibration === 'object' ? s.calibration : {});
    if (!Array.isArray(s.partners)) s.partners = DEFAULTS.partners;
    for (const key of ['blueTeam', 'redTeam']) s[key] = text(String(s[key] || DEFAULTS[key])).toUpperCase();
    return s;
  }

  function render(raw) {
    const s = withDefaults(raw);
    applyLook(s);

    renderTeam('blue', s.blueTeam);
    renderTeam('red', s.redTeam);

    const score = series(s);
    renderPips(sides.blue.pips, score.winsNeeded, score.b);
    renderPips(sides.red.pips, score.winsNeeded, score.r);
    show(sides.blue.pipsSlot, s.showScore);
    show(sides.red.pipsSlot, s.showScore);

    $('gameText').textContent = `GAME ${score.game}`;
    $('chip').classList.toggle('decided', score.decided);
    show($('chipSlot'), s.showScore);
    $('chipSlot').classList.toggle('lift', !s.showEmblem);

    show($('emblemSlot'), s.showEmblem);

    const subtitle = text(s.tournamentSubtitle);
    $('eventSubtitle').textContent = subtitle;
    fit($('eventSubtitle'), 10, 8, 0.25);
    renderTitle($('eventTitle'), text(s.tournamentTitle));
    show($('eventSlot'), s.showEvent);

    const format = text(s.format);
    setFormat($('formatText'), format);
    fit($('formatText'), 23, 14, 0.5, [$('formatText'), ...$('formatText').children]);
    const formatShown = s.showEvent && format !== '';
    show($('formatSlot'), formatShown);

    const partnerCount = renderPartners(s);
    let partnersShift = 0;
    if (!s.showEvent) partnersShift = -146;
    else if (!formatShown) partnersShift = -42;
    $('partnersSlot').style.setProperty('--shift-y', `${partnersShift}px`);
    show($('partnersSlot'), s.showPartners && partnerCount > 0);

    if (!booted) {
      booted = true;
      // reveal on the next frames so the entrance animations start from a settled layout
      requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('booting')));
    }
  }

  // ---------- live data ----------

  function accept(next) {
    if (!next || typeof next !== 'object') return;
    // the first fetch and the live stream can arrive in either order: keep the newest
    if (latest && latest.updatedAt && next.updatedAt && next.updatedAt < latest.updatedAt) return;
    latest = next;
    render(next);
  }

  function connect() {
    fetch('/api/state', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then(accept)
      .catch(() => {});
    if (!window.EventSource) return;
    const events = new EventSource('/api/events');
    events.addEventListener('state', (event) => {
      try {
        accept(JSON.parse(event.data));
      } catch (err) {
        console.warn('Bad state from server', err);
      }
    });
  }

  // Lets the control panel's preview switch the URL modes without reloading
  window.overlay = {
    setMode(name, on) {
      if (!MODES.includes(name)) return false;
      document.documentElement.classList.toggle(`m-${name}`, Boolean(on));
      return true;
    },
    get state() {
      return latest;
    },
  };

  async function start() {
    fitStage();
    window.addEventListener('resize', fitStage);
    await Promise.all([loadFonts(), loadTeams()]);
    connect();
    // no server (or no answer yet): draw the defaults so the overlay is never blank
    setTimeout(() => {
      if (!booted) render(DEFAULTS);
    }, 2500);
    // re-measure text once every font has finished loading
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!booted) return;
        partnersKey = null; // rebuild, so the one-page-or-pages choice is measured again
        render(latest || DEFAULTS);
      });
    }
  }

  start();
})();
