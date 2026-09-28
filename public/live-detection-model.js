(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LiveDetectionModel=api;})(globalThis,()=>{
  // Coordinates are normalized independently to the capture's width and height.
  const box=(field,x,y,w,h,sw,sh)=>({field,x:x/sw*1920,y:y/sh*1080,w:w/sw*1920,h:h/sh*1080});
  const game=[['gameTime',741,2,66,32],['blue.kills',688,2,29,33],['red.kills',828,2,29,33],['blue.gold',597,5,62,28],['red.gold',913,5,62,28],['blue.turtle',503,5,23,28],['blue.turrets',535,5,23,28],['red.turrets',1008,5,23,28],['red.turtle',1037,5,23,28]].map(a=>box(...a,1543,856));
  for(const side of ['blue','red'])for(let i=0;i<5;i++){
    game.push(box(`${side}.players.${i}.name`,side==='blue'?5:1409,274+i*72,130,21,1543,856));
    game.push(box(`${side}.players.${i}.kda`,side==='blue'?67:1437,295+i*72,39,17,1543,856));
    game.push(box(`${side}.players.${i}.level`,side==='blue'?5:1522,321+i*72,16,16,1543,856));
    game.push(box(`${side}.players.${i}.hero`,side==='blue'?9:1497,299+i*72,37,34,1543,856));
  }
  const legacyGame=structuredClone(game);
  const spectator = {
    'gameTime': [915, 38, 90, 42],
    'blue.kills': [840, 38, 68, 44],
    'red.kills': [1012, 38, 68, 44],
    'blue.gold': [742, 40, 85, 40],
    'red.gold': [1092, 40, 85, 40],
    'blue.turrets': [672, 40, 32, 40],
    'blue.turtle': [640, 40, 32, 40],
    'red.turrets': [1216, 40, 32, 40],
    'red.turtle': [1248, 40, 32, 40]
  };
  for (const r of game) {
    let coords = spectator[r.field];
    if (r.field.includes('.players.')) {
      const [side,, index, key] = r.field.split('.'), red = side === 'red', i = Number(index);
      const yBase = Math.round(380 + i * 75.5);
      const rects = {
        name: [red ? 1745 : 10, yBase, 160, 24],
        kda: [red ? 1745 : 72, yBase + 24, 92, 24],
        level: [red ? 1888 : 6, yBase + 52, 26, 22],
        hero: [red ? 1860 : 14, yBase + 10, 46, 46]
      };
      coords = rects[key];
    }
    if (coords) [r.x, r.y, r.w, r.h] = coords;
  }
  const result=[
    {field:'resultStatus',x:725,y:42,w:475,h:100},
    {field:'blue.kills',x:840,y:7,w:60,h:42},
    {field:'red.kills',x:1020,y:7,w:60,h:42},
    {field:'gameTime',x:915,y:7,w:90,h:42}
  ];
  for(const side of ['blue','red'])for(let i=0;i<5;i++){
    const y=232+i*138,red=side==='red';
    result.push({field:`${side}.players.${i}.name`,x:red?1330:340,y,w:red?240:245,h:34});
    result.push({field:`${side}.players.${i}.kda`,x:red?1175:590,y,w:145,h:34});
    result.push({field:`${side}.players.${i}.gold`,x:red?1080:745,y,w:red?85:90,h:34});
    result.push({field:`${side}.players.${i}.hero`,x:red?1625:200,y:y-4,w:90,h:90});
  }
  // Clean 1920 x 1080 draft feed, calibrated against the supplied recording.
  // Red bans fill from the right edge inward; slots are stored in ban order.
  const draft=[{field:'draftPhase',x:755,y:8,w:415,h:43},{field:'draftTimer.remaining',x:880,y:54,w:164,h:75}];
  for(const side of ['blue','red'])for(let i=0;i<5;i++){
    draft.push({field:`${side}.players.${i}.hero`,x:side==='blue'?60:1746,y:145+i*172,w:114,h:114});
    draft.push({field:`${side}.players.${i}.name`,x:side==='blue'?10:1620,y:260+i*172,w:290,h:32});
    draft.push({field:`${side}.bans.${i}`,x:side==='blue'?42+i*110:1826-i*110,y:18,w:54,h:54});
  }
  const profiles={game,result,draft};
  const fields=new Set(Object.values(profiles).flat().map(r=>r.field));
  const isHero=field=>/\.hero$|\.bans\./.test(field);
  function validateRegions(rows,mode){
    const allowed=new Set(profiles[mode]?.map(r=>r.field));
    if(!allowed.size||!Array.isArray(rows)||!rows.length||rows.length>60||new Set(rows.map(r=>r.field)).size!==rows.length)throw Error('Invalid live capture regions');
    for(const r of rows)if(!allowed.has(r.field)||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<1||r.h<1||r.x+r.w>1920.01||r.y+r.h>1080.01)throw Error('Invalid capture region: '+r.field);
    const anchor=mode==='result'?'resultStatus':mode==='draft'?'draftPhase':'gameTime';if(!rows.some(r=>r.field===anchor))throw Error('Keep the scene-detection region');
    return rows;
  }
  function resultOutcome(text){const s=String(text||'').trim().replace(/\s+/g,' ');if(/victory|clean/i.test(s))return 'blue';if(/defeat/i.test(s))return 'red';return null;}
  function draftPhase(text){const s=String(text).trim().replace(/\s+/g,' ');const m=s.match(/^(Allied|Enemy) Team (Ban|Pick)$/i);return m?`${/^allied$/i.test(m[1])?'Allied':'Enemy'} Team ${/^ban$/i.test(m[2])?'Ban':'Pick'}`:/^(Last (?:Change|Changes)|Battle Preparation|Adjust(?:ment)?|Swap Heroes)$/i.test(s)?'Last Changes':null;}
  function draftClock(text){const s=String(text).trim().replace(/[Oo]/g,'0').replace(/\s/g,'');if(/^00:[0-5]\d$/.test(s))return Number(s.slice(3));return /^\d{1,2}$/.test(s)&&Number(s)<=60?Number(s):null;}
  // Ban/Pick phases always display a countdown. The settling phases
  // (Last Changes, Battle Preparation, Swap Heroes) display none at all.
  const DRAFT_TIMER_PHASE=/Team (?:Ban|Pick)$/i;
  const phaseHasCountdown=phase=>DRAFT_TIMER_PHASE.test(String(phase||''));
  function classify(readings,threshold=65){
    const good=(field)=>readings.find(r=>r.field===field&&r.value!==null&&r.confidence>=threshold);
    const phase=good('draftPhase');
    if(phase){
      const parsed=draftPhase(phase.value);
      // A countdown is only demanded where one is actually drawn. Requiring it
      // during Last Changes / Battle Preparation / Swap Heroes dropped the desk
      // out of draft mode for the whole settling phase, because those screens
      // show no timer. These exact headings never appear in gameplay, so
      // requiring the phase alone is safe.
      if(parsed&&(phaseHasCountdown(parsed)?!!good('draftTimer.remaining'):true))return 'draft';
    }
    const outcome=good('resultStatus');if(outcome&&resultOutcome(outcome.value))return 'result';
    const g=good('gameTime');
    if(g&&/^\d{1,3}:[0-5]\d$/.test(g.value)&&(good('blue.kills')||good('red.kills')))return 'game';
    return null;
  }
  function sceneGate(required=2){let candidate=null,count=0;return {reset(){candidate=null;count=0;},observe(mode){if(!mode){candidate=null;count=0;return null;}count=candidate===mode?count+1:1;candidate=mode;return count>=required?mode:null;}};}
  const nameKey=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  function spectatorHero(name,heroes){
    const match=String(name||'').match(/^\[Computer\]\s*(.+)$/i);
    return match?heroes.find(h=>nameKey(h.name)===nameKey(match[1]))?.name||null:null;
  }
  // Spectator rail order can differ from draft order. Never attach KDA to a
  // populated roster by its row number alone.
  function playerIndex(players,identity,row){
    const hero=identity.hero,known=hero?players.map((p,i)=>p.hero===hero?i:-1).filter(i=>i>=0):[];
    if(known.length===1)return known[0];
    const key=nameKey(identity.name||'');
    if(key.length>=4){const matches=players.map((p,i)=>{const n=nameKey(p.name);return n.length>=4&&(n===key||n.endsWith(key)||key.endsWith(n))?i:-1;}).filter(i=>i>=0);if(matches.length===1)return matches[0];}
    if(!players[row].hero&&/^Player [1-5]$/.test(players[row].name)&&(hero||key.length>=4))return row;
    return null;
  }
  return {profiles,legacyGame,fields,isHero,validateRegions,resultOutcome,draftPhase,draftClock,classify,phaseHasCountdown,sceneGate,playerIndex,spectatorHero};
});
