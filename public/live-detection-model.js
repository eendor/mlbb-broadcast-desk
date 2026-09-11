(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LiveDetectionModel=api;})(globalThis,()=>{
  // Coordinates are normalized independently to the capture's width and height.
  const box=(field,x,y,w,h,sw,sh)=>({field,x:x/sw*1920,y:y/sh*1080,w:w/sw*1920,h:h/sh*1080});
  const game=[['gameTime',741,2,66,32],['blue.kills',688,2,29,33],['red.kills',828,2,29,33],['blue.gold',597,5,62,28],['red.gold',913,5,62,28],['blue.turrets',535,5,23,28],['red.turrets',1008,5,23,28]].map(a=>box(...a,1543,856));
  for(const side of ['blue','red'])for(let i=0;i<5;i++){
    game.push(box(`${side}.players.${i}.name`,side==='blue'?5:1409,274+i*72,130,21,1543,856));
    game.push(box(`${side}.players.${i}.kda`,side==='blue'?67:1437,295+i*72,39,17,1543,856));
    game.push(box(`${side}.players.${i}.level`,side==='blue'?5:1522,321+i*72,16,16,1543,856));
    game.push(box(`${side}.players.${i}.hero`,side==='blue'?9:1497,299+i*72,37,34,1543,856));
  }
  const legacyGame=structuredClone(game);
  const spectator={gameTime:[921,10,80,33],'blue.kills':[844,9,61,39],'red.kills':[1022,9,61,39],'blue.gold':[744,12,82,33],'red.gold':[1137,12,78,33],'blue.turrets':[671,12,25,32],'red.turrets':[1257,12,23,32]};
  for(const r of game){
    let coords=spectator[r.field];
    if(r.field.includes('.players.')){
      const [side,,index,key]=r.field.split('.'),red=side==='red';
      const rects={name:[red?1722:6,347,194,23],kda:[red?1781:82,370,66,25],level:[red?1895:7,402,19,21],hero:[red?1864:24,384,36,34]};
      coords=[...rects[key]];coords[1]+=Number(index)*90;
    }
    [r.x,r.y,r.w,r.h]=coords;
  }
  const result=[
    {field:'resultStatus',x:725,y:42,w:475,h:100},
    {field:'blue.kills',x:535,y:48,w:140,h:100},
    {field:'red.kills',x:1255,y:48,w:145,h:100},
    {field:'gameTime',x:1510,y:112,w:95,h:42}
  ];
  for(const side of ['blue','red'])for(let i=0;i<5;i++){
    const y=245+i*140,red=side==='red';
    result.push({field:`${side}.players.${i}.name`,x:red?1340:340,y,w:270,h:40});
    result.push({field:`${side}.players.${i}.kda`,x:red?1200:590,y,w:140,h:40});
    result.push({field:`${side}.players.${i}.gold`,x:red?1100:740,y,w:110,h:40});
  }
  const profiles={game,result};
  const fields=new Set([...game,...result].map(r=>r.field));
  const isHero=field=>/\.hero$|\.bans\./.test(field);
  function validateRegions(rows,mode){
    const allowed=new Set(profiles[mode]?.map(r=>r.field));
    if(!allowed.size||!Array.isArray(rows)||!rows.length||rows.length>60||new Set(rows.map(r=>r.field)).size!==rows.length)throw Error('Invalid live capture regions');
    for(const r of rows)if(!allowed.has(r.field)||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<1||r.h<1||r.x+r.w>1920.01||r.y+r.h>1080.01)throw Error('Invalid capture region: '+r.field);
    const anchor=mode==='result'?'resultStatus':'gameTime';if(!rows.some(r=>r.field===anchor))throw Error('Keep the scene-detection region');
    return rows;
  }
  function resultOutcome(text){const s=String(text).trim().replace(/\s+/g,' ');if(/victory/i.test(s))return 'blue';if(/defeat/i.test(s))return 'red';return null;}
  function classify(readings,threshold=65){
    const good=(field)=>readings.find(r=>r.field===field&&r.value!==null&&r.confidence>=threshold);
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
  return {profiles,legacyGame,fields,isHero,validateRegions,resultOutcome,classify,sceneGate,playerIndex,spectatorHero};
});
