/* Game MVP editor: auto-pull a player from live match data, then set photo,
   equipment, emblems and battle spell from the local wiki asset library. */
(()=>{
  let catalog={heroes:[],items:[],emblems:[],spells:[]};
  const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const mvpGet=()=>state?.mvp||{items:['','','','','',''],emblems:['','','',''],spell:''};

  // Datalists shared by the equipment / emblem / spell pickers.
  function ensureDatalists(){
    if($('#mvpItemList'))return;
    const d=document.createElement('div');d.hidden=true;
    d.innerHTML=`<datalist id="mvpItemList"></datalist><datalist id="mvpEmblemList"></datalist><datalist id="mvpSpellList"></datalist>`;
    document.body.append(d);
  }
  function fillDatalists(){
    ensureDatalists();
    $('#mvpItemList').innerHTML=(catalog.items||[]).map(i=>`<option value="${esc(i.name)}">`).join('');
    $('#mvpEmblemList').innerHTML=(catalog.emblems||[]).map(e=>`<option value="${esc(e.name)}">`).join('');
    $('#mvpSpellList').innerHTML=(catalog.spells||[]).map(s=>`<option value="${esc(s.name)}">`).join('');
  }

  function findItem(v){if(!v)return null;return (catalog.items||[]).find(i=>String(i.id)===String(v)||key(i.name)===key(v));}
  function findEmblem(v){if(!v)return null;return (catalog.emblems||[]).find(e=>e.id===key(v)||key(e.name)===key(v));}
  function findSpell(v){if(!v)return null;return (catalog.spells||[]).find(s=>s.id===key(v)||key(s.name)===key(v));}
  function findHero(name){return (catalog.heroes||[]).find(h=>key(h.name)===key(name)||(h.aliases||[]).some(a=>key(a)===key(name)));}

  // A slot = an image thumbnail + a text/datalist input. Editing publishes the array.
  function slot(kind,i,value){
    const icon=kind==='item'?findItem(value)?.icon:kind==='emblem'?findEmblem(value)?.icon:findSpell(value)?.icon;
    const list=kind==='item'?'mvpItemList':kind==='emblem'?'mvpEmblemList':'mvpSpellList';
    return `<div class="mvp-slot"><div class="mvp-slot-icon">${icon?`<img src="${esc(icon)}" alt="">`:'<span>＋</span>'}</div><input data-mvpslot="${kind}.${i}" list="${list}" value="${esc(value||'')}" placeholder="${kind==='item'?'Item '+(i+1):kind==='emblem'?'Emblem '+(i+1):'Spell'}"></div>`;
  }
  function renderSlots(){
    const m=mvpGet();
    if($('#mvpItems'))$('#mvpItems').innerHTML=m.items.map((v,i)=>slot('item',i,v)).join('');
    if($('#mvpEmblems'))$('#mvpEmblems').innerHTML=m.emblems.map((v,i)=>slot('emblem',i,v)).join('');
    if($('#mvpSpell'))$('#mvpSpell').innerHTML=slot('spell',0,m.spell);
    $$('[data-mvpslot]').forEach(el=>el.onchange=run(async()=>{
      const [kind,i]=el.dataset.mvpslot.split('.');
      const m=structuredClone(mvpGet());
      if(kind==='item'){const items=Array.from({length:6},(_,j)=>m.items[j]||'');items[i]=el.value;await save({mvp:{items}});}
      else if(kind==='emblem'){const emblems=Array.from({length:4},(_,j)=>m.emblems[j]||'');emblems[i]=el.value;await save({mvp:{emblems}});}
      else{await save({mvp:{spell:el.value}});}
    }));
  }

  function playerOptions(){
    if(!state||!$('#mvpPlayer'))return;
    const roles=['EXP','JUNGLE','MID','GOLD','ROAM'];
    const opts=[];
    for(const side of ['blue','red'])state[side].players.forEach((p,i)=>{
      opts.push(`<option value="${side}.${i}">${esc(state[side].name)} · ${esc(p.name||roles[i])}${p.hero?' ('+esc(p.hero)+')':''}</option>`);
    });
    const sel=$('#mvpPlayer'),cur=state.mvp.player;
    sel.innerHTML=opts.join('');sel.value=cur;
  }

  // Parse "K/D/A" into numbers.
  function parseKda(kda){const [k,d,a]=String(kda||'').split('/').map(n=>parseInt(n,10));return{k:k||0,d:d||0,a:a||0};}
  // Match duration in minutes from the "MM:SS" game clock.
  function matchMinutes(){const [m,s]=String(state?.gameTime||'0:0').split(':').map(n=>parseInt(n,10));return Math.max(1/60,((m||0)*60+(s||0))/60);}
  // Gold-per-minute from a player's total gold over the match length.
  function playerGpm(p){const g=Number(p.gold)||0;return g?String(Math.round(g/matchMinutes())):'';}
  // MVP score from the parsed match: standard KDA ratio weighted by kill
  // participation, so a high-impact player wins even with a couple of deaths.
  function mvpScore(p,teamKills){
    const {k,d,a}=parseKda(p.kda);
    const kda=(k+a)/Math.max(1,d);
    const kp=teamKills>0?(k+a)/teamKills:0;
    // GPM contributes lightly as a tie-breaker for farming carries.
    const gpm=Number(playerGpm(p))||0;
    return kda*3 + kp*4 + gpm/2000;
  }
  // Game MVP strictly belongs to the winning team. If winner is not decided yet,
  // evaluate both teams.
  function pickMvp(){
    const winSide=['blue','red'].includes(state?.winner)?state.winner:null;
    const sides=winSide?[winSide]:['blue','red'];
    let best=null;
    for(const side of sides){
      const teamKills=state[side]?.kills||0;
      (state[side]?.players||[]).forEach((p,i)=>{
        const score=mvpScore(p,teamKills);
        if(!best||score>best.score)best={side,i,p,teamKills,score};
      });
    }
    return best;
  }
  async function fillFrom(side,i){
    const p=state[side].players[Number(i)];
    if(!p)throw Error('No player data to pull from');
    const {k,a}=parseKda(p.kda);
    const teamKills=state[side].kills;
    const kp=teamKills>0?Math.round(((k+a)/teamKills)*100)+'%':'';
    // Real equipment from the official parsed match feed, if any.
    const parsedItems=Array.from({length:6},(_,j)=>{const it=(p.items||[])[j];return typeof it==='string'?it:it?(it.name||String(it.id||'')):'';});
    const totalGold=Number.isFinite(p.gold)?String(p.gold):'';
    const items=parsedItems;
    const emblems=[p.emblem||'',...(p.talents||[])].slice(0,4);
    while(emblems.length<4)emblems.push('');
    const spell=p.spell||p.battleSpell||'';
    await save({mvp:{player:side+'.'+i,name:p.name||'',role:p.role||'',hero:p.hero||'',kda:p.kda||'',totalGold,kp,items,emblems,spell,photo:'',photoSource:'',photoStatus:'',photoError:''}});await window.MvpPhotos?.apply(p.name,state[side].tag);
  }
  // Auto-fill from the currently selected player (manual override).
  function autofill(){const [side,i]=state.mvp.player.split('.');return fillFrom(side,Number(i));}
  // Auto-detect the MVP from the whole match and fill it.
  function autoDetect(){const best=pickMvp();if(!best)throw Error('No match players available');return fillFrom(best.side,best.i);}

  function editorPreview(){
    if(!$('#mvpPreview')||!state)return;
    const m=state.mvp,sp=findSpell(m.spell);
    $('#mvpPreview').innerHTML=`<div class="mvp-mini"><b>${esc(m.name||'—')}</b><span>${esc(m.hero||'')} · ${esc(m.kda||'')}</span><div class="mvp-mini-icons">${m.items.map(v=>{const it=findItem(v);return it?.icon?`<img src="${esc(it.icon)}" title="${esc(it.name)}">`:'';}).join('')}</div><div class="mvp-mini-icons">${m.emblems.map(v=>{const e=findEmblem(v);return e?.icon?`<img src="${esc(e.icon)}" title="${esc(e.name)}">`:'';}).join('')}${sp?.icon?`<img src="${esc(sp.icon)}" title="${esc(sp.name)}">`:''}</div></div>`;
  }

  function sync(){playerOptions();renderSlots();editorPreview();}

  // Wire buttons once DOM is present.
  function wire(){
    if($('#mvpPlayer'))$('#mvpPlayer').onchange=run(()=>save({mvp:{player:$('#mvpPlayer').value}}));
    if($('#mvpAutofill'))$('#mvpAutofill').onclick=run(()=>autofill());
    if($('#mvpAutoDetect'))$('#mvpAutoDetect').onclick=run(async()=>{await autoDetect();toast('MVP auto-detected from match KDA');});
    if($('#mvpShow'))$('#mvpShow').onclick=run(()=>save({scene:'mvp'}));
    if($('#mvpClearPhoto'))$('#mvpClearPhoto').onclick=run(()=>save({mvp:{photo:'',photoSource:'',photoStatus:'',photoError:''}}));
    if($('#mvpPhoto'))$('#mvpPhoto').onchange=run(async e=>{
      const f=e.target.files[0];if(!f)return;
      if(f.size>25*1024*1024)throw Error('Photo must be under 25 MB');
      const r=await fetch('/api/media',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f});
      const d=await r.json();if(!r.ok)throw Error(d.error);
      e.target.value='';
      toast('Photo uploaded ? removing background?');
      await api('/api/mvp/photo',{url:d.url,name:state.mvp.name});
      toast('Background removed');
    });
  }

  fetch('/assets/catalog.json',{cache:'no-store'}).then(r=>r.json()).then(c=>{catalog=c;fillDatalists();sync();}).catch(()=>{});
  events.addEventListener('catalog',()=>fetch('/assets/catalog.json',{cache:'no-store'}).then(r=>r.json()).then(c=>{catalog=c;fillDatalists();sync();}));
  // The main EventSource render() updates `state`; refresh MVP UI after each frame.
  events.addEventListener('message',()=>{if(!document.activeElement?.dataset?.mvpslot)sync();});
  wire();
})();
