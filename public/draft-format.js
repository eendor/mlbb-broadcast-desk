/* Read-only lookup of the current playoff round for draft ban counts.
   Never mutates the playoff bracket; it only reads resolved matchups. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./playoffs-model'):root.Playoffs);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DraftFormat=api;
})(globalThis,(Playoffs)=>{
  function roundKey(state){
    const p=Playoffs.migrate(state?.playoffs);
    const ids=['blue','red'].map(side=>Playoffs.team(state?.[side]?.tag)?.id||Playoffs.team(state?.[side]?.name)?.id||Playoffs.identify(state?.[side]?.players)?.team.id);
    if(ids.every(Boolean)&&ids[0]!==ids[1]){
      // Both current organizations must share exactly one bracket matchup.
      const hits=Playoffs.resolved(p).map((match,index)=>({match,index}))
        .filter(({match})=>[match.blue,match.red].every(name=>ids.includes(Playoffs.team(name)?.id)));
      if(hits.length===1)return ['quarterfinals','semifinals','final'][Playoffs.round(hits[0].index)];
    }
    // The bracket has no third-place slot, so that round is named by the stage text.
    const stage=String(state?.stage||'').toLowerCase();
    if(/third|3rd|bronze/.test(stage))return 'third';
    if(/semi[\s-]*final|\bsemis?\b/.test(stage))return 'semifinals';
    if(/quarter[\s-]*final|\bqf\b/.test(stage))return 'quarterfinals';
    if(/\bgrand[\s-]*finals?\b|\bfinals?\b/.test(stage))return 'final';
    // Baseline Pasiklaban format: three bans per side until a later round is known.
    return 'quarterfinals';
  }
  // Quarterfinals: 3 bans per team. Semifinals, third place and grand final: 5.
  const banCount=state=>roundKey(state)==='quarterfinals'?3:5;
  return {roundKey,banCount};
});
