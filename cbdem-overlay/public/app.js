/* CBDEM Dagyawan 2026 · Mobile Legends: Bang Bang — overlay control panel.
   Edits the overlay state on the server, follows live changes over Server-Sent Events
   and shows the real overlay in a preview frame. Also works as an OBS custom dock (Chromium 103). */
(() => {
  'use strict';

  const STAGES = ['GROUP STAGE', 'QUARTERFINALS', 'SEMIFINALS', 'UPPER BRACKET FINALS', 'LOWER BRACKET FINALS', 'GRAND FINALS'];
  const LABELS = ['IN PARTNERSHIP WITH', 'SPONSORED BY', 'POWERED BY', 'SUPPORTED BY', 'PRESENTED BY'];
  const TEXT_KEYS = ['format', 'tournamentTitle', 'tournamentSubtitle', 'partnersLabel'];
  const CAL_KEYS = ['center', 'width', 'height', 'offsetY'];
  const MODES = ['preview', 'blur', 'mask'];
  const SIDES = ['blue', 'red'];
  const TEAM_KEY = { blue: 'blueTeam', red: 'redTeam' };
  const SCORE_KEY = { blue: 'blueScore', red: 'redScore' };
  const OTHER = { blue: 'red', red: 'blue' };
  const BO_RE = /BO\s*(\d+)/i;
  const PREF_KEY = 'cbdem-overlay-panel:view';
  const LOGO_SIDE = 512;      // uploaded logos are trimmed, then scaled to fit this square
  const SAVE_DELAY = 600;     // typing: save this long after the last key press
  const LIVE_STEP = 80;       // sliders: save at most this often while dragging
  const CROWDED_WIDTH = 990;  // from this scoreboard width on, the event card gets crowded
  const CONN_TEXT = { connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' };
  const COPY_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const num = (value, fallback) => {
    const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const tidy = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isLoopback = (host) => host === 'localhost' || host === '[::1]' || /^127\./.test(host);

  // ---------- state ----------

  let config = null;            // defaults and limits from /api/config
  let teams = [];               // [{ id, name }] from teams.json
  const teamById = {};
  let server = null;            // the latest state from the server
  const local = {};             // edits the server has not confirmed yet
  const dirty = new Map();      // key -> number of its latest local edit
  let editNo = 0;
  let sending = false;
  let again = false;            // a save was asked for while another was on its way
  let saveError = '';
  let retryTimer = 0;
  let typingTimer = 0;
  let sliderTimer = 0;
  let sliderPending = false;
  let bootError = '';
  let bootTries = 0;
  let uploadingIndex = null;    // partner row whose logo is uploading
  let pendingUploadIndex = null; // partner row that opened the file picker
  let lastPartnerCount = -1;
  let hadState = false;
  let conn = 'connecting';
  let source = null;
  let offlineTimer = 0;
  let dropRow = null;
  const prefs = loadPrefs();

  // What the panel shows: the server's state with our unsaved edits on top
  function view() {
    return server ? Object.assign({}, server, local) : null;
  }

  // Same rules as the overlay
  function series(s) {
    const match = BO_RE.exec(s.format || '');
    const bestOf = clamp(match ? parseInt(match[1], 10) : 3, 1, 7);
    const winsNeeded = clamp(Math.floor(bestOf / 2) + 1, 1, 4);
    const b = clamp(Math.round(num(s.blueScore, 0)), 0, 4);
    const r = clamp(Math.round(num(s.redScore, 0)), 0, 4);
    const decided = b >= winsNeeded || r >= winsNeeded;
    const game = decided ? Math.max(1, b + r) : Math.min(b + r + 1, bestOf);
    return { bestOf, winsNeeded, b, r, decided, game };
  }

  function maxText() {
    return config ? config.maxText : 60;
  }

  // ---------- small DOM helpers ----------

  function setText(el, value) {
    if (el.textContent !== value) el.textContent = value;
  }

  // Never overwrites a field that has focus, so typing is never interrupted
  function setValue(el, value) {
    const next = String(value);
    if (document.activeElement !== el && el.value !== next) el.value = next;
  }

  function setPressed(el, on) {
    const next = on ? 'true' : 'false';
    if (el.getAttribute('aria-pressed') !== next) el.setAttribute('aria-pressed', next);
  }

  function setChecked(el, on) {
    if (el.checked !== on) el.checked = on;
  }

  function setDisabled(el, off) {
    if (off && el.dataset.confirm === 'armed') disarm(el);
    if (el.disabled !== off) el.disabled = off;
  }

  function setHidden(el, hidden) {
    if (el.hidden !== hidden) el.hidden = hidden;
  }

  function setLabel(el, label) {
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
  }

  // Gold fill of a slider up to its value
  function paintRange(el) {
    const min = num(el.min, 0);
    const max = num(el.max, 100);
    const p = max > min ? ((num(el.value, min) - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--p', `${clamp(p, 0, 100)}%`);
  }

  function updateCount(input, counter) {
    const max = input.maxLength > 0 ? input.maxLength : 0;
    const length = input.value.length;
    setText(counter, max ? `${length}/${max}` : String(length));
    counter.classList.toggle('near', max > 0 && length >= max * 0.9);
  }

  function selectText(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Team logo with the same fallback as the overlay: transparent version first, then the original
  function setTeamLogo(img, id) {
    if (img.dataset.team === id) return;
    img.dataset.team = id;
    const sources = [`assets/logos-transparent/${encodeURIComponent(id)}.png`, `assets/logos/${encodeURIComponent(id)}.png`];
    let attempt = 0;
    img.style.visibility = '';
    img.onerror = () => {
      if (img.dataset.team !== id) return;
      attempt += 1;
      if (attempt < sources.length) img.src = sources[attempt];
      else img.style.visibility = 'hidden';
    };
    img.src = sources[0];
  }

  // ---------- talking to the server ----------

  async function api(url, body) {
    const options = { cache: 'no-store' };
    if (body !== undefined) {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error('Server is not reachable. Is npm start still running?');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed (${res.status}).`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  // Newest state wins; `force` takes it even if it looks older (after a reconnect)
  function accept(next, force) {
    if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
    if (!force && server && server.updatedAt && next.updatedAt && next.updatedAt < server.updatedAt) return false;
    server = next;
    render();
    return true;
  }

  function refetch() {
    api('api/state').then((next) => accept(next, true)).catch(() => {});
  }

  // Records a local change. Nothing is sent until pump() runs.
  function edit(key, value) {
    if (!dirty.has(key) && server && same(server[key], value)) return false;
    local[key] = value;
    editNo += 1;
    dirty.set(key, editNo);
    return true;
  }

  // Change one key, or several at once, and save right away
  function commit(patch, value) {
    const changes = typeof patch === 'string' ? { [patch]: value } : patch;
    let changed = false;
    for (const key of Object.keys(changes)) changed = edit(key, changes[key]) || changed;
    render();
    if (changed) pump();
  }

  // Drops local edits the server has now confirmed
  function settle(sentNo) {
    for (const [key, no] of Array.from(dirty)) {
      if (no <= sentNo) {
        dirty.delete(key);
        delete local[key];
      }
    }
  }

  // Sends every pending edit in one request; one request at a time
  async function pump() {
    if (!server || !dirty.size) return;
    if (sending) {
      again = true;
      return;
    }
    clearTimeout(retryTimer);
    sending = true;
    again = false;
    const sentNo = editNo;
    const patch = {};
    for (const key of dirty.keys()) patch[key] = local[key];
    renderSaveState();
    try {
      const next = await api('api/state', patch);
      saveError = '';
      settle(sentNo);
      accept(next);
    } catch (err) {
      saveError = err.message || 'Could not save.';
      if (err.status) {
        // The server turned the change down, so sending it again would fail the same way
        settle(sentNo);
        toast(saveError, 'error');
        refetch();
      } else {
        toast(`${saveError} Your changes are kept and will be sent when it is back.`, 'error');
        retryTimer = setTimeout(pump, 3000);
      }
    } finally {
      sending = false;
      render();
      if (again && !saveError) pump();
    }
  }

  // Typing: save after a short pause
  function saveSoon() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingTimer = 0;
      pump();
    }, SAVE_DELAY);
  }

  // Dragging a slider: save now, then at most every LIVE_STEP ms
  function saveLive() {
    if (sliderTimer) {
      sliderPending = true;
      return;
    }
    pump();
    const tick = () => {
      if (!sliderPending) {
        sliderTimer = 0;
        return;
      }
      sliderPending = false;
      pump();
      sliderTimer = setTimeout(tick, LIVE_STEP);
    };
    sliderTimer = setTimeout(tick, LIVE_STEP);
  }

  function flush() {
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = 0;
    }
    pump();
  }

  // ---------- live updates ----------

  function setConn(state) {
    conn = state;
    if (state === 'live') clearTimeout(offlineTimer);
    const pill = $('connPill');
    pill.dataset.state = state;
    setText($('connText'), CONN_TEXT[state]);
    pill.title = state === 'live' ? 'Connected. Changes reach the overlay right away.' : 'Not connected to the overlay server.';
  }

  function connect() {
    if (!window.EventSource) {
      setConn('offline');
      return;
    }
    if (source) source.close();
    let fresh = true; // the first state after each (re)connect replaces ours, even if it looks older
    const events = new EventSource('api/events');
    source = events;
    events.addEventListener('state', (event) => {
      let next;
      try {
        next = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      accept(next, fresh);
      fresh = false;
      hadState = true;
      setConn('live');
      if (dirty.size && saveError) pump();
    });
    events.onerror = () => {
      if (source !== events) return;
      fresh = true;
      setConn(hadState ? 'reconnecting' : 'connecting');
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        if (conn !== 'live') setConn('offline');
      }, 5000);
      // the browser retries by itself unless the connection was closed for good
      if (events.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
    };
  }

  // ---------- toasts ----------

  const toastTimers = new WeakMap();

  function dismiss(node) {
    clearTimeout(toastTimers.get(node));
    node.classList.add('out');
    setTimeout(() => node.remove(), 250);
  }

  function toast(message, type, ms) {
    const box = $('toasts');
    const duration = ms || (type === 'error' ? 5000 : 2600);
    for (const node of Array.from(box.children)) {
      if (node.textContent === message && !node.classList.contains('out')) {
        clearTimeout(toastTimers.get(node));
        toastTimers.set(node, setTimeout(() => dismiss(node), duration));
        return;
      }
    }
    const node = document.createElement('div');
    node.className = type === 'error' ? 'toast toast-error' : 'toast';
    node.textContent = message;
    node.title = 'Click to close';
    node.addEventListener('click', () => dismiss(node));
    box.appendChild(node);
    while (box.children.length > 3) box.firstElementChild.remove();
    toastTimers.set(node, setTimeout(() => dismiss(node), duration));
  }

  // ---------- confirm-by-clicking-twice ----------

  const confirmTimers = new WeakMap();

  // First click arms the button, a second click within a few seconds confirms
  function confirmClick(button) {
    if (button.dataset.confirm === 'armed') {
      disarm(button);
      return true;
    }
    disarmAll();
    const lbl = button.querySelector('.lbl');
    const text = button.dataset.confirmText || 'Sure?';
    button.dataset.confirm = 'armed';
    button.dataset.wasLabel = lbl ? lbl.textContent : '';
    button.dataset.wasAria = button.getAttribute('aria-label') || '';
    if (lbl) lbl.textContent = text;
    button.setAttribute('aria-label', `${text} Click again to confirm.`);
    confirmTimers.set(button, setTimeout(() => disarm(button), 2600));
    return false;
  }

  function disarm(button) {
    if (button.dataset.confirm !== 'armed') return;
    clearTimeout(confirmTimers.get(button));
    const lbl = button.querySelector('.lbl');
    if (lbl) lbl.textContent = button.dataset.wasLabel || '';
    if (button.dataset.wasAria) button.setAttribute('aria-label', button.dataset.wasAria);
    else button.removeAttribute('aria-label');
    delete button.dataset.confirm;
    delete button.dataset.wasLabel;
    delete button.dataset.wasAria;
  }

  function disarmAll() {
    document.querySelectorAll('[data-confirm="armed"]').forEach(disarm);
  }

  // ---------- copying the OBS address ----------

  async function copyText(text) {
    // the Clipboard API only exists on https or localhost; LAN addresses use the old way
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // fall back below
      }
    }
    const active = document.activeElement;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    area.remove();
    if (active && typeof active.focus === 'function') active.focus();
    return ok;
  }

  async function copyUrl(url, codeNode) {
    if (await copyText(url)) {
      toast(`Copied: ${url}`);
    } else {
      toast(`Copy this into OBS: ${url}`, 'info', 8000);
      if (codeNode) selectText(codeNode);
    }
  }

  // Overlay addresses for OBS. The one matching how this page was opened comes first.
  function obsTargets() {
    const port = location.port ? `:${location.port}` : '';
    const here = { label: 'OBS on the computer running the server', url: `${location.protocol}//localhost${port}/overlay.html` };
    const seen = new Set([here.url]);
    const lan = [];
    const origins = config && Array.isArray(config.lanOrigins) ? config.lanOrigins.slice() : [];
    if (!isLoopback(location.hostname)) origins.unshift(location.origin);
    for (const origin of origins) {
      const url = `${origin}/overlay.html`;
      if (seen.has(url)) continue;
      seen.add(url);
      lan.push({ label: 'OBS on another computer on the network', url });
    }
    return isLoopback(location.hostname) ? [here].concat(lan) : lan.concat([here]);
  }

  function buildObsUrls() {
    const box = $('obsUrls');
    box.textContent = '';
    obsTargets().forEach((target, i) => {
      const row = document.createElement('div');
      row.className = i === 0 ? 'obs-url primary' : 'obs-url';
      const label = document.createElement('span');
      label.className = 'u-label';
      label.textContent = target.label;
      const code = document.createElement('code');
      code.textContent = target.url;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-mini';
      button.dataset.action = 'copy';
      button.dataset.url = target.url;
      button.setAttribute('aria-label', `Copy ${target.url}`);
      button.innerHTML = `${COPY_ICON}<span class="lbl">Copy</span>`;
      row.append(label, code, button);
      box.appendChild(row);
    });
  }

  // ---------- preview frame ----------

  function loadPrefs() {
    const saved = { preview: true, blur: false, mask: false };
    try {
      const stored = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      for (const key of MODES) if (typeof stored[key] === 'boolean') saved[key] = stored[key];
    } catch (err) {
      // storage blocked (private window): use the defaults
    }
    return saved;
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (err) {
      // not saved; the view still works for this visit
    }
  }

  // Mask view replaces the game frame, and the real blur only shows over the game frame
  function effectiveModes() {
    return {
      preview: prefs.preview && !prefs.mask,
      blur: prefs.blur && prefs.preview && !prefs.mask,
      mask: prefs.mask,
    };
  }

  function previewQuery() {
    const on = effectiveModes();
    const query = MODES.filter((mode) => on[mode]).map((mode) => `${mode}=1`);
    return query.length ? `?${query.join('&')}` : '';
  }

  // Switches the overlay's view classes without reloading it
  function applyModes() {
    try {
      const frame = $('preview').contentWindow;
      const overlay = frame && frame.overlay;
      if (!overlay || typeof overlay.setMode !== 'function') return false;
      const on = effectiveModes();
      for (const mode of MODES) overlay.setMode(mode, on[mode]);
      return true;
    } catch (err) {
      return false;
    }
  }

  function toggleMode(mode) {
    if (!MODES.includes(mode)) return;
    prefs[mode] = !prefs[mode];
    savePrefs();
    renderModes();
    if (!applyModes()) $('preview').src = `overlay.html${previewQuery()}`;
  }

  // ---------- match ----------

  function step(side, delta, button) {
    const s = view();
    const info = series(s);
    const mine = side === 'blue' ? info.b : info.r;
    const theirs = side === 'blue' ? info.r : info.b;
    // once one side has won, the other can still have won games, but not the series
    const cap = theirs >= info.winsNeeded ? info.winsNeeded - 1 : info.winsNeeded;
    const next = delta > 0 ? Math.min(mine + 1, cap) : Math.max(mine - 1, 0);
    if (delta > 0 ? next <= mine : next >= mine) return;
    commit(SCORE_KEY[side], next);
    const after = series(Object.assign({}, s, { [SCORE_KEY[side]]: next }));
    if (after.decided && !info.decided) {
      const winner = after.b >= after.winsNeeded ? s.blueTeam : s.redTeam;
      toast(`${winner} wins the series ${Math.max(after.b, after.r)}–${Math.min(after.b, after.r)}.`);
    }
    // a button that just became disabled loses keyboard focus: hand it to its partner
    if (button && button.disabled) {
      const partner = button.parentElement.querySelector(`.step[data-delta="${-delta}"]`);
      if (partner && !partner.disabled) partner.focus();
    }
  }

  function resetScores() {
    commit({ blueScore: 0, redScore: 0 });
    toast('Scores reset to 0–0.');
  }

  function swapSides() {
    const s = view();
    commit({ blueTeam: s.redTeam, redTeam: s.blueTeam, blueScore: s.redScore, redScore: s.blueScore });
    toast(`Sides swapped: ${s.redTeam} is now on blue side.`);
  }

  function pickTeam(side, id) {
    const s = view();
    if (!id || s[TEAM_KEY[side]] === id) return;
    if (s[TEAM_KEY[OTHER[side]]] === id) {
      swapSides();
      return;
    }
    commit(TEAM_KEY[side], id);
    if (s.blueScore || s.redScore) {
      toast(`${id} is now on ${side} side. The score is still ${s.blueScore}–${s.redScore}; use Reset scores for a new match.`, 'info', 5000);
    }
  }

  // "BO3 GRAND FINALS" -> { bo: 'BO3', rest: 'GRAND FINALS' }
  function splitFormat(format) {
    const text = tidy(format);
    const match = BO_RE.exec(text);
    if (!match) return { bo: '', rest: text };
    const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
      .replace(/^[\s\-·:|]+|[\s\-·:|]+$/g, '')
      .replace(/\s+/g, ' ');
    return { bo: match[0].replace(/\s+/g, '').toUpperCase(), rest };
  }

  function setBestOf(n) {
    const s = view();
    const text = tidy(s.format);
    const format = (BO_RE.test(text) ? text.replace(BO_RE, `BO${n}`) : tidy(`BO${n} ${text}`)).slice(0, maxText());
    const wins = Math.floor(n / 2) + 1;
    const oldB = clamp(Math.round(num(s.blueScore, 0)), 0, 4);
    const oldR = clamp(Math.round(num(s.redScore, 0)), 0, 4);
    let b = Math.min(oldB, wins);
    let r = Math.min(oldR, wins);
    // both sides can't have won: the leader keeps the win
    if (b === wins && r === wins) {
      if (oldB > oldR) r = wins - 1;
      else if (oldR > oldB) b = wins - 1;
      else {
        b = wins - 1;
        r = wins - 1;
      }
    }
    const patch = { format };
    if (b !== oldB) patch.blueScore = b;
    if (r !== oldR) patch.redScore = r;
    commit(patch);
    if (b !== oldB || r !== oldR) toast(`BO${n}: score changed to ${b}–${r} to fit.`);
  }

  // Clicking the active stage again removes it
  function setStage(stage) {
    const s = view();
    const parts = splitFormat(s.format);
    const rest = parts.rest.toUpperCase() === stage ? '' : stage;
    commit('format', tidy(`${parts.bo} ${rest}`).slice(0, maxText()));
  }

  // ---------- partners ----------

  function partnersCopy() {
    const list = view().partners;
    return (Array.isArray(list) ? list : []).map((p) => ({ name: p.name || '', logo: p.logo || '', show: p.show !== false }));
  }

  function rowIndex(el) {
    const row = el.closest('.p-row');
    return row ? Number(row.dataset.index) : -1;
  }

  function addPartner() {
    const list = partnersCopy();
    if (list.length >= config.maxPartners) return;
    list.push({ name: '', logo: '', show: true });
    disarmAll();
    commit('partners', list);
    const row = $('partnerList').children[list.length - 1];
    if (row) row.querySelector('.p-name').focus();
  }

  function rowAction(act, button) {
    const i = rowIndex(button);
    const list = partnersCopy();
    if (!list[i]) return;
    if (act === 'upload') {
      startUpload(i);
    } else if (act === 'clear') {
      list[i].logo = '';
      commit('partners', list);
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      const moved = list[i];
      list[i] = list[j];
      list[j] = moved;
      disarmAll();
      commit('partners', list);
      // keep the focus on the moved partner's arrow
      const row = $('partnerList').children[j];
      if (row) {
        const sameArrow = row.querySelector(`[data-act="${act}"]`);
        const otherArrow = row.querySelector(`[data-act="${act === 'up' ? 'down' : 'up'}"]`);
        (sameArrow.disabled ? otherArrow : sameArrow).focus();
      }
    } else if (act === 'remove') {
      if (!confirmClick(button)) return;
      const name = tidy(list[i].name);
      list.splice(i, 1);
      commit('partners', list);
      if (!document.activeElement || document.activeElement === document.body) $('addPartner').focus();
      toast(name ? `${name} removed.` : 'Partner removed.');
    }
  }

  function makeRow() {
    return $('partnerRowTpl').content.firstElementChild.cloneNode(true);
  }

  function setThumb(thumb, logo, label) {
    const img = thumb.querySelector('img');
    img.alt = `${label} logo`;
    if (thumb.dataset.logo === logo) return;
    thumb.dataset.logo = logo;
    thumb.classList.remove('has-logo');
    thumb.removeAttribute('title');
    if (!logo) {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      return;
    }
    img.onload = () => {
      if (thumb.dataset.logo === logo) thumb.classList.add('has-logo');
    };
    img.onerror = () => {
      if (thumb.dataset.logo !== logo) return;
      thumb.classList.remove('has-logo');
      thumb.title = 'Logo file not found';
    };
    img.src = `assets/partners/${encodeURIComponent(logo)}`;
    if (img.complete && img.naturalWidth) thumb.classList.add('has-logo');
  }

  function renderRow(row, partner, i, count) {
    const label = tidy(partner.name) || `partner ${i + 1}`;
    const busy = uploadingIndex !== null;
    row.dataset.index = String(i);
    row.classList.toggle('is-off', partner.show === false);
    row.classList.toggle('uploading', uploadingIndex === i);

    const name = row.querySelector('.p-name');
    name.maxLength = config.maxPartnerName;
    name.placeholder = `Partner ${i + 1} name`;
    setLabel(name, `Partner ${i + 1} name`);
    setValue(name, partner.name || '');

    const show = row.querySelector('.p-show');
    setChecked(show, partner.show !== false);
    setLabel(show, `Show ${label} on the overlay`);

    setThumb(row.querySelector('.p-thumb'), partner.logo || '', label);

    const upload = row.querySelector('[data-act="upload"]');
    setText(upload.querySelector('.lbl'), uploadingIndex === i ? 'Uploading…' : partner.logo ? 'Replace logo' : 'Upload logo');
    setLabel(upload, `${partner.logo ? 'Replace' : 'Upload'} logo for ${label}`);
    setDisabled(upload, busy);

    const clear = row.querySelector('[data-act="clear"]');
    setLabel(clear, `Clear logo for ${label}`);
    setDisabled(clear, busy || !partner.logo);

    const up = row.querySelector('[data-act="up"]');
    setLabel(up, `Move ${label} up`);
    setDisabled(up, busy || i === 0);

    const down = row.querySelector('[data-act="down"]');
    setLabel(down, `Move ${label} down`);
    setDisabled(down, busy || i === count - 1);

    const remove = row.querySelector('[data-act="remove"]');
    if (remove.dataset.confirm !== 'armed') setLabel(remove, `Remove ${label}`);
    setDisabled(remove, busy);
  }

  // ---------- partner logo upload ----------

  function startUpload(index) {
    if (uploadingIndex !== null) return;
    pendingUploadIndex = index;
    const input = $('logoFile');
    input.value = '';
    input.click();
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This image could not be opened. Try a PNG or JPG.'));
      };
      img.src = url;
    });
  }

  // Smallest box around the pixels that are not (almost) transparent
  function alphaBox(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h).data;
    let left = w;
    let top = h;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < h; y += 1) {
      const row = y * w * 4;
      for (let x = 0; x < w; x += 1) {
        if (data[row + x * 4 + 3] >= 8) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          bottom = y;
        }
      }
    }
    return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  // Trims the empty border and scales the logo down to LOGO_SIDE, as a PNG data URL
  async function prepareLogo(file) {
    const img = await loadImage(file);
    const naturalW = img.naturalWidth || LOGO_SIDE;
    const naturalH = img.naturalHeight || LOGO_SIDE;
    const scale = Math.min(1, 2048 / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const box = alphaBox(ctx, w, h);
    if (!box) throw new Error('This image is completely transparent.');
    const fit = Math.min(1, LOGO_SIDE / Math.max(box.w, box.h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(box.w * fit));
    out.height = Math.max(1, Math.round(box.h * fit));
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  async function uploadLogo(index, file) {
    if (uploadingIndex !== null || !server) return;
    if (!file || !/^image\//.test(file.type)) {
      toast('That file is not an image. Use a PNG, JPG or WebP logo.', 'error');
      return;
    }
    const partner = partnersCopy()[index];
    if (!partner) return;
    uploadingIndex = index;
    render();
    try {
      const data = await prepareLogo(file);
      if (config && data.length * 0.75 > config.maxLogoBytes) throw new Error('Logo is larger than 4 MB.');
      const name = tidy(partner.name) || file.name.replace(/\.[^.]+$/, '');
      const result = await api('api/partner-logo', { name, data });
      const list = partnersCopy();
      if (!list[index]) throw new Error('That partner was removed before the logo finished uploading.');
      list[index].logo = result.logo;
      commit('partners', list);
      toast(`Logo saved for ${tidy(list[index].name) || `partner ${index + 1}`}.`);
    } catch (err) {
      toast(err.message || 'Could not upload the logo.', 'error');
    } finally {
      uploadingIndex = null;
      render();
    }
  }

  function markDrop(row) {
    if (dropRow === row) return;
    if (dropRow) dropRow.classList.remove('drop');
    dropRow = row;
    if (row) row.classList.add('drop');
  }

  function draggingFiles(event) {
    const types = event.dataTransfer && event.dataTransfer.types;
    return Boolean(types) && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function dropTarget(event) {
    const row = event.target && event.target.closest ? event.target.closest('.p-row') : null;
    return row && server && uploadingIndex === null ? row : null;
  }

  // ---------- calibration ----------

  function calibration(s) {
    return Object.assign({}, config.defaults.calibration, s.calibration || {});
  }

  // `done` is false while typing or dragging, true when the value is committed
  function calInput(el, done) {
    const key = el.dataset.cal;
    const limits = config.calibrationLimits[key];
    if (!limits) return;
    const cal = calibration(view());
    const raw = el.value.trim() === '' ? NaN : Number(el.value);
    if (!done) {
      // half-typed numbers ("9" on the way to "950") are ignored until they are in range
      if (!Number.isFinite(raw) || raw < limits[0] || raw > limits[1]) return;
      if (edit('calibration', Object.assign({}, cal, { [key]: Math.round(raw) }))) {
        render();
        saveLive();
      }
      return;
    }
    const value = Number.isFinite(raw) ? clamp(Math.round(raw), limits[0], limits[1]) : cal[key];
    el.value = String(value);
    commit('calibration', Object.assign({}, cal, { [key]: value }));
  }

  function resetCalibration() {
    commit('calibration', Object.assign({}, config.defaults.calibration));
    toast('Calibration reset to the defaults.');
  }

  // ---------- render ----------

  function render() {
    renderModes();
    renderSaveState();
    if (!server || !config) return;
    const s = view();
    renderMatch(s);
    renderEvent(s);
    renderPartners(s);
    renderDisplay(s);
    renderCalibration(s);
    renderPreviewTools(s);
  }

  function renderPips(container, count, wins) {
    if (container.children.length !== count) {
      container.textContent = '';
      for (let i = 0; i < count; i += 1) container.appendChild(document.createElement('i'));
    }
    Array.prototype.forEach.call(container.children, (pip, i) => pip.classList.toggle('on', i < wins));
  }

  function renderMatch(s) {
    const info = series(s);
    const won = { blue: info.b >= info.winsNeeded, red: info.r >= info.winsNeeded };

    for (const side of SIDES) {
      const id = s[TEAM_KEY[side]];
      const otherId = s[TEAM_KEY[OTHER[side]]];
      const team = teamById[id];
      const score = side === 'blue' ? info.b : info.r;
      const theirs = side === 'blue' ? info.r : info.b;
      const cap = theirs >= info.winsNeeded ? info.winsNeeded - 1 : info.winsNeeded;

      setTeamLogo($(`logo-${side}`), id);
      setText($(`acro-${side}`), id || '–');
      setText($(`name-${side}`), team ? team.name : '');
      setText($(`score-${side}`), String(score));
      $(`side-${side}`).classList.toggle('won', won[side]);
      renderPips($(`pips-${side}`), info.winsNeeded, score);

      const box = $(`side-${side}`);
      setDisabled(box.querySelector('.step[data-delta="-1"]'), score <= 0);
      setDisabled(box.querySelector('.step[data-delta="1"]'), score >= cap);

      for (const tile of Array.from($(`pick-${side}`).children)) {
        const tileId = tile.dataset.team;
        const isOther = tileId === otherId;
        setPressed(tile, tileId === id);
        tile.classList.toggle('other', isOther);
        const name = teamById[tileId] ? teamById[tileId].name : tileId;
        tile.title = isOther ? `${tileId} is on ${OTHER[side]} side. Pick it to swap sides.` : name;
      }
    }

    const bar = $('seriesBar');
    bar.classList.toggle('decided', info.decided);
    if (info.decided) {
      const winner = won.blue ? s.blueTeam : s.redTeam;
      setText($('seriesMain'), `${winner} WINS`);
      setText($('seriesSub'), `${Math.max(info.b, info.r)}–${Math.min(info.b, info.r)} · BEST OF ${info.bestOf}`);
    } else {
      setText($('seriesMain'), `GAME ${info.game}`);
      setText($('seriesSub'), `BEST OF ${info.bestOf} · FIRST TO ${info.winsNeeded} ${info.winsNeeded === 1 ? 'WIN' : 'WINS'}`);
    }
    setDisabled(document.querySelector('[data-action="reset-scores"]'), info.b === 0 && info.r === 0);

    document.querySelectorAll('[data-action="bo"]').forEach((button) => setPressed(button, Number(button.dataset.bo) === info.bestOf));
    const stage = splitFormat(s.format).rest.toUpperCase();
    for (const chip of Array.from($('stageChips').children)) setPressed(chip, chip.dataset.stage === stage);

    setValue($('format'), s.format || '');
    updateCount($('format'), $('count-format'));

    setHidden($('off-showScore'), s.showScore !== false);
    let note = '';
    if (s.showEvent === false) note = 'The format line is part of the event card, which is switched off in Display.';
    else if (!tidy(s.format)) note = 'The format line is empty, so it is hidden.';
    else if (!BO_RE.test(s.format)) note = 'No BO number in the format line, so the score counts it as BO3.';
    setText($('off-format'), note);
    setHidden($('off-format'), !note);
  }

  function renderEvent(s) {
    for (const key of ['tournamentTitle', 'tournamentSubtitle']) {
      setValue($(key), s[key] || '');
      updateCount($(key), $(`count-${key}`));
    }
    setHidden($('off-showEvent'), s.showEvent !== false);
  }

  function renderPartners(s) {
    const list = Array.isArray(s.partners) ? s.partners : [];
    const box = $('partnerList');
    if (list.length !== lastPartnerCount) {
      // rows are matched by position, so an armed "Remove?" could now point at another partner
      box.querySelectorAll('[data-confirm="armed"]').forEach(disarm);
      lastPartnerCount = list.length;
    }
    while (box.children.length > list.length) box.lastElementChild.remove();
    while (box.children.length < list.length) box.appendChild(makeRow());
    list.forEach((partner, i) => renderRow(box.children[i], partner, i, list.length));

    const showing = list.filter((p) => p && p.show !== false && (tidy(p.name) || p.logo)).length;
    setText($('partnerCount'), `${list.length}/${config.maxPartners}`);
    $('partnerCount').title = `${showing} showing on the overlay`;
    setDisabled($('addPartner'), list.length >= config.maxPartners || uploadingIndex !== null);

    setValue($('partnersLabel'), s.partnersLabel || '');
    updateCount($('partnersLabel'), $('count-partnersLabel'));
    const label = tidy(s.partnersLabel).toUpperCase();
    for (const chip of Array.from($('labelChips').children)) setPressed(chip, chip.dataset.label === label);

    setHidden($('off-showPartners'), s.showPartners !== false);
    setHidden($('off-partnersNone'), !(s.showPartners !== false && showing === 0));
  }

  function renderDisplay(s) {
    document.querySelectorAll('.switch input[data-key]').forEach((input) => setChecked(input, s[input.dataset.key] === true));
    $('guidesRow').classList.toggle('on', s.showGuides === true);
    const glass = clamp(Math.round(num(s.glass, 60)), 0, 100);
    setValue($('glass'), glass);
    paintRange($('glass'));
    setText($('glassOut'), `${glass}%`);
    $('glassSwatch').style.setProperty('--glass', String(glass / 100));
  }

  function renderCalibration(s) {
    const cal = calibration(s);
    const defaults = config.defaults.calibration;
    let changed = false;
    for (const key of CAL_KEYS) {
      const range = $(`cal-${key}`);
      setValue(range, cal[key]);
      paintRange(range);
      setValue($(`cal-${key}-num`), cal[key]);
      const diff = cal[key] - defaults[key];
      changed = changed || diff !== 0;
      $(`cal-${key}-row`).classList.toggle('changed', diff !== 0);
      let text = diff ? `Default ${defaults[key]} · ${diff > 0 ? '+' : '−'}${Math.abs(diff)}` : `Default ${defaults[key]}`;
      if (key === 'width' && cal.width >= CROWDED_WIDTH) text += ' · may crowd the event card';
      setText($(`cal-${key}-def`), text);
    }
    setDisabled(document.querySelector('[data-action="reset-calibration"]'), !changed);
  }

  function renderPreviewTools(s) {
    setPressed($('guidesChip'), s.showGuides === true);
    setHidden($('guidesBadge'), s.showGuides !== true);
  }

  function renderModes() {
    const on = effectiveModes();
    document.querySelectorAll('[data-action="mode"]').forEach((chip) => {
      const mode = chip.dataset.mode;
      const blocked = (mode === 'preview' && prefs.mask) || (mode === 'blur' && (prefs.mask || !prefs.preview));
      chip.disabled = blocked;
      setPressed(chip, on[mode]);
      if (mode === 'blur' && blocked) chip.title = 'Turn on Game frame (and turn off Mask view) to see the real blur.';
      else if (mode === 'preview' && blocked) chip.title = 'Mask view hides the game frame.';
      else chip.removeAttribute('title');
    });
  }

  function renderSaveState() {
    const el = $('saveState');
    let state = 'saved';
    let text = 'All changes saved';
    if (!server) {
      state = bootError ? 'error' : 'loading';
      text = bootError ? 'Server not reachable' : 'Loading…';
    } else if (saveError) {
      state = 'error';
      text = 'Not saved';
    } else if (sending || dirty.size) {
      state = 'saving';
      text = 'Saving…';
    }
    el.dataset.state = state;
    setText(el, text);
    el.title = (server ? saveError : bootError) || '';
  }

  // ---------- one-time setup once the server answers ----------

  function chip(action, value, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.action = action;
    button.dataset[action] = value;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = text;
    return button;
  }

  function build() {
    for (const side of SIDES) {
      const pick = $(`pick-${side}`);
      pick.textContent = '';
      for (const team of teams) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile';
        tile.dataset.action = 'pick';
        tile.dataset.side = side;
        tile.dataset.team = team.id;
        tile.setAttribute('aria-pressed', 'false');
        tile.setAttribute('aria-label', `${team.id}: ${team.name}`);
        const img = document.createElement('img');
        img.alt = '';
        img.width = 28;
        img.height = 28;
        img.draggable = false;
        setTeamLogo(img, team.id);
        const label = document.createElement('span');
        label.textContent = team.id;
        tile.append(img, label);
        pick.appendChild(tile);
      }
    }

    $('stageChips').textContent = '';
    for (const stage of STAGES) $('stageChips').appendChild(chip('stage', stage, stage));
    $('labelChips').textContent = '';
    for (const label of LABELS) $('labelChips').appendChild(chip('label', label, label));

    for (const key of TEXT_KEYS) $(key).maxLength = config.maxText;

    for (const key of CAL_KEYS) {
      const [min, max] = config.calibrationLimits[key];
      for (const input of [$(`cal-${key}`), $(`cal-${key}-num`)]) {
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
      }
    }

    buildObsUrls();
  }

  async function boot() {
    try {
      const [cfg, teamList, state] = await Promise.all([api('api/config'), api('teams.json'), api('api/state')]);
      config = cfg;
      teams = (Array.isArray(teamList) ? teamList : [])
        .filter((team) => team && team.id)
        .map((team) => ({ id: String(team.id).toUpperCase(), name: tidy(team.name) }));
      for (const team of teams) teamById[team.id] = team;
      bootError = '';
      build();
      accept(state, true);
      document.body.classList.remove('is-loading');
      $('app').inert = false;
      connect();
      if (bootTries) toast('Connected to the overlay server.');
    } catch (err) {
      bootTries += 1;
      bootError = err.message || 'Server not reachable.';
      setConn('offline');
      renderSaveState();
      if (bootTries === 1) toast(bootError, 'error', 6000);
      setTimeout(boot, 2000);
    }
  }

  // ---------- events ----------

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-act]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;

    // these work even before the server answers
    if (action === 'copy-url') {
      const first = obsTargets()[0];
      copyUrl(first.url, $('obsUrls').querySelector('code'));
      return;
    }
    if (action === 'copy') {
      copyUrl(target.dataset.url, target.parentElement.querySelector('code'));
      return;
    }
    if (action === 'mode') {
      toggleMode(target.dataset.mode);
      return;
    }

    if (!server || !config) return;
    switch (action) {
      case 'guides': commit('showGuides', view().showGuides !== true); return;
      case 'step': step(target.dataset.side, Number(target.dataset.delta), target); return;
      case 'pick': pickTeam(target.dataset.side, target.dataset.team); return;
      case 'swap': swapSides(); return;
      case 'reset-scores': if (confirmClick(target)) resetScores(); return;
      case 'bo': setBestOf(Number(target.dataset.bo)); return;
      case 'stage': setStage(target.dataset.stage); return;
      case 'label': commit('partnersLabel', target.dataset.label); return;
      case 'add-partner': addPartner(); return;
      case 'reset-calibration': if (confirmClick(target)) resetCalibration(); return;
      default: break;
    }
    if (target.dataset.act) rowAction(target.dataset.act, target);
  });

  document.addEventListener('input', (event) => {
    const el = event.target;
    if (!server || !config || !el.matches) return;
    if (el.matches('.p-name')) {
      const i = rowIndex(el);
      const list = partnersCopy();
      if (!list[i]) return;
      list[i].name = el.value;
      if (edit('partners', list)) render();
      saveSoon();
      return;
    }
    if (el.dataset.cal) {
      calInput(el, false);
      return;
    }
    const key = el.dataset.key;
    if (!key) return;
    if (el.type === 'range') {
      if (edit(key, Number(el.value))) render();
      paintRange(el);
      saveLive();
    } else if (el.type === 'text') {
      edit(key, el.value);
      render();
      saveSoon();
    }
  });

  document.addEventListener('change', (event) => {
    const el = event.target;
    if (!el.matches) return;
    if (!server || !config) {
      if (el.type === 'checkbox') el.checked = !el.checked; // nothing to save yet: undo the click
      return;
    }
    if (el.matches('.p-show')) {
      const i = rowIndex(el);
      const list = partnersCopy();
      if (!list[i]) return;
      list[i].show = el.checked;
      commit('partners', list);
      return;
    }
    if (el.matches('.p-name')) {
      flush();
      return;
    }
    if (el.dataset.cal) {
      calInput(el, true);
      return;
    }
    const key = el.dataset.key;
    if (!key) return;
    if (el.type === 'checkbox') {
      commit(key, el.checked);
    } else if (el.type === 'range') {
      edit(key, Number(el.value));
      flush();
    } else {
      flush();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') disarmAll();
    if (event.key !== 'Enter' || !event.target.matches || !event.target.matches('input[type="text"], input[type="number"]')) return;
    if (event.target.dataset.cal) calInput(event.target, true);
    else flush();
  });

  // Leaving a field saves it, then shows the server's cleaned-up value
  document.addEventListener('focusout', (event) => {
    if (!event.target.matches || !event.target.matches('input')) return;
    flush();
    setTimeout(render, 0);
  });

  $('logoFile').addEventListener('change', () => {
    const input = $('logoFile');
    const file = input.files && input.files[0];
    const index = pendingUploadIndex;
    pendingUploadIndex = null;
    if (file && index !== null) uploadLogo(index, file);
  });

  // Drop an image on a partner row to use it as the logo
  document.addEventListener('dragover', (event) => {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    const row = dropTarget(event);
    event.dataTransfer.dropEffect = row ? 'copy' : 'none';
    markDrop(row);
  });
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) markDrop(null);
  });
  document.addEventListener('drop', (event) => {
    if (!draggingFiles(event)) return;
    event.preventDefault(); // keeps the browser from opening the file
    const row = dropTarget(event);
    markDrop(null);
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (row && file) uploadLogo(Number(row.dataset.index), file);
  });
  document.addEventListener('dragend', () => markDrop(null));

  // Closing the tab mid-edit still sends the last change
  window.addEventListener('pagehide', () => {
    if (!dirty.size) return;
    const patch = {};
    for (const key of dirty.keys()) patch[key] = local[key];
    try {
      fetch('api/state', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      // the page is going away anyway
    }
  });

  // ---------- start ----------

  $('preview').addEventListener('load', applyModes);
  $('preview').src = `overlay.html${previewQuery()}`;
  $('app').inert = true;
  renderModes();
  buildObsUrls();
  renderSaveState();
  boot();
})();
