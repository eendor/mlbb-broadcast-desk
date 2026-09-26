(() => {
  const root=$('#playoffControls');if(!root)return;
  const automation=document.createElement('div');automation.className='playoff-automation';
  automation.innerHTML='<label><input id="playoffAutoResults" type="checkbox"> Auto-update playoffs from match results</label><p class="hint">Three registered IGNs identify each team. Applying a match result or detecting a result screen records the organization\'s win once and advances a clinched series.</p><p id="playoffResultStatus" role="status"></p>';
  root.before(automation);
  $('#playoffAutoResults').onchange=run(e=>save({playoffs:{autoResults:e.target.checked}}));
  const options=(current,automatic=false)=>`${automatic?'<option value="">Advance previous winner</option>':''}${!Playoffs.team(current)&&current?`<option>${esc(current)}</option>`:''}`+Playoffs.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.id)}</option>`).join('');
  let signature='';
  function renderControls(){
    if(!state)return;const p=Playoffs.migrate(state.playoffs),key=JSON.stringify(p);if(key===signature)return;signature=key;
    const resolved=Playoffs.resolved(p);
    $('#playoffAutoResults').checked=p.autoResults;
    const last=p.results.at(-1);
    $('#playoffResultStatus').textContent=last?`Last recorded: ${last.winnerTeam} won game ${last.game} of Match ${last.match+1}. ${resolved[last.match].winner?'Series complete.':''}`:'Ready for playoff results.';
    root.innerHTML=[['QUARTERFINALS',[0,1,2,3]],['SEMIFINALS',[4,5]],['GRAND FINAL',[6]]].map(([title,ids],round)=>`<h3>${title} <select data-playoff-format="${round}" aria-label="${title} series format">${[3,5,7].map(n=>`<option value="${n}" ${p.bestOf[round]===n?'selected':''}>Best of ${n}</option>`).join('')}</select></h3>${ids.map(i=>{const m=p.matches[i],r=resolved[i];return `<div class="playoff-control-match"><b>Match ${i+1}</b>${['blue','red'].map(side=>`<label>${side==='blue'?'First':'Second'} team<select data-playoff="${i}.${side}">${options(m[side],i>=4)}</select><small>${esc(r[side]||'Awaiting previous result')}</small></label><label>Wins<input type="number" min="0" max="99" data-playoff="${i}.${side}Score" value="${m[side+'Score']}"></label>`).join('')}<span>${r.winner?esc(r.winner)+' advances':''}</span></div>`;}).join('')}`).join('');
    root.querySelectorAll('[data-playoff]').forEach(el=>{const [i,field]=el.dataset.playoff.split('.');if(el.tagName==='SELECT')el.value=Playoffs.team(p.matches[i][field])?.id||p.matches[i][field];el.onchange=run(async()=>{await api('/api/playoffs/match',{index:Number(i),field,value:el.type==='number'?Number(el.value):el.value});});});
    root.querySelectorAll('[data-playoff-format]').forEach(el=>el.onchange=run(()=>api('/api/playoffs/format',{round:Number(el.dataset.playoffFormat),bestOf:Number(el.value)})));
    document.querySelectorAll('[data-featured-team]').forEach(el=>{el.value=p.featuredTeam;});
  }
  const featureOptions='<option value="blue">Current blue team</option><option value="red">Current red team</option>'+Playoffs.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.id)} — ${esc(t.name)}</option>`).join('');
  const feature=$('#featuredTeam');feature.dataset.featuredTeam='';feature.innerHTML=featureOptions;
  const panel=document.createElement('article');panel.className='panel';panel.innerHTML=`<div class="panelhead"><h2>Intermission team photo</h2></div><label>Team on screen<select data-featured-team>${featureOptions}</select></label><div class="buttonrow"><button id="showTeamFeature">Show intermission</button></div>`;$('#breaks').prepend(panel);
  document.querySelectorAll('[data-featured-team]').forEach(el=>el.onchange=run(()=>save({playoffs:{featuredTeam:el.value}})));
  $('#showTeamFeature').onclick=run(()=>save({scene:'intermission',visible:true}));$('#showPlayoffs').onclick=run(()=>save({scene:'playoffs',visible:true}));
  const video=document.createElement('details');video.innerHTML='<summary>Original bracket animation</summary><video controls muted preload="none" style="width:100%;max-width:720px" src="/assets/playoffs/playoffs-bracket.mp4"></video>';$('#playoffs').append(video);
  for(const side of ['blue','red']){
    const article=$(`[data-path="${side}.name"]`).closest('article'),label=document.createElement('label');label.innerHTML=`Qualified team / load registered IGNs<select data-roster-side="${side}"><option value="">Choose a team</option>${options('')}</select>`;article.querySelector('.panelhead').after(label);
    label.querySelector('select').onchange=run(async e=>{if(!e.target.value)return;await api('/api/playoffs/team',{side,team:e.target.value});toast('Registered IGNs loaded. Set the five players to their match roles.');});
    const hint=document.createElement('p');hint.className='hint';hint.textContent='All registered IGNs are available below, including the sixth player. Set the starting five to their match roles.';article.querySelector('h3').after(hint);
    for(let i=0;i<5;i++){const input=$(`[data-player="${side}.${i}.name"]`),list=document.createElement('datalist');list.id=`${side}-registered-${i}`;input.setAttribute('list',list.id);input.after(list);}
  }
  function rosters(){if(!state)return;for(const side of ['blue','red']){const t=Playoffs.team(state[side].tag)||Playoffs.team(state[side].name);const select=$(`[data-roster-side="${side}"]`);if(document.activeElement!==select)select.value=t?.id||'';for(let i=0;i<5;i++)$(`#${side}-registered-${i}`).innerHTML=(t?.players||[]).map(n=>`<option value="${esc(n)}">`).join('');}}
  events.addEventListener('message',()=>{renderControls();rosters();});renderControls();rosters();
})();
