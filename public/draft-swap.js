(() => {
  const preview = new URLSearchParams(location.search).has('preview');
  const control = !!document.querySelector('#teamEditors');
  if (!preview && !control) return;
  let dragged = null;
  if (control) {
    const bar = document.createElement('p');
    bar.innerHTML = '<label>Draft drag behavior <select id="draftSwapMode"><option value="player">Swap player name + hero together</option><option value="hero">Swap heroes only (keep player names)</option></select></label> <button id="resetDraft" type="button">Reset draft picks &amp; bans</button> <button id="resetHud" type="button">Reset in-game HUD</button><small>Drag a starting-five row or a hero card in the Program monitor onto another slot on the same team.</small>';
    document.querySelector('#teamEditors').before(bar);
    document.querySelector('#showPlayerCameras').onclick = run(() => save({scene:'cameras'}));
    document.querySelector('#cameraBack').onclick = run(() => save({scene:'draft'}));
    // Clear only the draft picks and bans; keeps player names, tags and scores.
    document.querySelector('#resetDraft').onclick = run(async () => {
      const clearSide = side => ({
        bans: ['', '', '', '', ''],
        players: structuredClone(state[side].players).map(p => ({ ...p, hero: '' })),
      });
      await save({ blue: clearSide('blue'), red: clearSide('red'), phase: 'BAN PHASE' });
      toast('Draft picks and bans reset');
    });
    // Reset live match stats: team objectives and every player's KDA/gold/level.
    document.querySelector('#resetHud').onclick = run(async () => {
      const clearSide = side => ({
        kills: 0, gold: 0, turrets: 0, lord: 0,
        players: structuredClone(state[side].players).map(p => ({ ...p, kda: '0/0/0', gold: 0, level: 0 })),
      });
      await save({
        blue: clearSide('blue'), red: clearSide('red'),
        gameTime: '00:00', gameClock: { running: false, seconds: 0, syncedAt: Date.now() },
      });
      toast('In-game HUD reset');
    });
  }
  function slots() {
    document.querySelectorAll('[data-draft-slot]').forEach(el => {
      el.draggable = true;
      el.ondragstart = e => { dragged = el.dataset.draftSlot; e.dataTransfer.setData('text/plain', dragged); e.dataTransfer.effectAllowed = 'move'; };
      el.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
      el.ondrop = e => {
        e.preventDefault(); e.stopPropagation();
        const from = dragged || e.dataTransfer.getData('text/plain'), to = el.dataset.draftSlot;
        if (preview) parent.postMessage({type:'draft-swap',from,to}, location.origin);
        else swap(from,to);
        dragged = null;
      };
    });
  }
  const swap = async (from,to) => {
    if (!/^(blue|red)\.[0-4]$/.test(from) || !/^(blue|red)\.[0-4]$/.test(to) || from === to) return;
    const [side,a] = from.split('.'), [other,b] = to.split('.');
    if (side !== other) { toast('Swap slots within the same team.',true); return; }
    await run(async () => {
      const players = structuredClone(state[side].players);
      if (document.querySelector('#draftSwapMode').value === 'hero') [players[a].hero,players[b].hero] = [players[b].hero,players[a].hero];
      else [players[a],players[b]] = [players[b],players[a]];
      await save({[side]:{players}});
      toast('Draft slots swapped');
    })();
  };
  if (control) addEventListener('message',e => {
    if (e.origin !== location.origin || ![...document.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source) || e.data?.type !== 'draft-swap') return;
    swap(e.data.from,e.data.to);
  });
  new MutationObserver(slots).observe(document.querySelector(control?'#teamEditors':'#stage'),{childList:true,subtree:true});
  slots();
})();
