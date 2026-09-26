(() => {
  let library={players:[],poses:[]};
  const ready=fetch('/assets/playoffs/player-photos.json').then(r=>{if(!r.ok)throw Error('Player photo library unavailable');return r.json();}).then(d=>library=d);
  const key=s=>String(s||'').trim().normalize('NFC');
  function entry(ign,hint){const t=Playoffs.team(hint);const all=Playoffs.teams.filter(x=>(!t||x.id===t.id)&&x.players.some(n=>key(n)===key(ign)));return all.length===1?{team:all[0].id,ign:all[0].players.find(n=>key(n)===key(ign))}:null;}
  function linked(ign,hint){const e=entry(ign,hint);if(!e)return null;return library.formalPlayers?.find(p=>p.team===e.team&&p.ign===e.ign)||(state?.playoffs?.portraits||[]).find(p=>p.team===e.team&&p.ign===e.ign)||library.players.find(p=>p.team===e.team&&p.ign===e.ign);}
  async function process(url){const name=state.mvp.name;return api('/api/mvp/photo',{url,name});}
  async function apply(ign,hint){await ready;const p=linked(ign,hint);if(state.mvp.name!==ign)return;if(p){await save({mvp:{photo:p.thumb||p.url,photoSource:p.url,photoStatus:'processing',photoError:''}});return process(p.url);}await save({mvp:{photo:'',photoSource:'',photoStatus:'',photoError:''}});}
  window.MvpPhotos={ready,linked,apply,process};
  const panel=document.createElement('article');panel.className='panel player-photo-panel';panel.innerHTML=`<div class="panelhead"><h2>Registered players & photos</h2><span>FORMAL / FREESTYLE</span></div><div class="fields"><label>Team<select id="photoTeam">${Playoffs.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.id)}</option>`).join('')}</select></label><label>IGN<select id="photoIgn"></select></label></div><div id="photoLinked"></div><div class="buttonrow"><button id="photoUse" class="primary">Use linked photo for MVP</button></div><div id="photoLibrary"></div>`;$('#mvp').append(panel);
  const status=document.createElement('p');status.id='mvpPhotoStatus';status.className='hint';status.setAttribute('role','status');$('#mvpClearPhoto').closest('.buttonrow').after(status);
  const retry=document.createElement('button');retry.id='mvpRetryPhoto';retry.textContent='Retry background removal';$('#mvpClearPhoto').before(retry);retry.onclick=run(()=>process(state.mvp.photoSource||state.mvp.photo));
  function showStatus(){if(!state)return;const m=state.mvp;status.textContent=m.photoStatus==='processing'?'Removing background. The cutout will appear when ready.':m.photoStatus==='error'?m.photoError:m.photoStatus==='ready'?'Transparent player photo ready.':'';retry.disabled=m.photoStatus==='processing'||!(m.photoSource||m.photo);}
  function players(){const t=Playoffs.team($('#photoTeam').value);$('#photoIgn').innerHTML=t.players.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');gallery();}
  let lastKey='';
  function gallery(){const team=$('#photoTeam').value,ign=$('#photoIgn').value,p=linked(ign,team),signature=JSON.stringify([team,ign,p]);if(signature===lastKey)return;lastKey=signature;
    $('#photoLinked').innerHTML=p?`<p>Linked to <b>${esc(ign)}</b> ${p.source?'from '+esc(p.source):''}</p><img class="linked-player-photo" src="${esc(p.thumb||p.url)}" alt="${esc(ign)}">`:'<p class="hint">No labelled photo for this IGN. Assign a pose below.</p>';
    $('#photoUse').disabled=!p;
    $('#photoLibrary').innerHTML=['formal','freestyle'].map(pose=>`<h3>${pose==='formal'?'Formal':'Freestyle'} poses</h3><div class="player-photo-grid">${library.poses.filter(p=>p.team===team&&p.pose===pose).map(p=>`<button data-assign-portrait="${esc(p.url)}" class="${p.url===linked(ign,team)?.url?'selected':''}"><img src="${esc(p.thumb)}" alt="${esc(p.filename)}" loading="lazy"><span>${esc(p.filename)}</span><small>Assign to ${esc(ign)}</small></button>`).join('')}</div>`).join('');
    panel.querySelectorAll('[data-assign-portrait]').forEach(b=>b.onclick=run(async()=>{await api('/api/playoffs/portrait',{team,ign,url:b.dataset.assignPortrait});toast('Photo linked to '+ign);lastKey='';gallery();}));
  }
  $('#photoTeam').onchange=players;$('#photoIgn').onchange=()=>{lastKey='';gallery();};$('#photoUse').onclick=run(async()=>{const ign=$('#photoIgn').value,t=$('#photoTeam').value;await save({mvp:{name:ign}});await apply(ign,t);toast('Player cutout ready');});
  ready.then(()=>{players();showStatus();autoFollow();}).catch(e=>toast(e.message,true));events.addEventListener('message',()=>{showStatus();gallery();autoFollow();});
  // Keep the MVP photo locked to the current MVP player: when the name changes to a
  // registered IGN, swap to that player's linked portrait (and re-run cutout).
  let followName=null,followKey='';
  function autoFollow(){if(!state)return;const ign=state.mvp.name||'';const side=(state.mvp.player||'blue.0').split('.')[0];const hint=state[side]?.tag;const p=ign?linked(ign,hint):null;const sig=ign+'|'+(p?.url||'');
    if(sig===followKey)return;followKey=sig;
    if(!ign){followName=ign;return;}
    if(p&&(state.mvp.photoSource===p.url))return;
    if(followName!==ign){followName=ign;apply(ign,hint).catch(()=>{});}
  }
})();
