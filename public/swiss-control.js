// Tournament controls publish only Swiss state; the match schedule is independent.
(() => {
  const body = document.getElementById('swissBody'), status = document.getElementById('swissStatus');
  const preview = document.getElementById('swissPreview');
  if (!body || !preview) return;
  const DEFAULT_TEAMS = ['ULS','USM EARTH SAVERS CLUB','JMES','FTSS','APO','ABES','PICE','DEVCOM','PSITS','JIECEP','JPEDS','AMS','FSMS','PNSA','ICPEP','UFTTS'];
  let cache = null, signature, selectedRound = null, editingNames = false, busy = false;
  const toolbar=document.querySelector('#swissPanel>.swiss-toolbar');
  const viewLabel=document.createElement('label');viewLabel.className='swiss-view-control';
  viewLabel.innerHTML=`Broadcast view<select id="swissView">${SwissView.views.map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}</select>`;
  toolbar.append(viewLabel);
  const viewSelect=document.getElementById('swissView');
  viewSelect.onchange=run(async()=>{await save({swissView:viewSelect.value});render(cache,true);});
  document.getElementById('swissDownload').textContent='Download 4K SVG';

  async function call(url,payload = {}) {
    const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || response.statusText);
    return data;
  }
  function namesForm(names, start = false) {
    return `<form id="swissNames"><p class="hint">${start ? 'The sixteen qualifiers from Groups A–H, in the supplied bracket’s first-round order.' : 'Name corrections keep each team’s logo, results and bracket position.'}</p>
      <div class="swiss-team-editors">${names.map((name,i)=>`<label>Match ${Math.floor(i/2)+1} · ${i%2?'right':'left'} team<input name="team" aria-label="Swiss team ${i+1}" maxlength="100" value="${esc(name)}" required></label>`).join('')}</div>
      <div class="buttonrow"><button type="submit" class="primary">${start?'Start Swiss bracket':'Save team names'}</button>${start?'':'<button type="button" id="swissCancelNames">Cancel</button>'}</div></form>`;
  }
  function bindNames(start) {
    const form = document.getElementById('swissNames');
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      try {
        const teams = [...form.querySelectorAll('[name=team]')].map(input=>input.value.trim());
        const out = await call(start?'/api/swiss/start':'/api/swiss/teams',{teams});
        editingNames = false;
        render(out.swiss,true);
        toast(start?'Swiss bracket started':'Bracket team names saved');
      } catch (error) { toast(error.message,true); }
      finally { busy = false; }
    };
    document.getElementById('swissCancelNames')?.addEventListener('click',()=>{editingNames=false;render(cache,true);});
  }
  // ---- Background auto-result queue: paste match data, poll until the game ends, auto-apply winner ----
  async function result(matchId,winner) {
    if (busy) return;
    busy = true;
    try {
      const out = await call('/api/swiss/result',{matchId,winner});
      render(out.state.swiss);
      toast(out.complete?'Swiss stage complete':out.advanced?`Round ${out.state.swiss.currentRound} is ready`:winner===null?'Result cleared':'Bracket updated');
    } catch (error) { toast(error.message,true); }
    finally { busy = false; }
  }
  const pendingResults = []; // {battleId, redSide, blueSide, text, addedAt, status}
  let pollTimer = null, pollRunning = false;
  function renderPendingBar() {
    let bar = document.getElementById('swissPendingBar');
    if (!pendingResults.length) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'swissPendingBar';
      bar.className = 'swiss-pending-bar';
      const anchor = document.getElementById('swissParseDiscord');
      if (anchor) anchor.parentElement.insertAdjacentElement('afterend', bar);
      else return;
    }
    bar.innerHTML = `<strong>⏳ Auto-results waiting (${pendingResults.length}):</strong> ` +
      pendingResults.map(p => `<span class="swiss-pending-item">${esc(p.label)} · ${esc(p.status)}</span>`).join(' ');
  }
  async function pollPending() {
    if (pollRunning) return;
    pollRunning = true;
    try {
      for (const entry of [...pendingResults]) {
        try {
          const check = await call('/api/swiss/poll-match-result', { matchId: entry.battleId });
          if (!check.ready) continue;
          entry.status = 'applying…';
          renderPendingBar();
          const data = await call('/api/swiss/parse-discord-result', { text: entry.text });
          applyParseResults(data);
          pendingResults.splice(pendingResults.indexOf(entry), 1);
        } catch (error) {
          // Permanent failures drop; fetch hiccups keep retrying.
          if (/No Swiss match found|locked|complete|Invalid|Missing|No match reports|empty/i.test(error.message)) {
            toast(`${entry.label}: ${error.message}`, true);
            pendingResults.splice(pendingResults.indexOf(entry), 1);
          }
        }
      }
    } finally {
      pollRunning = false;
      renderPendingBar();
    }
  }
  function seriesOf(m) {
    let blue = 0, red = 0;
    for (const g of m.games || []) { if (g.winner === 'blue') blue += 1; else if (g.winner === 'red') red += 1; }
    return { blue, red };
  }
  function seriesHtml(m) {
    if (!m.games || !m.games.length) return '';
    const s = seriesOf(m);
    return `<div class="swiss-series">Series ${s.blue}–${s.red} · BO3</div>`;
  }
  function applyParseResults(data) {
    render(data.state.swiss);
    for (const r of data.results || []) {
      if (r.error) { toast(`${r.swissMatchId || 'Report'}: ${r.error}`, true); continue; }
      if (r.duplicate) { toast(`${r.swissMatchId} Game ${r.game}: already recorded`); continue; }
      const s = ` · series ${r.series.blue}–${r.series.red}`;
      if (r.conflict) toast(`⚠️ ${r.swissMatchId}: games say ${r.winnerTeam} but series marked otherwise${s}`, true);
      else if (r.applied) toast(`✅ ${r.winnerTeam} takes ${r.swissMatchId}${s}${r.advanced ? ' — next round ready' : ''}`);
      else toast(`${r.winnerTeam} wins Game ${r.game} (${r.swissMatchId})${s}`);
    }
    if (data.state.swiss.complete) toast('Swiss stage complete');
  }
  function splitReports(text) {
    return String(text || '').split(/^(?=Round:)/mi).map(b => b.trim()).filter(b => /Round:/i.test(b));
  }
  function parseBlockPreview(block) {
    const red = (block.match(/Red side:\s*(.+)/i)?.[1] || '').trim();
    const blue = (block.match(/Blue side:\s*(.+)/i)?.[1] || '').trim();
    const game = parseInt(block.match(/Game\s*(\d+)/i)?.[1] || '0', 10) || null;
    const winnerLine = (block.match(/WINNER:\s*(.+)/i)?.[1] || '').trim();
    const rawId = (block.match(/(?:GameID|BattleID|ID):\s*([a-zA-Z0-9_-]+)/i)?.[1] || '').trim();
    const battleId = (/^(blue|red)$/i.test(rawId) || !/^[a-zA-Z0-9_-]{6,100}$/.test(rawId)) ? null : rawId;
    let reason = '';
    if (!red || !blue) reason = 'missing Red/Blue side lines';
    else if (!battleId && !winnerLine) reason = 'no BattleID and no WINNER: line';
    return { red, blue, game, winnerLine, battleId, valid: !reason, reason };
  }
  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollPending, 5000);
    pollPending(); // check immediately
  }

  function showParseDiscordModal() {
    const modal = document.createElement('div');
    modal.className = 'swiss-modal-overlay';
    modal.innerHTML = `
      <div class="swiss-modal">
        <h3>Parse Discord Match Data</h3>
        <p class="hint">Paste one or many reports from the MATCH-DATA channel. BO3 — first to 2 game wins takes the series. Reports with a WINNER: line apply instantly; BattleID reports poll until each game ends.</p>
        <textarea id="discordText" rows="10" placeholder="Round:  ROUND 1
ULS VS UFTTS
ULS vs UFTTS Game 1
BattleID: [Battle ID shown in the ML Match Lobby Tool]
Blue side: ULS
Red side: UFTTS"></textarea>
        <div id="parseDiscordPreview" class="swiss-parse-result" style="display:none"></div>
        <div class="buttonrow">
          <button id="parseDiscordSubmit" class="primary" disabled>Add to auto-results</button>
          <button id="parseDiscordCancel">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('parseDiscordCancel').onclick = () => modal.remove();
    const textarea = document.getElementById('discordText');
    const preview = document.getElementById('parseDiscordPreview');
    const submitBtn = document.getElementById('parseDiscordSubmit');
    let blocks = [];
    textarea.addEventListener('input', () => {
      const text = textarea.value.trim();
      if (!text) { preview.style.display='none'; submitBtn.disabled=true; blocks=[]; return; }
      blocks = splitReports(text).map(t => ({ text: t, info: parseBlockPreview(t) }));
      const valid = blocks.filter(b => b.info.valid);
      if (!blocks.length) { preview.style.display='none'; submitBtn.disabled=true; return; }
      preview.style.display = 'block';
      preview.innerHTML = blocks.map((b,i) => {
        const f = b.info;
        if (!f.valid) return `<p>❌ Report ${i+1}: ${esc(f.reason)}</p>`;
        const mode = f.winnerLine ? '⚡ applies now (WINNER declared)' : '⏳ polls until the game ends';
        return `<p><strong>Report ${i+1}${f.game?` · Game ${f.game}`:''}:</strong> ${esc(f.blue)} vs ${esc(f.red)} · ${f.winnerLine?`WINNER: ${esc(f.winnerLine)}`:`BattleID ${esc(f.battleId)}`} · ${mode}</p>`;
      }).join('') + (valid.length ? `<p class="hint">${valid.length} report${valid.length===1?'':'s'} ready — WINNER reports apply instantly, BattleID reports auto-apply when each game ends.</p>` : `<p class="hint">Fix the flagged reports to enable submit.</p>`);
      submitBtn.disabled = !valid.length;
    });
    submitBtn.onclick = async () => {
      const valid = blocks.filter(b => b.info.valid);
      if (!valid.length || busy) return;
      busy = true; submitBtn.disabled = true;
      try {
        // Marshal-declared winners apply immediately (no fetch needed).
        for (const b of valid.filter(b => b.info.winnerLine)) {
          try { applyParseResults(await call('/api/swiss/parse-discord-result', { text: b.text })); }
          catch (error) { toast(error.message, true); }
        }
        // BattleID reports poll in the background until each game ends.
        let queued = 0;
        for (const b of valid.filter(b => !b.info.winnerLine && b.info.battleId)) {
          if (pendingResults.some(p => p.battleId === b.info.battleId)) { toast(`BattleID already watched: ${b.info.battleId}`, true); continue; }
          pendingResults.push({ battleId: b.info.battleId, text: b.text, label: `${b.info.blue} vs ${b.info.red}${b.info.game?` G${b.info.game}`:''}`, addedAt: Date.now(), status: 'waiting…' });
          queued += 1;
        }
        if (queued) { toast(`Watching ${queued} game${queued===1?'':'s'} — auto-applies when each ends`); renderPendingBar(); ensurePolling(); }
      } finally {
        busy = false;
        textarea.value = ''; blocks = [];
        preview.style.display = 'none'; submitBtn.disabled = true;
      }
    };
  }

  function render(swiss, force = false) {
    cache = swiss;
    const view=state?.swissView||'overview';
    viewSelect.value=view;
    const nextSignature = JSON.stringify([swiss,view]);
    if (!force && signature === nextSignature) return;
    signature = nextSignature;
    SwissBracket.update(preview,swiss,{view}).catch(error=>toast(error.message,true));
    status.textContent = !swiss?'NOT STARTED':swiss.complete?'COMPLETE':`ROUND ${swiss.currentRound}`;
    if (editingNames) return;
    if (!swiss) {
      body.innerHTML = namesForm(DEFAULT_TEAMS,true);
      bindNames(true);
      return;
    }
    const current = selectedRound === null ? swiss.currentRound : Math.min(selectedRound,swiss.currentRound);
    const round = swiss.rounds.find(r=>r.round===current);
    const locked = swiss.complete || current !== swiss.currentRound;
    body.innerHTML = `<div class="swiss-toolbar"><label>Results for<select id="swissRound"><option value="live">Current round</option>${swiss.rounds.map(r=>`<option value="${r.round}" ${selectedRound===r.round?'selected':''}>Round ${r.round}</option>`).join('')}</select></label></div>
      <p class="hint">BO3 series — parse Discord reports per game (first to 2), or click a team to set the series winner directly. Gold marks the series winner.</p>
      <div class="buttonrow" style="margin-bottom:12px"><button id="swissParseDiscord" class="primary">📋 Parse Discord Match Data</button></div>
      <div class="swiss-matches">${round.matches.map(m=>`<article class="swiss-match" data-match="${esc(m.id)}">
        <h3>${esc(m.id)} <small>${esc(m.pool)}${m.rematch?' · REMATCH':''}</small></h3>
        ${['blue','red'].map(side=>`<button data-win="${side}" data-match="${esc(m.id)}" class="${m.winner===side?'won':''}" ${locked||m.winner===side?'disabled':''}>${esc(m[side])}${m.winner===side?' ✓':''}</button>`).join('')}
        <div class="swiss-result">${m.winner?esc(m[m.winner])+' wins':'Awaiting result'}</div>
        ${seriesHtml(m)}
        ${m.winner&&!locked?`<button data-clear-result="${esc(m.id)}">Undo result</button>`:''}
      </article>`).join('')}</div>
      <div class="buttonrow"><button id="swissEditNames">Edit team names</button></div>
      <div id="swissNameEditor"></div>
      <details><summary>Reset bracket</summary><p class="hint">This clears all Swiss results and returns to team setup.</p><button id="swissClear">Clear Swiss bracket</button><span id="swissClearConfirm"></span></details>`;
    document.getElementById('swissRound').onchange = event => { selectedRound = event.target.value==='live'?null:Number(event.target.value);render(cache,true); };
    document.getElementById('swissParseDiscord').onclick = () => showParseDiscordModal();
    body.querySelectorAll('[data-win]').forEach(button=>button.onclick=()=>result(button.dataset.match,button.dataset.win));
    body.querySelectorAll('[data-clear-result]').forEach(button=>button.onclick=()=>result(button.dataset.clearResult,null));
    document.getElementById('swissEditNames').onclick = () => {
      editingNames = true;
      document.getElementById('swissNameEditor').innerHTML = namesForm(cache.teams.map(t=>t.name));
      bindNames(false);
    };
    document.getElementById('swissClear').onclick = () => {
      document.getElementById('swissClearConfirm').innerHTML = '<button id="swissConfirmReset">Confirm clear all Swiss results</button>';
      document.getElementById('swissConfirmReset').onclick = async () => {
        if (busy) return;
        busy = true;
        try { const out = await call('/api/swiss/clear');selectedRound=null;render(out.swiss,true);toast('Swiss bracket cleared'); }
        catch (error) { toast(error.message,true); }
        finally { busy = false; }
      };
    };
  }
  document.getElementById('swissShow').onclick = run(async()=>{await save({scene:'swiss',visible:true});toast('Swiss bracket is on Program');});
  document.getElementById('swissExpand').onclick = run(()=>preview.requestFullscreen());
  document.getElementById('swissDownload').onclick = run(async()=>{
    await SwissBracket.update(preview,cache,{view:state?.swissView});
    const url = URL.createObjectURL(new Blob([SwissBracket.serialize(preview)],{type:'image/svg+xml'}));
    const link = document.createElement('a');link.href=url;link.download='Swiss Stage - Updated.svg';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  events.addEventListener('message',event=>{render(JSON.parse(event.data).swiss||null);});
  if (typeof state !== 'undefined' && state) render(state.swiss||null);
  if (location.hash === '#tournament') document.querySelector('nav [data-tab=tournament]').click();
})();
