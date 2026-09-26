function scoreboardGameTime(s, now = Date.now()) {
  if (!s?.gameClock?.running) return s?.gameTime || '00:00';
  const n = Math.min(86400, s.gameClock.seconds + Math.max(0, Math.floor((now - s.gameClock.syncedAt) / 1000)));
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

function scoreIcon(kind, label) {
  return `<img class="sb-icon" src="/assets/scoreboard/${kind}.png" alt="${label}">`;
}

let previousHudValues = null;

function scoreboardValue(value, previous) {
  const changed = previous !== undefined && String(previous) !== String(value);
  return `<span class="sb-value${changed ? ' is-updating' : ''}"${changed ? ` data-previous="${esc(previous)}"` : ''}><span class="sb-value-current">${esc(value)}</span></span>`;
}

function scoreStats(team, side, previous) {
  const stats = [['lord', 'Lord', team.lord], ['turtle', 'Turtle', team.turtle], ['tower', 'Towers', team.turrets], ['gold', 'Gold', gold(team.gold)]];
  if (side === 'red') stats.reverse();
  return `<div class="sb-objectives">${stats.map(([kind, label, value]) => {
    const key = kind === 'tower' ? 'turrets' : kind;
    const before = previous?.[side][key];
    const changed = before !== undefined && before !== team[key];
    return `<span title="${label}" class="${changed ? 'hud-changed' : ''}">${scoreIcon(kind, label)}<b>${scoreboardValue(value, before === undefined ? undefined : kind === 'gold' ? gold(before) : before)}</b></span>`;
  }).join('')}</div>`;
}

function winBars(team, s, scoreChanged) {
  const slots = Math.min(5, Math.floor(s.bestOf / 2) + 1);
  return `<div class="sb-wins" aria-label="${team.score} series wins">${Array.from({length: slots}, (_, i) => `<i class="${i < team.score ? 'won' : ''} ${scoreChanged && i === team.score - 1 ? 'newly-won' : ''}"></i>`).join('')}</div>`;
}

function scoreboardBroadcastPanel(s) {
  const partner = s.breaks?.sponsors?.find(p => p.image?.startsWith('/assets/')) || {
    name: 'MSL Philippines', image: '/assets/msl-ph-black.png'
  };
  return `<aside class="sb-broadcast-panel" aria-label="Match and broadcast information">
    <div class="sb-match-info">
      <small class="sb-match-event" title="${esc(s.event)}">${esc(s.event)}</small>
      <strong class="sb-match-stage" title="${esc(s.stage)}">${esc(s.stage)}</strong>
      <span class="sb-match-format">GAME ${s.game} &middot; BO${s.bestOf}</span>
    </div>
    <div class="sb-partner"><img src="${esc(partner.image)}" alt="${esc(partner.name)}"></div>
    <div class="sb-casters" aria-label="Casters: Art Roselle and Ralph Duco">
      <svg viewBox="0 0 16 22" aria-hidden="true"><rect x="5" y="1" width="6" height="12" rx="3"/><path d="M2 9h2v2a4 4 0 0 0 8 0V9h2v2a6 6 0 0 1-5 5.92V20h3v2H4v-2h3v-3.08A6 6 0 0 1 2 11Z"/></svg>
      <span class="sb-caster-names">Art Roselle<span class="sb-caster-divider" aria-hidden="true">|</span>Ralph Duco</span>
    </div>
  </aside>`;
}

/* Team plates take their palette from each organization's logo artwork, so the
   tag, kill and objective colors stay wired to the team identities on air. */
const teamPalettes={blue:{src:'',color:null},red:{src:'',color:null}};
const paletteCache=new Map();
function paletteLum([r,g,b]){const f=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(r)+.7152*f(g)+.0722*f(b);}
function paletteHex(c){return '#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function hslToRgb(h,s,l){h=((h%360)+360)%360/360;const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));};return [f(0),f(8),f(4)];}
function rgbToHsl([r,g,b]){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx===mn)return [0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);let h;if(mx===r)h=(g-b)/d+(g<b?6:0);else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;return [h*60,s,l];}
function fitColor(c){let out=c.map(v=>Math.max(0,Math.min(255,v)));for(let i=0;i<4;i++){const l=paletteLum(out);if(!(l>.004))break;const k=Math.pow(.26/l,.6);out=out.map(v=>Math.max(0,Math.min(255,v*k)));}return out;}
function deriveStops(h,s){
  const light=fitColor(hslToRgb(h,Math.max(.45,Math.min(.85,s)),.5));
  const dark=light.map(v=>v*.55),mid=light.map(v=>v*.8);
  return {a:paletteHex(dark),b:paletteHex(light),mid:paletteHex(mid),ink:paletteLum(light)>.14?'#2b1408':'#fff5d9'};
}
function logoPalette(img){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,32,32);
  const data=ctx.getImageData(0,0,32,32).data;
  const buckets=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<200)continue;
    const [h,s,l]=rgbToHsl([data[i],data[i+1],data[i+2]]);
    if(s<.15||l<.06||l>.92)continue;
    const key=Math.floor(h/30);
    const b=buckets.get(key)||{key,n:0,w:0,sx:0,sy:0,s:0};
    b.n++;b.w+=s*s;b.s+=s;
    b.sx+=Math.cos(h*Math.PI/180);b.sy+=Math.sin(h*Math.PI/180);
    buckets.set(key,b);
  }
  // Average complementary seal colors (navy + gold) cancels chroma, so pick the
  // strongest hue bucket instead and keep alternates for side disambiguation.
  const list=[...buckets.values()].filter(b=>b.n>=4).sort((a,b)=>b.w-a.w);
  if(!list.length)return null;
  const build=b=>{
    const hue=(Math.atan2(b.sy/b.n,b.sx/b.n)*180/Math.PI+360)%360;
    return {hue,stops:deriveStops(hue,(b.s/b.n)*1.35)};
  };
  const [primary,...alts]=list.slice(0,4).map(build);
  return {hue:primary.hue,stops:primary.stops,alts};
}
const hueDist=(a,b)=>{const d=Math.abs(((a-b)%360+360)%360);return Math.min(d,360-d);};
function paletteStops(side){
  const cur=teamPalettes[side].color;
  if(!cur)return null;
  if(side==='red'){
    const blue=teamPalettes.blue.color;
    // Two organizations with the same dominant hue would read as one team;
    // step the second side to its next real brand hue at least 35° apart.
    if(blue&&hueDist(cur.hue,blue.hue)<35){
      const alt=(cur.alts||[]).find(a=>hueDist(a.hue,blue.hue)>=35);
      return alt?alt.stops:cur.stops;
    }
  }
  return cur.stops;
}
function applyTeamPalettes(bar){
  if(!bar)return;
  for(const side of ['blue','red']){
    const stops=paletteStops(side);
    if(!stops)continue;
    bar.style.setProperty('--'+side+'-a',stops.a);
    bar.style.setProperty('--'+side+'-b',stops.b);
    bar.style.setProperty('--'+side+'-mid',stops.mid);
    bar.style.setProperty('--'+side+'-ink',stops.ink);
  }
}
function requestTeamPalette(side,src){
  const state=teamPalettes[side];
  if(state.src===src)return;
  if(paletteCache.has(src)){teamPalettes[side]={src,color:paletteCache.get(src)};return;}
  teamPalettes[side]={src,color:null};
  const img=new Image();
  img.onload=()=>{
    let color=null;try{color=logoPalette(img);}catch{}
    paletteCache.set(src,color);
    if(teamPalettes[side].src!==src)return;
    teamPalettes[side].color=color;
    if(color)applyTeamPalettes(stage.querySelector('.reference-scoreboard'));
  };
  img.onerror=()=>paletteCache.set(src,null);
  img.src=src;
}

function renderReferenceScoreboard(s) {
  const entering = !previousHudValues || !stage.querySelector('.reference-scoreboard');
  const previous = entering ? null : previousHudValues;
  const lead = s.blue.gold - s.red.gold;
  const previousLead = previous ? previous.blue.gold - previous.red.gold : 0;
  const diff = lead === 0 ? '' : `+${gold(Math.abs(lead))}`;
  const current = Object.fromEntries(['blue', 'red'].map(side => [side, Object.fromEntries(
    ['kills', 'lord', 'turtle', 'turrets', 'gold', 'score', 'name', 'tag', 'logo'].map(key => [key, s[side][key]])
  )]));
  const identityChanged = side => previous && ['tag', 'name', 'logo'].some(key => previous[side][key] !== s[side][key]);
  const lower = side => {
    const leads = side === 'blue' ? lead > 0 : lead < 0;
    const ledBefore = side === 'blue' ? previousLead > 0 : previousLead < 0;
    return `<div class="sb-lower ${side}">
      <h2 class="${identityChanged(side) ? 'hud-changed' : ''}" title="${esc(s[side].name)}"><span class="sb-team-label">${esc(s[side].tag || s[side].name)}</span></h2>
      ${winBars(s[side], s, previous && previous[side].score < s[side].score)}
      <span class="sb-lead">${leads ? scoreIcon('gold', 'Gold lead') + scoreboardValue(diff, previous ? ledBefore ? `+${gold(Math.abs(previousLead))}` : '' : undefined) : ''}</span>
    </div>`;
  };
  stage.innerHTML = `<div class="reference-scoreboard${entering ? ' hud-enter' : ''}">
    <div class="sb-flag"><img src="/assets/pasiklaban/usm.png" alt="University of Southern Mindanao seal"></div>
    <div class="sb-team-logo blue${identityChanged('blue') ? ' hud-changed' : ''}">${logo(s.blue)}</div>
    <div class="sb-team-data blue">${scoreStats(s.blue, 'blue', previous)}${lower('blue')}</div>
    <div class="sb-kills blue${previous && previous.blue.kills !== s.blue.kills ? ' hud-changed' : ''}" aria-label="Blue kills">${scoreboardValue(s.blue.kills, previous?.blue.kills)}</div>
    <div class="sb-center"><strong>${esc(scoreboardGameTime(s))}</strong><div class="sb-brand-row"><img class="sb-event-logo" src="/assets/pasiklaban/emblem.png" alt="Pasiklaban"></div></div>
    <div class="sb-kills red${previous && previous.red.kills !== s.red.kills ? ' hud-changed' : ''}" aria-label="Red kills">${scoreboardValue(s.red.kills, previous?.red.kills)}</div>
    <div class="sb-team-data red">${scoreStats(s.red, 'red', previous)}${lower('red')}</div>
    <div class="sb-team-logo red${identityChanged('red') ? ' hud-changed' : ''}">${logo(s.red)}</div>
    ${scoreboardBroadcastPanel(s)}
  </div>`;
  previousHudValues = current;
  for(const side of ['blue','red']){
    const src=stage.querySelector(`.sb-team-logo.${side} img`)?.src||'';
    if(src)requestTeamPalette(side,src);
    else teamPalettes[side]={src:'',color:null};
  }
  applyTeamPalettes(stage.querySelector('.reference-scoreboard'));
  fitScoreboardNames();
}

function fitScoreboardNames() {
  document.querySelectorAll('.sb-lower h2').forEach(box => {
    const label = box.querySelector('.sb-team-label');
    if (!label) return;
    const css = getComputedStyle(box);
    const base = parseFloat(css.fontSize);
    label.style.fontSize = base + 'px';
    const available = box.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    if (available > 0 && label.scrollWidth > available) label.style.fontSize = (base * available / label.scrollWidth) + 'px';
  });
}

document.fonts.ready.then(fitScoreboardNames);
