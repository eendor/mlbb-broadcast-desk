from pathlib import Path
import json,re,urllib.request
root=Path(__file__).resolve().parents[1]
p=root/'public/index.html';s=p.read_text(encoding='utf-8-sig');s=s.replace('</head>','<link rel="stylesheet" href="/hero-picker.css"></head>');s=s.replace('<script src="/ocr.js"></script>','<script src="/ocr.js"></script><script src="/hero-picker.js"></script>');p.write_text(s,encoding='utf-8')
p=root/'public/overlay.html';s=p.read_text(encoding='utf-8-sig').replace('</head>','<link rel="stylesheet" href="/motion.css"></head>');p.write_text(s,encoding='utf-8')
p=root/'public/overlay.js';s=p.read_text(encoding='utf-8-sig')
start=s.index('function hero(name)');end=s.index('function logo(t)',start)
s=s[:start]+'''function heroEntry(name){const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');return catalog.heroes.find(h=>key(h.name)===key(name)||(h.aliases||[]).some(a=>key(a)===key(name)));}function hero(name){return heroEntry(name)?.img||'';}function imgHero(name,cls=''){const h=heroEntry(name);if(!h)return '';const src=cls==='heroimage'?h.img:(h.icon||h.img);return `<img class="${cls}" src="${esc(src)}" alt="${esc(h.name)}">`+(cls==='heroimage'&&h.gif?`<img class="hero-gif-badge" src="${esc(h.gif)}" alt="${esc(h.name)} animated sticker">`:'');}''' +s[end:]
start=s.index("else if(scene==='countdown')");end=s.index("else if(scene==='postgame')",start)
s=s[:start]+'''else if(scene==='countdown')stage.innerHTML=`<div class="fullscreen countdown-scene"><div class="motion-background" aria-hidden="true"><div class="aurora"></div><div class="aurora second"></div><div class="horizon-grid"></div><div class="light-streak"></div><div class="light-streak second"></div>${Array.from({length:26},(_,i)=>`<i class="ember" style="--x:${i*3.9}%;--duration:${12+i%9}s;--delay:-${i*.8}s"></i>`).join('')}</div>${header()}<div class="countcenter"><div class="eyebrow">${esc(s.stage)}</div><h1>${esc(s.countdown.label)}</h1><div class="bigclock" data-clock="countdown">${clock(s.countdown)}</div><div class="versus-matchup"><div class="vs-team"><div class="vs-team-copy"><b>${esc(s.blue.name)}</b><small>BLUE SIDE / ${esc(s.blue.tag)}</small></div>${logo(s.blue)}</div><div class="vs-emblem">VS</div><div class="vs-team red"><div class="vs-team-copy"><b>${esc(s.red.name)}</b><small>RED SIDE / ${esc(s.red.tag)}</small></div>${logo(s.red)}</div></div></div>${ticker()}</div>`;
''' +s[end:]
old="events.onmessage=e=>{state=JSON.parse(e.data);render();};"
new="""function visualKey(s){const scene=params.get('scene')||s.scene;const common=[scene,s.visible,s.accent,s.event,s.stage];if(scene==='countdown')return JSON.stringify([...common,s.countdown,s.ticker,...['blue','red'].map(k=>[s[k].name,s[k].tag,s[k].logo])]);if(scene==='draft')return JSON.stringify([...common,s.game,s.phase,s.draftTimer,...['blue','red'].map(k=>[s[k].name,s[k].tag,s[k].logo,s[k].score,s[k].players.map(p=>[p.name,p.hero,p.role]),s[k].bans])]);return JSON.stringify(s);}events.onmessage=e=>{const next=JSON.parse(e.data),changed=!state||visualKey(state)!==visualKey(next);state=next;if(changed)render();};"""
assert old in s;s=s.replace(old,new);p.write_text(s,encoding='utf-8')
with urllib.request.urlopen('https://media.giphy.com/media/FxIdsrSVO84drGpfAB/giphy.gif',timeout=30) as r:(root/'public/assets/hero-gifs/chou.gif').write_bytes(r.read())
p=root/'public/assets/catalog.json';c=json.loads(p.read_text(encoding='utf-8-sig'))
gif_ids={'miya':'irPxhDKrmP2R3HMiFK','nana':'5FO60EjCzZ96lcFT3v','chou':'FxIdsrSVO84drGpfAB'}
for h in c['heroes']:
 if h['name'].lower() in gif_ids:
  k=h['name'].lower();h['gif']='/assets/hero-gifs/'+k+'.gif';h['gifSource']='https://giphy.com/stickers/'+gif_ids[k];h['gifType']='official animated sticker'
# Retain legacy spellings as aliases instead of duplicate picker tiles.
key=lambda n:re.sub('[^a-z0-9]','',n.lower())
bykey={key(h['name']):h for h in c['heroes']}
for old,new in [('beleric','belerick'),('carmila','carmilla'),('arlot','arlott'),('popolkupa','popolandkupa'),('yisunshin','yisunshin')]:
 if old!=new and old in bykey and new in bykey:
  h=bykey.pop(old);bykey[new].setdefault('aliases',[]).append(h['name'])
c['heroes']=sorted(bykey.values(),key=lambda h:h['name'].lower());p.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf-8')
print('Visual picker, animated draft, GIF badges and starting-soon scene wired.')
