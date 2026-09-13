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
      pendingResults.map(p => `<span class="swiss-pending-item">${esc(p.blueSide)} vs ${esc(p.redSide)} · ${esc(p.status)}</span>`).join(' ');
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
          await result(data.swissMatchId, data.winnerSide);
          pendingResults.splice(pendingResults.indexOf(entry), 1);
          toast(`✅ ${data.winnerTeam} wins ${data.swissMatchId} (auto-applied)`);
        } catch (error) {
          // Match already decided, bad paste, or fetch failure: drop it and surface the reason
          if (/already has a result|No Swiss match found|Could not map/i.test(error.message)) {
            toast(`${entry.blueSide} vs ${entry.redSide}: ${error.message}`, true);
            pendingResults.splice(pendingResults.indexOf(entry), 1);
          }
        }
      }
    } finally {
      pollRunning = false;
      renderPendingBar();
    }
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
        <p class="hint">Paste the match data from the MATCH-DATA Discord channel. It polls in the background until the game ends, then auto-applies the winner. You can close this window and paste more matches anytime.</p>
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
    let parsedData = null;
    textarea.addEventListener('input', () => {
      const text = textarea.value.trim();
      if (!text) { preview.style.display='none'; submitBtn.disabled=true; parsedData=null; return; }
      const idMatch = text.match(/(?:GameID|BattleID|ID):\s*([a-zA-Z0-9_-]+)/i);
      const redSideMatch = text.match(/Red side:\s*(.+)/i);
      const blueSideMatch = text.match(/Blue side:\s*(.+)/i);
      if (idMatch && redSideMatch && blueSideMatch) {
        parsedData = { battleId: idMatch[1].trim(), redSide: redSideMatch[1].trim(), blueSide: blueSideMatch[1].trim() };
        preview.style.display = 'block';
        preview.innerHTML = `
          <p><strong>BattleID:</strong> ${esc(parsedData.battleId)}</p>
          <p><strong>Red side:</strong> ${esc(parsedData.redSide)}</p>
          <p><strong>Blue side:</strong> ${esc(parsedData.blueSide)}</p>
          <p class="hint">Click "Add to auto-results" — the winner is applied automatically when the match ends.</p>
        `;
        submitBtn.disabled = false;
      } else {
        preview.style.display = 'none';
        submitBtn.disabled = true;
        parsedData = null;
      }
    });
    submitBtn.onclick = () => {
      if (!parsedData) return;
      // Reject duplicate BattleIDs already in the queue
      if (pendingResults.some(p => p.battleId === parsedData.battleId)) {
        toast('That BattleID is already being watched', true);
        return;
      }
      const label = `${parsedData.blueSide} vs ${parsedData.redSide}`;
      pendingResults.push({ ...parsedData, text: textarea.value, addedAt: Date.now(), status: 'waiting…' });
      textarea.value = '';
      preview.style.display = 'none';
      submitBtn.disabled = true;
      parsedData = null;
      toast(`Watching ${label} — result auto-applies when the game ends`);
      renderPendingBar();
      ensurePolling();
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
      <p class="hint">Choose the winning team. Pairings fill the next round when all results in the current round are recorded. Gold marks the winner.</p>
      <div class="buttonrow" style="margin-bottom:12px"><button id="swissParseDiscord" class="primary">📋 Parse Discord Match Data</button></div>
      <div class="swiss-matches">${round.matches.map(m=>`<article class="swiss-match" data-match="${esc(m.id)}">
        <h3>${esc(m.id)} <small>${esc(m.pool)}${m.rematch?' · REMATCH':''}</small></h3>
        ${['blue','red'].map(side=>`<button data-win="${side}" data-match="${esc(m.id)}" class="${m.winner===side?'won':''}" ${locked||m.winner===side?'disabled':''}>${esc(m[side])}${m.winner===side?' ✓':''}</button>`).join('')}
        <div class="swiss-result">${m.winner?esc(m[m.winner])+' wins':'Awaiting result'}</div>
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
