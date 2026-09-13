// Live team slots on the user's original Swiss-stage SVG artwork.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  // Coordinates follow the supplied artwork at 1920 x 1080.
  const pools = {
    '0-0': { x: [116,260], y: [240,324,408,492,576,660,744,828] },
    '1-0': { x: [433,573], y: [190,273,353,435] },
    '0-1': { x: [433,573], y: [591,673,755,837] },
    '2-0': { x: [734,860], y: [178,263] },
    '1-1': { x: [734,860], y: [421,496,571,647] },
    '0-2': { x: [734,860], y: [798,884] },
    '2-1': { x: [1023,1160], y: [273,363,452] },
    '1-2': { x: [1023,1160], y: [618,708,798] },
    '2-2': { x: [1335,1471], y: [481,571,660] },
  };
  const finish = {
    '3-0': { x: 981, y: [100,145], width: 218 },
    '0-3': { x: 981, y: [957,1004], width: 218 },
    '3-1': { x: 1285, y: [214,278,341], width: 228 },
    '1-3': { x: 1285, y: [841,906,969], width: 228 },
    '3-2': { x: 1626, y: [314,394,474], width: 219 },
    '2-3': { x: 1626, y: [664,744,824], width: 219 },
  };
  let assets;
  const hosts = new WeakMap();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hostState(host) {
    if (!hosts.has(host)) hosts.set(host,{signature:null,view:null,animations:new Set(),camera:0});
    return hosts.get(host);
  }
  function load() {
    return assets ||= Promise.all([
      fetch('/assets/swiss-bracket-template.svg').then(r => { if (!r.ok) throw Error('Swiss artwork could not load'); return r.text(); }),
      fetch('/assets/swiss-bracket-logos.json').then(r => { if (!r.ok) throw Error('Swiss logos could not load'); return r.json(); }),
    ]).catch(error => { assets = null; throw error; });
  }
  function node(tag, attrs = {}, text) {
    const el = document.createElementNS(NS, tag);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const key = name => String(name).trim().toUpperCase();
  function identity(team, logos) {
    return team?.logoId === null ? null : logos.find(l => l.id === team?.logoId || (!team?.logoId && key(l.name) === key(team?.name)));
  }
  function logo(parent, entry, x, y, size) {
    if (!entry) return;
    const [bx,by,w,h] = entry.box, scale = size / Math.max(w,h);
    parent.append(node('use', {
      href: '#' + entry.id,
      transform: `translate(${x-w*scale/2} ${y-h*scale/2}) scale(${scale}) translate(${-bx} ${-by})`,
    }));
  }
  // Keep names editable text in exported SVGs, with at most two fitted lines.
  function label(parent, name, x, y, width, options = {}) {
    const { color = '#fff', size = 13, anchor = 'middle' } = options;
    const words = name.split(/\s+/), lines = [name];
    if (name.length > 14 && words.length > 1) {
      let split = 1, best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0,i).join(' '), b = words.slice(i).join(' ');
        const score = Math.max(a.length,b.length);
        if (score < best) { split = i; best = score; }
      }
      lines.splice(0,1,words.slice(0,split).join(' '),words.slice(split).join(' '));
    }
    lines.forEach((line,i) => {
      const text = node('text', {
        x, y: y + i * (size + 1), fill: color, 'font-family': 'Arial, sans-serif',
        'font-weight': '700', 'font-size': size, 'text-anchor': anchor,
        'data-fit-width': width,
      }, line);
      parent.append(text);
    });
  }
  function finishMotion(state) {
    for (const animation of [...state.animations]) {
      animation.cancel();
      animation.cleanup?.();
    }
    state.animations.clear();
  }
  function effect(state,el,frames,timing,cleanup=()=>{}) {
    const animation=el.animate(frames,{fill:'both',...timing});
    animation.id='swiss-advance';
    animation.cleanup=()=>{cleanup();state.animations.delete(animation);};
    animation.onfinish=()=>{animation.cleanup();animation.cancel();};
    animation.oncancel=()=>animation.cleanup();
    state.animations.add(animation);
    return animation;
  }
  function pulse(state,slot,delay=0) {
    effect(state,slot,[{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:700,delay,easing:'ease-out'});
  }
  function draw(svg, swiss, logos, state) {
    finishMotion(state);
    const previous = new Map(), previousTeams = new Map();
    svg.querySelectorAll('[data-swiss-live] [data-slot]').forEach(slot=>{
      const item={node:slot,x:Number(slot.dataset.x),y:Number(slot.dataset.y),result:slot.dataset.result};
      previous.set(slot.dataset.slot,item);
      if (slot.closest('[data-match-id]')) previousTeams.set(slot.dataset.team,item);
    });
    svg.querySelector('[data-swiss-live]')?.remove();
    svg.querySelector('[data-swiss-motion]')?.remove();
    const live = node('g', { 'data-swiss-live': '', transform: 'scale(.8)' });
    svg.append(live);
    if (!swiss) return;
    const animate = previous.size>0&&!reducedMotion(), arrivals=[],wins=[];
    function transition(slot) {
      if (!animate) return;
      const old=previous.get(slot.dataset.slot);
      if (old) {
        if (slot.dataset.result==='win'&&old.result!=='win') wins.push(slot);
      } else {
        const from=previousTeams.get(slot.dataset.team);
        if (from) arrivals.push({slot,from});
      }
    }
    const teams = new Map(swiss.teams.map(t => [t.name,t]));
    const indices = {};
    for (const round of swiss.rounds) for (const match of round.matches) {
      const pool = pools[match.pool], index = indices[match.pool] || 0;
      indices[match.pool] = index + 1;
      if (!pool || pool.y[index] === undefined) continue;
      const group = node('g', { 'data-match-id': match.id, 'data-pool': match.pool });
      group.append(node('title', {}, `${match.id}: ${match.blue} vs ${match.red}${match.winner ? ' — ' + match[match.winner] + ' wins' : ''}`));
      for (const [i,side] of ['blue','red'].entries()) {
        const x = pool.x[i], y = pool.y[index], team = teams.get(match[side]), entry = identity(team, logos);
        const won = match.winner === side, lost = match.winner && !won;
        const compact=match.pool==='1-1', multiline=match[side].length>14&&match[side].includes(' ');
        const size=72, logoY=y+4;
        const slot = node('g', { 'data-slot':match.id+'/'+side,'data-x':x,'data-y':logoY,'data-side': side, 'data-team': match[side], 'data-result': won ? 'win' : lost ? 'loss' : 'pending', opacity: lost ? '.68' : '1' });
        if (won) slot.append(node('circle', { cx: x, cy: logoY, r: size/2+3, fill: '#0003', stroke: '#ffcc38', 'stroke-width': '2' }));
        logo(slot, entry, x, logoY, size);
        group.append(slot);
        transition(slot);
      }
      live.append(group);
    }
    // Keep teams in the outcome box for the record on which they finished.
    for (const [record,box] of Object.entries(finish)) {
      const finished = swiss.teams.filter(t => `${t.w}-${t.l}` === record && t.status !== 'alive');
      const group = node('g', { 'data-finish': record });
      const isVertical = record === '3-2' || record === '2-3';
      
      if (isVertical) {
        // Vertical layout for 3-2 and 2-3
        const logoSize = 80;
        const centerX = box.x + box.width / 2;
        finished.forEach((team,i) => {
          if (box.y[i] === undefined) return;
          const row = node('g', { 'data-slot':'finish/'+record+'/'+team.name,'data-team':team.name,'data-x':centerX,'data-y':box.y[i],'data-result':team.status }), entry = identity(team,logos);
          logo(row, entry, centerX, box.y[i], logoSize);
          group.append(row);
          transition(row);
        });
      } else {
        // Horizontal layout for 3-0, 0-3, 3-1, 1-3
        const logoSize = finished.length <= 2 ? 90 : 72;
        const spacing = finished.length <= 2 ? 100 : 74;
        const totalWidth = finished.length * spacing;
        const startX = box.x + (box.width - totalWidth) / 2 + logoSize / 2;
        const centerY = box.y[0] + (box.y.length > 1 ? (box.y[box.y.length-1] - box.y[0]) : 0) / 2;
        finished.forEach((team,i) => {
          const row = node('g', { 'data-slot':'finish/'+record+'/'+team.name,'data-team':team.name,'data-x':startX+i*spacing,'data-y':centerY,'data-result':team.status }), entry = identity(team,logos);
          logo(row, entry, startX+i*spacing, centerY, logoSize);
          group.append(row);
          transition(row);
        });
      }
      live.append(group);
    }
    live.querySelectorAll('[data-fit-width]').forEach(text => {
      const width = Number(text.dataset.fitWidth);
      // getComputedTextLength is available even when the panel's tab is hidden.
      if (text.getComputedTextLength() > width) {
        text.setAttribute('textLength', width);
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
    wins.forEach(slot=>pulse(state,slot));
    if (arrivals.length) {
      const motion=node('g',{'data-swiss-motion':'',transform:'scale(.8)','aria-hidden':'true','pointer-events':'none'});
      svg.append(motion);
      arrivals.forEach(({slot,from},index)=>{
        const flight=slot.cloneNode(true);
        for (const attr of [...flight.attributes]) if (attr.name.startsWith('data-')) flight.removeAttribute(attr.name);
        flight.setAttribute('data-swiss-flight','');
        flight.style.transformOrigin='0 0';
        flight.style.transformBox='view-box';
        const dx=from.x-Number(slot.dataset.x),dy=from.y-Number(slot.dataset.y);
        slot.style.opacity='0';motion.append(flight);
        effect(state,flight,[
          {transform:`translate(${dx}px,${dy}px)`,opacity:.8},
          {transform:'translate(0px,0px)',opacity:1},
        ],{duration:1050,delay:Math.min(index*65,650),easing:'cubic-bezier(.22,.75,.18,1)'},()=>{
          slot.style.removeProperty('opacity');flight.remove();
          if (!motion.children.length) motion.remove();
        });
      });
    }
  }
  function camera(host,svg,id,state) {
    if (state.view===id) return;
    const target=SwissView.box(id),from=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    cancelAnimationFrame(state.camera);
    const animated=state.view!==null&&!reducedMotion();
    state.view=id;host.dataset.view=id;
    if (!animated) {svg.setAttribute('viewBox',target.join(' '));delete host.dataset.camera;return;}
    host.dataset.camera='moving';
    const start=performance.now();
    function frame(now) {
      const progress=Math.min(1,(now-start)/650),ease=1-Math.pow(1-progress,3);
      svg.setAttribute('viewBox',from.map((value,i)=>value+(target[i]-value)*ease).join(' '));
      if(progress<1) state.camera=requestAnimationFrame(frame);
      else {state.camera=0;delete host.dataset.camera;}
    }
    state.camera=requestAnimationFrame(frame);
  }
  // Ambient screen-space fire effects for the stage: a flickering flame wall and heat wash rise
  // from the floor, fire columns periodically surge, and sparks race upward. The layer lives in
  // the host (not the SVG), so it stays fixed while the bracket camera zooms.
  function fx() {
    const tones = [['#ffdf8e','#ff9a3c'],['#ff9a3c','#ff5e3a'],['#ffb84d','#ff5e3a'],['#ffce63','#ff7a2e']];
    const layer = document.createElement('div');
    layer.className = 'swiss-fx';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML =
      '<div class="fx-heat"></div>' +
      '<div class="fx-flame one"></div><div class="fx-flame two"></div><div class="fx-flame three"></div>' +
      '<div class="fx-surge" style="--x:20%;--delay:0s"></div>' +
      '<div class="fx-surge" style="--x:50%;--delay:-2.4s"></div>' +
      '<div class="fx-surge" style="--x:80%;--delay:-4.8s"></div>' +
      Array.from({length:28},(_,i)=>{
        const [c1,c2]=tones[i%4];
        return `<i class="fx-spark" style="--x:${(i*3.5+1.2).toFixed(1)}%;--size:${3+(i%5)}px;--duration:${5+i%7}s;--delay:-${(i*.62).toFixed(1)}s;--drift:${(i%2?1:-1)*(30+(i%4)*22)}px;--c1:${c1};--c2:${c2}"></i>`;
      }).join('');
    return layer;
  }
  async function update(host, swiss, options={}) {
    const request = {};
    host.swissRequest = request;
    try {
      const [template,logos] = await load();
      if (host.swissRequest !== request) return;
      let svg = host.querySelector(':scope > svg');
      const state=hostState(host);
      if (!svg) {
        const doc = new DOMParser().parseFromString(template, 'image/svg+xml');
        svg = document.importNode(doc.documentElement,true);
        svg.setAttribute('shape-rendering','geometricPrecision');
        svg.setAttribute('text-rendering','geometricPrecision');
        host.replaceChildren(svg);
        state.signature=null;state.view=null;
      }
      if (!host.querySelector(':scope > .swiss-fx')) host.append(fx());
      const signature=JSON.stringify(swiss);
      if (signature!==state.signature) {draw(svg,swiss,logos,state);state.signature=signature;}
      camera(host,svg,SwissView.valid(options.view)?options.view:'overview',state);
      host.dataset.ready = 'true';
      host.dispatchEvent(new Event('swiss-rendered'));
    } catch (error) {
      if (host.swissRequest === request) { host.dataset.ready = 'error'; host.textContent = error.message; }
      throw error;
    }
  }
  function serialize(host) {
    const svg = host.querySelector(':scope > svg');
    if (!svg || host.dataset.ready !== 'true') throw Error('Wait for the bracket artwork to load');
    const copy=svg.cloneNode(true);
    copy.querySelector('[data-swiss-motion]')?.remove();
    copy.querySelectorAll('[data-slot]').forEach(slot=>slot.style.removeProperty('opacity'));
    copy.setAttribute('viewBox','0 0 1536 864');
    copy.setAttribute('width','3840');copy.setAttribute('height','2160');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy);
  }
  window.SwissBracket = { update, serialize, load };
})();
