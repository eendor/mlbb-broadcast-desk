/* Post-Game Scoreboard Analyzer for Custom / In-Game Referee Lobbies
   Engines:
   1. Local Offline Tesseract OCR (scanSource) — the DEFAULT and realtime engine.
      Fast local pixel-calibrated recognition. No API key, no cloud latency, and
      the only engine that drives live broadcast synchronization.
   2. Google Gemini Vision (scanWithCloud) — OPTIONAL, MANUAL screenshots only.
      Reads heroes, skins, KDAs, gold, medals, MVP ribbon and resolves squad
      prefixes/clan tags against registered playoff rosters. Routed through the
      isolated /api/ai/analyze endpoint, which is decoupled from the live
      detection session so a cloud scan can never interrupt a live game. */
const PostgameOCR = (() => {
  const COORDS = {
    header: {
      resultStatus: { x: 725, y: 42, w: 475, h: 100 },
      gameTime: { x: 915, y: 7, w: 90, h: 42 },
      blueKills: { x: 840, y: 7, w: 60, h: 42 },
      redKills: { x: 1020, y: 7, w: 60, h: 42 }
    },
    row: (side, i) => {
      const y = 232 + i * 138;
      const red = side === 'red';
      return {
        hero: { x: red ? 1625 : 200, y: y - 4, w: 90, h: 90 },
        level: { x: red ? 1675 : 220, y: y + 73, w: 40, h: 26 },
        name: { x: red ? 1330 : 340, y, w: red ? 240 : 245, h: 34 },
        kda: { x: red ? 1175 : 590, y, w: 145, h: 34 },
        gold: { x: red ? 1080 : 745, y, w: red ? 85 : 90, h: 34 },
        medal: { x: red ? 985 : 835, y: y - 10, w: 100, h: 110 }
      };
    }
  };

  const safeEsc = typeof esc === 'function' ? esc : s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeState = () => (typeof state !== 'undefined' ? state : null);
  const safeToast = msg => (typeof toast === 'function' ? toast(msg) : console.log(msg));

  let lastParsed = null;
  let ocrBusy = false;

  function normalizeSource(source) {
    if (typeof document === 'undefined') return source;
    if (source instanceof HTMLCanvasElement && source.width === 1920 && source.height === 1080) {
      return source;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    const sw = source.videoWidth || source.naturalWidth || source.width || 1920;
    const sh = source.videoHeight || source.naturalHeight || source.height || 1080;
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, 1920, 1080);
    return canvas;
  }

  function normalizeSourceForAI(source) {
    if (typeof document === 'undefined') return source;
    const sw = source.videoWidth || source.naturalWidth || source.width || 1920;
    const sh = source.videoHeight || source.naturalHeight || source.height || 1080;
    const maxDim = 1920;
    let dw = sw, dh = sh;
    if (dw > maxDim || dh > maxDim) {
      if (dw >= dh) {
        dh = Math.round((dh * maxDim) / dw);
        dw = maxDim;
      } else {
        dw = Math.round((dw * maxDim) / dh);
        dh = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, dw, dh);
    return canvas;
  }

  function cropToCanvas(source, box, preprocess = null) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    const sx = sw / 1920, sy = sh / 1080;
    const canvas = document.createElement('canvas');
    const scale = preprocess === 'digits' ? 2 : 1.5;
    canvas.width = Math.max(1, Math.round(box.w * sx * scale));
    canvas.height = Math.max(1, Math.round(box.h * sy * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, canvas.width, canvas.height);

    if (preprocess === 'digits') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const low = Math.min(r, g, b), high = Math.max(r, g, b);
        const isLightDigit = low > 120 && (high - low) < 70;
        const n = isLightDigit ? 0 : 255;
        d[i] = d[i+1] = d[i+2] = n;
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (preprocess === 'text') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const n = lum > 110 ? 0 : 255;
        d[i] = d[i+1] = d[i+2] = n;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const padded = document.createElement('canvas');
    padded.width = canvas.width + 20;
    padded.height = canvas.height + 20;
    const pctx = padded.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, padded.width, padded.height);
    pctx.drawImage(canvas, 10, 10);
    return padded;
  }

  function detectMvpBadge(source, box) {
    if (typeof document === 'undefined') return false;
    const sw = source.videoWidth || source.naturalWidth || source.width || 1920;
    const sh = source.videoHeight || source.naturalHeight || source.height || 1080;
    const sx = sw / 1920, sy = sh / 1080;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.w * sx);
    canvas.height = Math.round(box.h * sy);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, canvas.width, canvas.height);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let redRibbonCount = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      if (r > 160 && g < 70 && b < 70) redRibbonCount++;
    }
    return redRibbonCount >= 80;
  }

  function parseKda(text) {
    const s = String(text || '').trim().replace(/[Oo]/g, '0');
    const digits = s.match(/\d+/g);
    if (digits && digits.length >= 3) {
      return `${Math.min(99, Number(digits[0]))}/${Math.min(99, Number(digits[1]))}/${Math.min(99, Number(digits[2]))}`;
    }
    const slashMatch = s.match(/^(\d{1,2})\s*[\/|\\]\s*(\d{1,2})\s*[\/|\\]\s*(\d{1,2})$/);
    if (slashMatch) return `${slashMatch[1]}/${slashMatch[2]}/${slashMatch[3]}`;
    return '0/0/0';
  }

  function parseGold(text) {
    const s = String(text || '').trim().replace(/[Oo]/g, '0');
    const digits = s.match(/\d+/g);
    if (!digits) return 0;
    const n = Number(digits.join(''));
    return Number.isFinite(n) && n >= 0 && n <= 50000 ? n : 0;
  }

  async function getWorker() {
    if (typeof Tesseract === 'undefined') throw Error('Tesseract OCR engine is loading, please try again in a moment');
    return await Tesseract.createWorker('eng', 1, {
      workerPath: '/vendor/tesseract/worker.min.js',
      corePath: location.origin + '/vendor/core',
      langPath: location.origin + '/vendor/lang',
      errorHandler: () => {}
    });
  }

  /**
   * Pure validation of a cloud vision response.
   *
   * The Gemini response schema declares `players` as required but sets no
   * minimum length, so a model that cannot read the player table still returns
   * a schema-valid object with `"players": []`. formatResult then pads that gap
   * into five blank rows, which would render an empty roster as if it were
   * real match data. Returns an operator-facing message, or null when the
   * response carries a usable roster.
   */
  function cloudResultIssue(data) {
    if (!data || typeof data !== 'object' || !data.blue || !data.red) {
      return 'AI vision returned no readable scoreboard. Try a sharper capture, or use local OCR.';
    }
    const populated = side => (data[side]?.players || []).some(p => {
      const name = String(p?.name ?? '').trim();
      return name && name !== '?';
    });
    const empty = ['blue', 'red'].filter(side => !populated(side));
    if (empty.length) {
      return `AI vision could not read the ${empty.join(' and ')} player table. It would come back empty rather than invented — recapture the full scoreboard, or use local OCR.`;
    }
    return null;
  }

  /**
   * Optional manual screenshot analysis using the configured vision provider.
   *
   * This is a MANUAL screenshot tool. It posts to /api/ai/analyze, which is
   * isolated from the shared live-detection session, so a cloud scan can never
   * pause, replace or interrupt the local realtime OCR loop that drives the
   * broadcast. Results are rendered for operator review and are never applied
   * to the live overlay without the operator pressing Apply.
   */
  async function scanWithCloud(source, options = {}) {
    if (ocrBusy) throw Error('Scoreboard scan is already in progress');
    if (typeof api !== 'function') throw Error('Cloud analysis is only available in the broadcast desk');
    const mode = ['result', 'draft', 'game'].includes(options.mode) ? options.mode : 'result';
    ocrBusy = true;
    try {
      const label = mode === 'draft' ? 'draft' : mode === 'game' ? 'in-game HUD' : 'post-match scoreboard';
      updateStatus(`AI vision is reading the ${label}…`);
      const frame = normalizeSource(source);
      const norm = normalizeSourceForAI(frame);
      const image = norm.toDataURL('image/jpeg', 0.90);
      const detailImages = mode === 'result' ? ['blue','red'].map(side => {
        const crop = document.createElement('canvas');
        crop.width = crop.height = 800;
        const x = side === 'blue' ? 160 : 960;
        crop.getContext('2d').drawImage(frame,x,180,800,800,0,0,800,800);
        return crop.toDataURL('image/jpeg',0.92);
      }) : [];
      const key = (typeof localStorage !== 'undefined' ? localStorage.getItem('geminiApiKey') : '') || '';
      const provider = document.getElementById('postgameAiProvider')?.value || 'codex';
      const res = await api('/api/ai/analyze', { image, detailImages, apiKey: key, mode, provider });
      // The server is the single source of truth for what the model returned.
      const data = res?.data || res?.patch;
      const issue = cloudResultIssue(data);
      if (issue) throw Error(issue);
      renderReview(data, res.engine || 'AI Vision');
      const model = res.engine || 'AI Vision';
      updateStatus(`Analysis complete · ${model} · review the fields below, then Apply. Not applied to the live overlay yet.`);
      return data;
    } finally {
      ocrBusy = false;
    }
  }

  /**
   * Local OCR scanning via Tesseract engine. This is the default engine:
   * offline, realtime and the only one that drives the live broadcast.
   */
  async function scanSource(source) {
    if (ocrBusy) throw Error('Scoreboard scan is already in progress');
    ocrBusy = true;
    updateStatus('Scanning post-game scoreboard with local OCR…');

    const norm = normalizeSource(source);
    const worker = await getWorker();
    try {
      const curState = safeState();
      const data = {
        blue: { players: [], kills: 0, gold: 0 },
        red: { players: [], kills: 0, gold: 0 },
        gameTime: curState?.gameTime || '11:00',
        winner: 'blue',
        mvp: null
      };

      // 1. Scan KDA, Gold, Medals and Names for all 10 players
      for (const side of ['blue', 'red']) {
        for (let i = 0; i < 5; i++) {
          const rowBox = COORDS.row(side, i);
          
          // MVP Crown detection directly from medal box pixels
          const isMvp = detectMvpBadge(norm, rowBox.medal);

          // Name OCR
          await worker.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[] _-.’\'+·•'
          });
          const nameCanvas = cropToCanvas(norm, rowBox.name, 'text');
          const nameRes = await worker.recognize(nameCanvas);
          const rawName = nameRes.data.text.trim();

          // KDA OCR
          await worker.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: '0123456789/ '
          });
          const kdaCanvas = cropToCanvas(norm, rowBox.kda, 'digits');
          const kdaRes = await worker.recognize(kdaCanvas);
          const kda = parseKda(kdaRes.data.text);

          // Gold OCR
          await worker.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: '0123456789'
          });
          const goldCanvas = cropToCanvas(norm, rowBox.gold, 'digits');
          const goldRes = await worker.recognize(goldCanvas);
          const gold = parseGold(goldRes.data.text);

          // Level fallback
          const level = Math.max(10, Math.min(15, Math.round(gold / 1800) + 9));

          const player = {
            slot: i,
            rawName,
            name: rawName,
            kda,
            gold,
            level,
            hero: curState?.[side]?.players?.[i]?.hero || '',
            role: ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'][i],
            isMvp
          };

          data[side].players.push(player);
        }
      }

      // Calculate total team kills & gold from player sums
      for (const side of ['blue', 'red']) {
        let teamKills = 0, teamGold = 0;
        data[side].players.forEach(p => {
          const parts = p.kda.split('/').map(Number);
          teamKills += (parts[0] || 0);
          teamGold += (p.gold || 0);
        });
        data[side].kills = teamKills;
        data[side].gold = teamGold;
      }

      // Determine Winner:
      // Priority 1: curState.winner (if live session detected nexus destruction)
      // Priority 2: Higher kills (or gold)
      let detectedWinner = (curState?.winner && ['blue', 'red'].includes(curState.winner))
        ? curState.winner
        : (data.blue.kills >= data.red.kills ? 'blue' : 'red');
      data.winner = detectedWinner;

      // Game MVP MUST ALWAYS be from the WINNING TEAM
      const winSide = data.winner;
      const loseSide = winSide === 'blue' ? 'red' : 'blue';

      // Clear isMvp from losing team completely
      data[loseSide].players.forEach(p => { p.isMvp = false; });

      // Find the winning side's MVP: badge winner or highest score
      let winningMvpSlot = data[winSide].players.findIndex(p => p.isMvp);
      if (winningMvpSlot === -1) {
        let maxScore = -Infinity;
        data[winSide].players.forEach((p, idx) => {
          const parts = (p.kda || '0/0/0').split('/').map(Number);
          const k = parts[0] || 0, d = parts[1] || 0, a = parts[2] || 0;
          const score = (k * 3) + (a * 1.5) - (d * 2) + ((p.gold || 0) / 1000);
          if (score > maxScore) {
            maxScore = score;
            winningMvpSlot = idx;
          }
        });
      }
      winningMvpSlot = Math.max(0, Math.min(4, winningMvpSlot));
      data[winSide].players.forEach((p, idx) => { p.isMvp = (idx === winningMvpSlot); });
      data.mvp = { side: winSide, slot: winningMvpSlot };

      // Scan game time if available
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: '0123456789:'
        });
        const clockCanvas = cropToCanvas(norm, COORDS.header.gameTime, 'digits');
        const clockRes = await worker.recognize(clockCanvas);
        const clockText = clockRes.data.text.trim();
        if (/^\d{1,2}:[0-5]\d$/.test(clockText)) data.gameTime = clockText;
      } catch {
        // Fallback to current game time
      }

      // 2. Identify teams and resolve player IGNs against registered rosters
      if (typeof Playoffs !== 'undefined') {
        const blueTeamIdent = Playoffs.identify(data.blue.players.map(p => p.rawName));
        const redTeamIdent = Playoffs.identify(data.red.players.map(p => p.rawName));

        const blueTeam = blueTeamIdent?.team || Playoffs.team(curState?.blue?.tag || curState?.blue?.name);
        const redTeam = redTeamIdent?.team || Playoffs.team(curState?.red?.tag || curState?.red?.name);

        data.blue.team = blueTeam;
        data.red.team = redTeam;

        // Resolve player names to canonical registered IGNs, stripping squad tags
        for (const side of ['blue', 'red']) {
          const team = data[side].team;
          data[side].players.forEach((p, i) => {
            if (team) {
              const matched = Playoffs.matchPlayer(p.rawName, team.players);
              if (matched) {
                p.canonicalName = matched.name;
                p.name = matched.name;
                p.matchConfidence = matched.confidence;
                p.matchMethod = matched.method;
              } else {
                p.canonicalName = team.players[i] || p.rawName;
                p.name = p.canonicalName;
              }
            }
          });
        }
      }

      // Hero recognition via HeroRecognition if available
      if (typeof HeroRecognition !== 'undefined') {
        try {
          const queries = [];
          for (const side of ['blue', 'red']) {
            for (let i = 0; i < 5; i++) {
              const r = COORDS.row(side, i).hero;
              queries.push(HeroRecognition.query(norm, { ...r, field: `${side}.players.${i}.hero` }, 'result'));
            }
          }
          const matches = await HeroRecognition.match(queries);
          matches.forEach(m => {
            if (m.value) {
              const [side, , idx] = m.field.split('.');
              if (data[side].players[Number(idx)]) {
                data[side].players[Number(idx)].hero = m.value;
              }
            }
          });
        } catch (e) {
          console.warn('Hero recognition fallback:', e.message);
        }
      }

      lastParsed = data;
      renderReview(data, 'Local OCR');
      updateStatus('Post-match scoreboard recognized. Review details below and click Apply.');
      safeToast('Scoreboard OCR complete. Review and apply to broadcast.');
      return data;
    } finally {
      await worker.terminate();
      ocrBusy = false;
    }
  }

  function updateStatus(text) {
    const el = document.getElementById('postgameOcrStatus');
    if (el) el.textContent = text;
  }

  function renderReview(d, engine = 'AI Vision') {
    const container = document.getElementById('postgameOcrReview');
    if (!container) return;
    container.style.display = 'block';

    const curState = safeState();
    const bTeam = d.blue.team?.name || d.blue.teamName || curState?.blue?.name || 'BLUE PHOENIX';
    const rTeam = d.red.team?.name || d.red.teamName || curState?.red?.name || 'RED REAPERS';
    const bTag = d.blue.team?.id || d.blue.teamId || curState?.blue?.tag || 'BLU';
    const rTag = d.red.team?.id || d.red.teamId || curState?.red?.tag || 'RED';
    const isAi = engine.includes('Gemini') || engine.includes('Codex') || engine.includes('AI');

    container.innerHTML = `
      <div class="ocr-review-header" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:12px 16px; border-radius:8px; margin-bottom:14px; border:1px solid rgba(255,255,255,0.08);">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:11px; font-weight:700; color:var(--accent,#e08a1e); letter-spacing:1px;">POST-MATCH RESULT</span>
            <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; ${isAi ? 'background:rgba(139,92,246,0.18); color:#a78bfa; border:1px solid rgba(139,92,246,0.4);' : 'background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3);'}">
              ${isAi ? `★ ${safeEsc(engine).toUpperCase()}` : '⚙ LOCAL OCR'}
            </span>
          </div>
          <strong style="font-size:16px; display:block; margin-top:2px;">${safeEsc(bTag)} vs ${safeEsc(rTag)}</strong>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <label style="margin:0; font-size:12px; display:flex; align-items:center; gap:6px;">Game Time:
            <input id="postgameTimeInput" type="text" value="${safeEsc(d.gameTime)}" style="width:75px; text-align:center; font-weight:bold; padding:4px 6px;">
          </label>
          <div class="winner-toggle" style="display:flex; gap:4px; background:rgba(255,255,255,0.05); padding:3px; border-radius:6px;">
            <button id="postgameWinBlue" type="button" class="btn-side ${d.winner==='blue'?'active-blue':''}" style="padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; border:none; cursor:pointer;">${safeEsc(bTag)} WON</button>
            <button id="postgameWinRed" type="button" class="btn-side ${d.winner==='red'?'active-red':''}" style="padding:4px 10px; font-size:11px; font-weight:bold; border-radius:4px; border:none; cursor:pointer;">${safeEsc(rTag)} WON</button>
          </div>
        </div>
      </div>

      <div class="twogrid" style="grid-template-columns:minmax(0,1fr);gap:16px; margin-bottom:14px;">
        <!-- Blue Side Column -->
        <div class="team-review-card blue" style="background:rgba(59,130,246,0.04); border:1px solid rgba(59,130,246,0.25); border-radius:8px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(59,130,246,0.2); padding-bottom:8px; margin-bottom:10px;">
            <div>
              <strong style="color:#60a5fa; font-size:14px;">${safeEsc(bTeam)}</strong>
              <span style="font-size:11px; color:#93c5fd; display:block;">${safeEsc(bTag)} · Blue Side</span>
            </div>
            <div style="text-align:right;">
              <span style="font-size:16px; font-weight:bold; color:#60a5fa;">${d.blue.kills} KILLS</span>
              <span style="font-size:11px; color:rgba(255,255,255,0.5); display:block;">${Math.round(d.blue.gold/100)/10}k Gold</span>
            </div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="color:rgba(255,255,255,0.4); text-align:left; font-size:10px; border-bottom:1px solid rgba(255,255,255,0.06);">
                <th style="padding:4px 2px;">ROLE</th>
                <th style="padding:4px 2px;">HERO</th>
                <th style="padding:4px 2px;">PLAYER IGN</th>
                <th style="padding:4px 2px; text-align:center;">K/D/A</th>
                <th style="padding:4px 2px; text-align:right;">GOLD</th>
                <th style="padding:4px 2px; text-align:center;">ITEMS</th>
                <th style="padding:4px 2px; text-align:center;">MVP</th>
              </tr>
            </thead>
            <tbody>
              ${d.blue.players.map((p, i) => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03); ${p.isMvp?'background:rgba(234,179,8,0.08);':''}">
                  <td style="padding:6px 2px; font-weight:bold; color:#60a5fa; font-size:10px;">${p.role}</td>
                  <td style="padding:6px 2px;"><input data-slot="blue.${i}.hero" value="${safeEsc(p.hero)}" style="width:75px; padding:2px 4px; font-size:11px;" placeholder="Hero"><small style="display:block;font-size:9px;color:rgba(255,255,255,0.4);">Lvl ${p.level||15}</small></td>
                  <td style="padding:6px 2px;">
                    <input data-slot="blue.${i}.name" value="${safeEsc(p.name)}" style="width:110px; padding:2px 4px; font-size:11px; font-weight:bold;" title="Scanned: ${safeEsc(p.rawName || p.rawIgn)}">
                    ${p.matchMethod ? `<span style="display:block; font-size:9px; color:${isAi ? '#a78bfa' : '#34d399'};">✓ ${safeEsc(p.matchMethod)}</span>` : ''}
                  </td>
                  <td style="padding:6px 2px; text-align:center;"><input data-slot="blue.${i}.kda" value="${safeEsc(p.kda)}" style="width:65px; text-align:center; padding:2px 4px; font-size:11px;"></td>
                  <td style="padding:6px 2px; text-align:right;"><input data-slot="blue.${i}.gold" value="${p.gold}" style="width:55px; text-align:right; padding:2px 4px; font-size:11px;"></td>
                  <td style="padding:6px 2px; text-align:center;">
                    <div style="display:flex;gap:2px;justify-content:center;align-items:center;flex-wrap:wrap;max-width:110px;">
                      ${(p.items||[]).map(it=>it.icon?`<img src="${safeEsc(it.icon)}" title="${safeEsc(it.name)}" style="width:18px;height:18px;border-radius:2px;background:rgba(0,0,0,0.4);">`:`<span style="font-size:8px;color:rgba(255,255,255,0.6);">${safeEsc(it.name||it)}</span>`).join('')}
                    </div>
                  </td>
                  <td style="padding:6px 2px; text-align:center;">
                    <input type="radio" name="mvpRadio" value="blue.${i}" ${p.isMvp?'checked':''} style="cursor:pointer;" title="Mark as Game MVP">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Red Side Column -->
        <div class="team-review-card red" style="background:rgba(239,68,68,0.04); border:1px solid rgba(239,68,68,0.25); border-radius:8px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(239,68,68,0.2); padding-bottom:8px; margin-bottom:10px;">
            <div>
              <strong style="color:#f87171; font-size:14px;">${safeEsc(rTeam)}</strong>
              <span style="font-size:11px; color:#fca5a5; display:block;">${safeEsc(rTag)} · Red Side</span>
            </div>
            <div style="text-align:right;">
              <span style="font-size:16px; font-weight:bold; color:#f87171;">${d.red.kills} KILLS</span>
              <span style="font-size:11px; color:rgba(255,255,255,0.5); display:block;">${Math.round(d.red.gold/100)/10}k Gold</span>
            </div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="color:rgba(255,255,255,0.4); text-align:left; font-size:10px; border-bottom:1px solid rgba(255,255,255,0.06);">
                <th style="padding:4px 2px;">ROLE</th>
                <th style="padding:4px 2px;">HERO</th>
                <th style="padding:4px 2px;">PLAYER IGN</th>
                <th style="padding:4px 2px; text-align:center;">K/D/A</th>
                <th style="padding:4px 2px; text-align:right;">GOLD</th>
                <th style="padding:4px 2px; text-align:center;">ITEMS</th>
                <th style="padding:4px 2px; text-align:center;">MVP</th>
              </tr>
            </thead>
            <tbody>
              ${d.red.players.map((p, i) => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03); ${p.isMvp?'background:rgba(234,179,8,0.08);':''}">
                  <td style="padding:6px 2px; font-weight:bold; color:#f87171; font-size:10px;">${p.role}</td>
                  <td style="padding:6px 2px;"><input data-slot="red.${i}.hero" value="${safeEsc(p.hero)}" style="width:75px; padding:2px 4px; font-size:11px;" placeholder="Hero"><small style="display:block;font-size:9px;color:rgba(255,255,255,0.4);">Lvl ${p.level||15}</small></td>
                  <td style="padding:6px 2px;">
                    <input data-slot="red.${i}.name" value="${safeEsc(p.name)}" style="width:110px; padding:2px 4px; font-size:11px; font-weight:bold;" title="Scanned: ${safeEsc(p.rawName || p.rawIgn)}">
                    ${p.matchMethod ? `<span style="display:block; font-size:9px; color:${isAi ? '#a78bfa' : '#34d399'};">✓ ${safeEsc(p.matchMethod)}</span>` : ''}
                  </td>
                  <td style="padding:6px 2px; text-align:center;"><input data-slot="red.${i}.kda" value="${safeEsc(p.kda)}" style="width:65px; text-align:center; padding:2px 4px; font-size:11px;"></td>
                  <td style="padding:6px 2px; text-align:right;"><input data-slot="red.${i}.gold" value="${p.gold}" style="width:55px; text-align:right; padding:2px 4px; font-size:11px;"></td>
                  <td style="padding:6px 2px; text-align:center;">
                    <div style="display:flex;gap:2px;justify-content:center;align-items:center;flex-wrap:wrap;max-width:110px;">
                      ${(p.items||[]).map(it=>it.icon?`<img src="${safeEsc(it.icon)}" title="${safeEsc(it.name)}" style="width:18px;height:18px;border-radius:2px;background:rgba(0,0,0,0.4);">`:`<span style="font-size:8px;color:rgba(255,255,255,0.6);">${safeEsc(it.name||it)}</span>`).join('')}
                    </div>
                  </td>
                  <td style="padding:6px 2px; text-align:center;">
                    <input type="radio" name="mvpRadio" value="red.${i}" ${p.isMvp?'checked':''} style="cursor:pointer;" title="Mark as Game MVP">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="buttonrow" style="margin-top:10px;">
        <button id="postgameApplyBtn" class="primary" style="padding:10px 20px; font-size:14px; font-weight:bold; background:var(--accent,#e08a1e); color:#000;">
          Apply Match Result to Broadcast &amp; Playoffs
        </button>
      </div>
    `;

    // Wire winner toggle buttons
    const btnBlue = document.getElementById('postgameWinBlue');
    const btnRed = document.getElementById('postgameWinRed');
    btnBlue.onclick = () => {
      d.winner = 'blue';
      btnBlue.classList.add('active-blue');
      btnRed.classList.remove('active-red');
      d.red.players.forEach(p => { p.isMvp = false; });
      let bestSlot = 0, bestScore = -Infinity;
      d.blue.players.forEach((p, idx) => {
        const parts = (p.kda || '0/0/0').split('/').map(Number);
        const score = ((parts[0] || 0) * 3) + ((parts[2] || 0) * 1.5) - ((parts[1] || 0) * 2) + ((p.gold || 0) / 1000);
        if (score > bestScore) { bestScore = score; bestSlot = idx; }
      });
      d.blue.players.forEach((p, idx) => { p.isMvp = (idx === bestSlot); });
      d.mvp = { side: 'blue', slot: bestSlot };
      const radio = document.querySelector(`input[name="mvpRadio"][value="blue.${bestSlot}"]`);
      if (radio) radio.checked = true;
    };
    btnRed.onclick = () => {
      d.winner = 'red';
      btnRed.classList.add('active-red');
      btnBlue.classList.remove('active-blue');
      d.blue.players.forEach(p => { p.isMvp = false; });
      let bestSlot = 0, bestScore = -Infinity;
      d.red.players.forEach((p, idx) => {
        const parts = (p.kda || '0/0/0').split('/').map(Number);
        const score = ((parts[0] || 0) * 3) + ((parts[2] || 0) * 1.5) - ((parts[1] || 0) * 2) + ((p.gold || 0) / 1000);
        if (score > bestScore) { bestScore = score; bestSlot = idx; }
      });
      d.red.players.forEach((p, idx) => { p.isMvp = (idx === bestSlot); });
      d.mvp = { side: 'red', slot: bestSlot };
      const radio = document.querySelector(`input[name="mvpRadio"][value="red.${bestSlot}"]`);
      if (radio) radio.checked = true;
    };

    // Wire apply button
    document.getElementById('postgameApplyBtn').onclick = () => applyPostgameResult(d);
  }

  async function applyPostgameResult(d) {
    if (!d) return;

    // Collect edited values from inputs
    const timeInput = document.getElementById('postgameTimeInput');
    if (timeInput) d.gameTime = timeInput.value.trim();

    const slotInputs = document.querySelectorAll ? document.querySelectorAll('[data-slot]') : [];
    slotInputs.forEach(input => {
      const [side, idxStr, key] = input.dataset.slot.split('.');
      const idx = Number(idxStr);
      if (d[side]?.players?.[idx]) {
        let val = input.value.trim();
        if (key === 'gold') val = Number(val) || 0;
        d[side].players[idx][key] = val;
      }
    });

    const selectedMvp = document.querySelector('input[name="mvpRadio"]:checked')?.value || (d.winner + '.0');
    let [mvpSide, mvpSlotStr] = selectedMvp.split('.');
    let mvpSlot = Number(mvpSlotStr);
    // Hard safety guard: Game MVP must ALWAYS come from the winning team
    if (mvpSide !== d.winner || isNaN(mvpSlot) || !d[mvpSide]?.players?.[mvpSlot]) {
      mvpSide = d.winner;
      mvpSlot = d[mvpSide].players.findIndex(p => p.isMvp);
      if (mvpSlot === -1) mvpSlot = 0;
    }
    const mvpPlayer = d[mvpSide].players[mvpSlot];

    // Build the broadcast patch
    const patch = {
      winner: d.winner,
      gameTime: d.gameTime,
      scene: 'postgame',
      phase: 'RESULT',
      blue: {
        kills: d.blue.kills,
        gold: d.blue.gold,
        players: d.blue.players.map(p => ({
          name: p.name,
          role: p.role,
          hero: p.hero,
          kda: p.kda,
          gold: p.gold,
          level: p.level,
          items: p.items || []
        }))
      },
      red: {
        kills: d.red.kills,
        gold: d.red.gold,
        players: d.red.players.map(p => ({
          name: p.name,
          role: p.role,
          hero: p.hero,
          kda: p.kda,
          gold: p.gold,
          level: p.level,
          items: p.items || []
        }))
      },
      mvp: {
        player: selectedMvp,
        name: mvpPlayer?.name || '',
        role: mvpPlayer?.role || '',
        hero: mvpPlayer?.hero || '',
        kda: mvpPlayer?.kda || '',
        items: (mvpPlayer?.items || []).map(i => (typeof i === 'string' ? i : i.name)).slice(0, 6),
        gpm: mvpPlayer?.gold ? String(Math.round(mvpPlayer.gold / 11)) : '700',
        kp: '80%'
      }
    };

    // Apply objectives if review inputs exist
    const objectives = { blue: {}, red: {} };
    for (const s of ['blue', 'red']) {
      for (const [key, suffix] of [['turrets', 'Turrets'], ['lord', 'Lord'], ['turtle', 'Turtle']]) {
        const inp = document.getElementById('review' + (s === 'blue' ? 'Blue' : 'Red') + suffix);
        if (inp) objectives[s][key] = Math.max(0, parseInt(inp.value || '0', 10));
      }
    }

    const safeApi = typeof api === 'function' ? api : async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
    const res = await safeApi('/api/match/apply', { patch, objectives });
    if (res.playoffs?.message) safeToast(res.playoffs.message);
    else safeToast('Match result applied to broadcast overlay.');
    updateStatus('Applied to broadcast. Scene switched to postgame.');
    const sumEl = document.getElementById('sourceSummary');
    if (sumEl) sumEl.textContent = (d.engine || 'Scoreboard OCR') + ' · ' + new Date().toLocaleTimeString();

    // Also prime MVP portrait if available
    if (typeof window !== 'undefined' && window.MvpPhotos && patch.mvp?.name) {
      const winnerTag = d[d.winner]?.team?.id || safeState()?.[d.winner]?.tag || '';
      window.MvpPhotos.apply(patch.mvp.name, winnerTag).catch(() => {});
    }
  }

  async function captureActiveWindow() {
    const video = document.getElementById('captureVideo');
    const canvas = document.getElementById('captureCanvas');
    const source = (video && video.readyState >= 2 && !video.paused) ? video : (canvas && canvas.width > 100) ? canvas : null;
    if (!source) throw Error('Start Live Game Capture first or upload a post-game screenshot below.');
    return await scanSource(source);
  }

  async function handleFile(file, { ai = false } = {}) {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = normalizeSource(bitmap);
    bitmap.close();
    return ai ? await scanWithCloud(canvas, { mode: 'result' }) : await scanSource(canvas);
  }

  return {
    normalizeSource,
    normalizeSourceForAI,
    scanSource,
    scanWithCloud,
    cloudResultIssue,
    captureActiveWindow,
    handleFile,
    parseKda,
    parseGold,
    detectMvpBadge,
    applyPostgameResult,
    renderReview,
    COORDS
  };
})();

if (typeof window !== 'undefined') window.PostgameOCR = PostgameOCR;
if (typeof module !== 'undefined' && module.exports) module.exports = PostgameOCR;
