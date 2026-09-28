/* Edit the saved result without running another scan or reporting another playoff win. */
(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'matchResultEditor';
  dialog.className = 'match-result-dialog';
  dialog.setAttribute('aria-labelledby', 'matchResultTitle');
  dialog.innerHTML = `<form>
    <div class="result-editor-heading"><h2 id="matchResultTitle">Edit match result</h2>
      <p>Correct the current result. Save updates Program, OBS and connected laptops.</p></div>
    <div id="matchResultFields" class="result-editor-body"></div>
    <div class="result-editor-footer"><span id="matchResultStatus" role="status">Changes stay here until you save.</span>
      <button type="button" id="cancelMatchResult">Cancel</button>
      <button type="submit" class="primary" id="saveMatchResult">Save match result</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const body = dialog.querySelector('#matchResultFields');
  const status = dialog.querySelector('#matchResultStatus');
  let catalog, initialValues, busy = false, opening = false;

  for (const [id, parent] of [['editMatchResult', '.previewfoot'], ['editCurrentMatchResult', '#data > .twogrid']]) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = 'Edit match result';
    button.className = 'primary';
    button.onclick = run(() => open());
    if (id === 'editCurrentMatchResult') {
      const bar = document.createElement('div');
      bar.className = 'result-editor-launch';
      bar.append(button, document.createTextNode('Edit the saved result without another scan.'));
      document.querySelector(parent).before(bar);
    } else document.querySelector(parent).prepend(button);
  }

  const key = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // An empty value means "none": key('') is '', which would otherwise match the
  // first catalog entry whose name is blank and clear a slot with junk.
  const find = (kind, value) => (value === undefined || value === null || value === '') ? null : (catalog[kind] || []).find(entry =>
    String(entry.id ?? entry.gameId) === String(value) || key(entry.name) === key(value) ||
    (entry.aliases || []).some(alias => key(alias) === key(value)));
  const assetValue = (kind, value) => {
    const entry = value && typeof value === 'object'
      ? find(kind, value.id ?? value.name) || find(kind, value.name)
      : find(kind, value);
    return entry ? String(kind === 'heroes' ? entry.name : entry.id) : String(value?.name ?? value ?? '');
  };
  const options = entries => entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  function field(path, label, value, settings = {}) {
    const attrs = `data-result-field="${esc(path)}" aria-label="${esc(label)}"`;
    let control;
    if (settings.options) {
      const choices = [...settings.options];
      if (!choices.some(([v]) => String(v) === String(value))) choices.push([value, `Current: ${value}`]);
      control = `<select ${attrs}${settings.kind ? ` data-result-asset="${settings.kind}"` : ''}>${options(choices)}</select>`;
    } else {
      control = `<input ${attrs} type="${settings.number ? 'number' : 'text'}" value="${esc(value)}"${settings.number ? ` min="${settings.min ?? 0}" step="1" required` : ''}${settings.max !== undefined ? ` max="${settings.max}"` : ''}${settings.pattern ? ` pattern="${settings.pattern}" title="${esc(settings.title)}" required` : ''}>`;
    }
    return `<label class="result-field">${esc(label)}${settings.kind ? `<span class="result-asset-field"><img alt="" hidden>${control}</span>` : control}</label>`;
  }
  function asset(path, label, kind, value) {
    const choices = [['', 'None / unknown'], ...(catalog[kind] || []).map(entry => [String(kind === 'heroes' ? entry.name : entry.id), entry.name])];
    return field(path, label, assetValue(kind, value), {kind, options: choices});
  }
  function player(side, p, index) {
    const path = `${side}.players.${index}`;
    const talents = p.talents ?? p.emblems?.slice(1) ?? [];
    return `<details class="result-player" data-result-player="${side}.${index}">
      <summary>Player ${index + 1} <b>${esc(p.name)}</b><span>${esc(p.hero || 'No hero')} · ${esc(p.kda)}</span></summary>
      <div class="result-player-fields"><div class="result-fields">
        ${field(`${path}.name`, 'Player name', p.name)}
        ${asset(`${path}.hero`, 'Hero', 'heroes', p.hero || p.heroId || '')}
        ${field(`${path}.role`, 'Role', p.role, {options: ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'].map(v => [v, v])})}
        ${field(`${path}.kda`, 'K/D/A', p.kda, {pattern: '[0-9]+/[0-9]+/[0-9]+', title: 'Use kills/deaths/assists, for example 8/1/6'})}
        ${field(`${path}.gold`, 'Player gold', p.gold, {number: true})}
        ${field(`${path}.level`, 'Level (0 = unknown)', p.level ?? 0, {number: true, max: 15})}
      </div><h4>Equipment</h4><div class="result-fields result-equipment">
        ${Array.from({length: 6}, (_, i) => asset(`${path}.items.${i}`, `Item ${i + 1}`, 'items', p.items?.[i])).join('')}
      </div><h4>Spell and emblems</h4><div class="result-fields">
        ${asset(`${path}.spell`, 'Battle spell', 'spells', p.spell ?? p.battleSpell)}
        ${asset(`${path}.emblem`, 'Main emblem', 'emblems', p.emblem ?? p.emblems?.[0])}
        ${Array.from({length: 3}, (_, i) => asset(`${path}.talents.${i}`, `Talent ${i + 1}`, 'emblems', talents[i])).join('')}
      </div></div></details>`;
  }
  function team(side, t) {
    const logos = [['', 'Team initials'], ...(organizationLogos.length ? organizationLogos : catalog.logos || []).map(l => [l.url, l.name])];
    return `<fieldset class="result-team ${side}"><legend>${side === 'blue' ? 'Blue' : 'Red'} side</legend>
      <div class="result-fields">${field(`${side}.name`, 'Team name', t.name)}${field(`${side}.tag`, 'Team tag', t.tag)}
        ${field(`${side}.logo`, 'Team logo', t.logo, {options: logos})}
        ${['score', 'kills', 'gold', 'turrets', 'lord'].map(k => field(`${side}.${k}`, {score: 'Series wins', kills: 'Team kills', gold: 'Team gold', turrets: 'Turrets', lord: 'Lord'}[k], t[k], {number: true})).join('')}
      </div><h3>Players</h3>${t.players.map((p, i) => player(side, p, i)).join('')}</fieldset>`;
  }
  function previewAsset(select) {
    const entry = find(select.dataset.resultAsset, select.value);
    const image = select.parentElement.querySelector('img');
    const src = entry?.face || entry?.icon || entry?.img;
    image.hidden = !src;
    if (src) image.src = src;
    else image.removeAttribute('src');
  }

  async function open(path) {
    if (busy || opening) return;
    opening = true;
    try {
      catalog ||= await api('/assets/catalog.json');
      await saveQueue.catch(() => {});
      const current = await api('/api/state');
      body.innerHTML = `<div class="result-fields result-match-fields">
        ${field('winner', 'Winner', current.winner, {options: [['blue', `Blue · ${current.blue.tag}`], ['red', `Red · ${current.red.tag}`]]})}
        ${field('gameTime', 'Game time', current.gameTime, {pattern: '[0-9]{1,3}:[0-5][0-9]', title: 'Use minutes:seconds, for example 14:32'})}
        ${field('bestOf', 'Series format', current.bestOf, {options: [[3, 'Best of 3'], [5, 'Best of 5'], [7, 'Best of 7']]})}
        ${field('game', 'Game number', current.game, {number: true, min: 1, max: current.bestOf})}
      </div><p class="hint">Expand a player to correct their hero, stats and icons. None / unknown leaves an icon empty. Team totals are edited separately.</p>
      <div class="result-team-grid">${team('blue', current.blue)}${team('red', current.red)}</div>`;
      // Select values cannot be assigned until the options are mounted.
      body.querySelectorAll('select[data-result-field]').forEach(select => {
        const parts = select.dataset.resultField.split('.');
        let value = at(current, select.dataset.resultField);
        if (parts[1] === 'players') {
          const p = current[parts[0]].players[parts[2]];
          if (parts[3] === 'hero') value = p.hero || p.heroId || '';
          if (parts[3] === 'spell') value = p.spell ?? p.battleSpell;
          if (parts[3] === 'emblem') value = p.emblem ?? p.emblems?.[0];
          if (parts[3] === 'talents') value = (p.talents ?? p.emblems?.slice(1))?.[parts[4]];
        }
        select.value = select.dataset.resultAsset ? assetValue(select.dataset.resultAsset, value) : String(value);
        if (select.dataset.resultAsset) previewAsset(select);
      });
      initialValues = new Map([...body.querySelectorAll('[data-result-field]')].map(input => [input.dataset.resultField, input.value]));
      status.textContent = 'Changes stay here until you save.';
      if (!dialog.open) dialog.showModal();
      const target = [...body.querySelectorAll('[data-result-field]')].find(input => input.dataset.resultField === path);
      if (target) {
        const details = target.closest('details');
        if (details) details.open = true;
        target.focus();
        target.scrollIntoView({block: 'center'});
      } else body.scrollTop = 0;
    } finally { opening = false; }
  }
  window.MatchResultEditor = {open};

  body.addEventListener('input', e => {
    if (e.target.matches('[data-result-asset]')) previewAsset(e.target);
    if (e.target.dataset.resultField === 'bestOf') {
      const game = body.querySelector('[data-result-field="game"]');
      game.max = e.target.value;
    }
    status.textContent = 'Unsaved changes';
  });
  $('#cancelMatchResult').onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const changes = [...body.querySelectorAll('[data-result-field]')].filter(input => input.value !== initialValues.get(input.dataset.resultField));
    if (!changes.length) { dialog.close(); return; }
    busy = true;
    form.querySelectorAll('input,select,button').forEach(input => input.disabled = true);
    status.textContent = 'Saving match result…';
    try {
      await saveQueue.catch(() => {});
      const latest = await api('/api/state');
      const patch = {};
      for (const input of changes) {
        const [side, section, index, property, slot] = input.dataset.resultField.split('.');
        const value = input.type === 'number' || side === 'bestOf' ? Number(input.value) : input.value;
        if (section === 'players') {
          patch[side] ||= {};
          patch[side].players ||= structuredClone(latest[side].players);
          const p = patch[side].players[index];
          if (property === 'hero') {
            const hero = find('heroes', value);
            p.hero = hero?.name || '';
            p.heroId = hero?.gameId ?? 0;
            p.heroIcon = hero?.face || hero?.icon || '';
          } else if (property === 'items' || property === 'talents') {
            const count = property === 'items' ? 6 : 3;
            const existing = p[property] ?? (property === 'talents' ? p.emblems?.slice(1) : []);
            p[property] = Array.from({length: count}, (_, i) => existing?.[i] ?? (property === 'items' ? null : ''));
            const item = property === 'items' ? find('items', value) : null;
            p[property][slot] = property === 'items' ? (item ? {id: item.id, name: item.name, icon: item.icon} : null) : value;
          } else p[property] = value;
        } else if (section) {
          patch[side] ||= {};
          patch[side][section] = value;
        } else patch[side] = value;
      }
      await save(patch);
      dialog.close();
      toast('Match result saved — synced to Program and OBS');
    } catch (error) {
      status.textContent = `Could not save: ${error.message}`;
    } finally {
      busy = false;
      form.querySelectorAll('input,select,button').forEach(input => input.disabled = false);
    }
  });
})();
