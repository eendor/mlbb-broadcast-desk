// The small local LSTM reads changing numbers independently of vision requests.
// Both writers share one session; the server rejects older fields individually.
window.NeuralHud = (() => {
  const fields = ['gameTime', 'blue.kills', 'red.kills', 'blue.gold', 'red.gold', 'blue.turrets', 'red.turrets'];
  function start({ getSource, getPool, session, current, read, regions, post, options, onUpdate, onMode }) {
    let stopped = false, mode = null, lastProbe = 0, lastClock = null, lastSeen = 0, held = true;
    const gate = LiveDetectionModel.sceneGate(2), stable = OCRRuntime.stability(), accepted = new Map();
    const valid = () => !stopped && current();
    const scheduler = OCRRuntime.scheduler(cycle);
    const controller = new AbortController();
    let portraits = null;
    const send = (url, body) => post(url, body, { signal: controller.signal });
    const health = text => { const el = document.getElementById('aiHudStatus'); if (el) el.textContent = text; };
    async function hold() {
      if (!held && valid()) { held = true; await send('/api/detection/hold', { session }); }
    }
    function readDraftPortraits(frame, sampledAt) {
      if (portraits || typeof HeroRecognition === 'undefined') return;
      const queries = regions('draft').filter(r => LiveDetectionModel.isHero(r.field)).map(r => HeroRecognition.query(frame, r, 'draft'));
      portraits = HeroRecognition.match(queries).then(async matches => {
        if (!valid() || mode !== 'draft' || Date.now() - sampledAt > 2500 || !options().autoApply) return;
        const readings = matches.filter(r => stable.observe('portrait:' + r.field, r.value, 2)).map(({ field, value }) => ({ field, value }));
        if (!readings.length) return;
        const result = await send('/api/detection', { session, mode: 'draft', sampledAt, readings, live: false, switchScene: false, localHud: true });
        if (valid() && mode === 'draft' && !result.expired && !result.stale) onUpdate({ mode: 'draft', patch: result.patch, clockExpiresAt: result.clockExpiresAt, applied: true, sampledAt });
      }).catch(error => { if (valid()) health('Draft portraits: ' + error.message); }).finally(() => { portraits = null; });
    }
    async function cycle() {
      if (!valid()) return;
      const started = performance.now();
      try {
        const pool = (await getPool()).slice(0, 2);
        if (!valid()) return;
        const source = getSource();
        if (!source) { await hold(); health('HUD AI: waiting for capture'); return; }
        const raw = document.createElement('canvas');
        raw.width = source.videoWidth || source.naturalWidth || source.width;
        raw.height = source.videoHeight || source.naturalHeight || source.height;
        if (!raw.width || !raw.height) return;
        raw.getContext('2d').drawImage(source, 0, 0);
        const sampledAt = Date.now(), frame = DraftCapture.normalize(raw), rows = [];
        const probe = !mode || sampledAt - lastProbe >= 1000;
        if (probe) lastProbe = sampledAt;
        let batch = mode === 'draft' ? regions('draft').filter(r => r.field.startsWith('draft'))
          : regions('game').filter(r => fields.includes(r.field));
        if (probe) {
          batch = [...batch, ...regions('draft').filter(r => r.field.startsWith('draft')),
            ...regions('result').filter(r => r.field === 'resultStatus')];
          if (mode === 'draft') batch.push(...regions('game').filter(r => fields.slice(0, 3).includes(r.field)));
        }
        batch = [...new Map(batch.map(r => [r.field, r])).values()];
        await OCRRuntime.parallel(batch, pool, async (worker, region) => {
          const value = await read(worker, region, frame, 75, valid, { fast: true });
          if (value) rows.push(value);
        }, valid);
        if (!valid() || Date.now() - sampledAt > 1800) return;
        const seen = LiveDetectionModel.classify(rows, 75), confirmed = gate.observe(seen);
        if (!seen) {
          if (Date.now() - lastSeen > 1500) await hold();
          health('HUD AI: waiting for readable clock and scores');
          return;
        }
        if (!confirmed) return;
        if (mode !== confirmed) { stable.clear(); accepted.clear(); lastClock = null; mode = confirmed; }
        lastSeen = Date.now();
        onMode(mode);
        if (mode === 'result') { await hold(); health('HUD AI: result screen; reading player table'); return; }
        const config = options(), readings = [];
        if (mode === 'draft' && config.autoApply) readDraftPortraits(frame, sampledAt);
        for (const r of rows.filter(r => mode === 'game' ? fields.includes(r.field) : r.field.startsWith('draft'))) {
          const clock = r.field === 'gameTime' || r.field === 'draftTimer.remaining';
          // Gold changes every frame, so identical-value confirmation can starve
          // it indefinitely. Use confidence plus rate-of-change validation.
          const gold = r.field.endsWith('.gold'), required = clock || gold ? 1 : config.confirm;
          const good = r.value !== null && r.confidence >= config.confidence;
          if (!stable.observe(r.field, good ? r.value : null, required)) continue;
          const previous = accepted.get(r.field);
          if (previous && typeof r.value === 'number' && !clock && r.value < previous.value) continue;
          if (gold && previous && OCRRuntime.goldJump(previous.value, r.value, sampledAt - previous.at)) continue;
          readings.push({ field: r.field, value: r.value });
          accepted.set(r.field, { value: r.value, at: sampledAt });
        }
        const clock = readings.find(r => r.field === 'gameTime' || r.field === 'draftTimer.remaining');
        let ticking = config.live && config.smoothClock;
        if (clock) {
          if (!lastClock || lastClock.value !== clock.value) lastClock = { value: clock.value, at: sampledAt };
          else if (sampledAt - lastClock.at >= 1500) ticking = false;
        }
        if (!config.autoApply) { await hold(); health('HUD AI: review mode'); return; }
        if (!readings.length) { if (Date.now() - (lastClock?.at || 0) > 1500) await hold(); return; }
        const delivery = performance.now();
        const result = await send('/api/detection', { session, mode, sampledAt, readings,
          live: ticking, switchScene: config.switchScene, localHud: true });
        if (!valid()) return;
        if (result.expired) { stop(); health('HUD AI: capture session replaced'); return; }
        if (result.stale) return;
        held = false;
        const latency = Math.round(performance.now() - started);
        health(`HUD AI: ${latency} ms · delivery ${Math.round(performance.now() - delivery)} ms`);
        onUpdate({ mode, patch: result.patch, clockExpiresAt: result.clockExpiresAt, applied: true, sampledAt }, latency);
      } catch (error) {
        if (valid()) health('HUD AI: ' + error.message);
      } finally {
        if (valid()) scheduler.schedule(Math.max(40, 200 - (performance.now() - started)));
      }
    }
    function stop() { stopped = true; controller.abort(); scheduler.close(); }
    cycle();
    return { stop };
  }
  return { start };
})();
