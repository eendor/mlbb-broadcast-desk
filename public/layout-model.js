(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HUDLayout=api;})(globalThis,()=>{
  const scenes=['draft','scoreboard','players','countdown','intermission','postgame','schedule','sponsors','ads'];
  const groups=[
    ['draft','Draft package','.broadcast-draft'],['draft-side','Draft team','.broadcast-draft-side'],
    ['bans','Ban strip','.broadcast-bans'],['ban','Ban slot','.broadcast-ban'],
    ['pick','Hero panel','.broadcast-pick'],['hero-art','Hero artwork','.draft-hero-media'],
    ['hero-name','Hero label','.vertical-hero'],['player-name','Player name','.broadcast-player-name'],
    ['draft-center','Draft center','.broadcast-draft-center'],['event-strip','Event strip','.draft-event-strip'],
    ['draft-match','Game / series','.draft-match-label'],['draft-team','Draft team identity','.draft-center-team'],
    ['draft-tag','Draft team tag','.draft-center-team>b'],['draft-score','Draft series score','.draft-center-team>small'],
    ['draft-clock','Draft clock block','.draft-center-clock'],['phase','Draft phase','.draft-center-clock>span'],
    ['draft-seconds','Draft seconds','.draft-center-clock>b'],['draft-sponsor','Draft sponsor','.draft-sponsor'],
    ['scoreboard','Scoreboard','.reference-scoreboard'],['team-data','Team statistics','.sb-team-data'],
    ['objectives','Objectives','.sb-objectives'],['objective','Objective value','.sb-objectives>span'],
    ['team-tag','Scoreboard team tag','.sb-lower h2'],['kills','Team kills','.sb-kills'],
    ['gold-lead','Gold lead','.sb-lead'],['series-wins','Series wins','.sb-wins'],
    ['score-center','Scoreboard center','.sb-center'],['game-clock','Game clock','.sb-center>strong'],
    ['rails','Player rail','.player-rail'],['rail-player','Player card','.rail-player'],
    ['rail-name','Rail name','.rail-name>b'],['rail-level','Player level','.rail-name>span'],
    ['rail-hero','Player portrait','.rail-hero'],['rail-kda','Player KDA','.rail-numbers>strong'],['rail-gold','Player gold','.rail-numbers>small'],
    ['brand','Event branding','.broadcast-brand,.showheader'],['event-title','Event title','.broadcast-brand h1,.showheader>span'],
    ['subtitle','Event subtitle','.broadcast-brand p'],['topline','Top line','.broadcast-topline'],
    ['show-clock','Countdown block','.broadcast-show-clock'],['timer-label','Countdown label','.broadcast-show-clock>span'],['timer-value','Countdown value','.broadcast-show-clock>b'],
    ['sidebar','Standby sidebar','.broadcast-sidebar'],['fixtures','Fixtures block','.broadcast-fixtures'],
    ['fixture','Fixture row','.broadcast-fixture,.fixture'],['fixture-team','Fixture team','.fixture-side'],
    ['fixture-tag','Fixture tag','.fixture-side>span'],['partners','Partner strip','.standby-partners'],
    ['ad-stage','Ad / standby panel','.broadcast-ad-stage'],['standby-copy','Standby content','.broadcast-ad-placeholder'],
    ['standby-title','Standby headline','.broadcast-ad-placeholder h2'],['standby-subtitle','Standby subtitle','.broadcast-ad-placeholder p'],
    ['versus','Versus teams','.standby-versus'],['ticker','Ticker','.broadcast-bottom,.ticker'],
    ['winner','Winner block','.winner'],['winner-name','Winner name','.winner h1'],['result-score','Final score','.resultscore'],
    ['tables','Result tables','.tables'],['result-team','Result team','.resultteam'],['result-name','Result team name','.resultteam h2'],
    ['result-player','Result player','.resultrow'],['schedule','Schedule block','.schedulecontent'],['schedule-title','Schedule title','.schedulecontent h1'],
    ['sponsors','Sponsors block','.sponsor-show'],['sponsor-title','Sponsor heading','.sponsor-show h1'],
    ['sponsor','Sponsor tile','.partner-tile'],['sponsor-name','Sponsor name','.partner-tile>b'],['sponsor-tagline','Sponsor tagline','.partner-tile>small'],
    ['ad-media','Ad media','.ad-media-host'],['ad-label','Advertisement label','.ad-bug'],['ad-standby','Ad standby message','.ad-empty'],
    ['logo','Logo','img.logo,.logo.initial,.broadcast-brand>img,.draft-event-strip>img,.sb-center>img,.showheader>img,.fixture-side>img,.standby-partners>img,.partner-art>img,.broadcast-ad-placeholder>img'],
    ['background','Animated background','.fabric-bg,.motion-background'],['blue-accent','Blue background accent','.broadcast-corner.blue'],['red-accent','Red background accent','.broadcast-corner.red']
  ];
  const defaults=()=>({x:0,y:0,scaleX:1,scaleY:1,fontScale:1,opacity:1,hidden:false});
  function validate(rows){
    if(!Array.isArray(rows)||rows.length>1500)throw Error('Invalid HUD layouts');
    const ids=new Set(),prefixes=new Set(groups.map(g=>g[0]));
    for(const r of rows){
      if(!r||!scenes.includes(r.scene)||typeof r.id!=='string'||!/^.+:\d{1,3}$/.test(r.id)||!prefixes.has(r.id.split(':')[0]))throw Error('Invalid HUD element');
      const key=r.scene+'/'+r.id;if(ids.has(key))throw Error('Duplicate HUD element');ids.add(key);
      if(Object.keys(r).some(k=>!['scene','id',...Object.keys(defaults())].includes(k)))throw Error('Unknown layout setting');
      for(const k of ['x','y','scaleX','scaleY','fontScale','opacity'])if(!Number.isFinite(r[k]))throw Error('Invalid layout value');
      if(Math.abs(r.x)>3840||Math.abs(r.y)>2160||[r.scaleX,r.scaleY,r.fontScale].some(n=>n<.1||n>5)||r.opacity<0||r.opacity>1||typeof r.hidden!=='boolean')throw Error('Layout value outside limits');
    }return rows;
  }
  return {scenes,groups,defaults,validate};
});
