(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Playoffs=api;})(globalThis,()=>{
  const teams=[
    {id:'JMES',name:'Junior Marketing Executives Society',aliases:[],poster:'JMES',players:['why cant u for once','flins','+hedgehog+','Licorice','Bubblegum','cheifûū']},
    {id:'PSITS',name:'Philippine Society of Information Technology Students',aliases:[],poster:'PSITS',players:['Nocturne','Seffyroth','KZO','WesternK9','LenXer.']},
    {id:'ULS-CED',name:'University Laboratory School / College of Education',aliases:['ULS','University Laboratory School'],poster:'ULS-CED',players:['nezara:p','Reiji','KiKiKaKa','Kapitan Setzy','seomi','Iyahrie']},
    {id:'UFTTS',name:'Union of Filipino Tourism and Travel Students',aliases:[],poster:'UFTTS',players:['Nadskie.','YAOSHI','OG |ANa.BIT','No. 1 Party Anthem','ᴇʟᴇᴠᴇɴ','Morrie']},
    {id:'FSMS',name:"Future Secondary Mentors' Society",aliases:[],poster:'FSMS',players:['Rold','Nyl?','Juswa','Mr.Pandita?','NAGING SAPAT BA AKO?','BATAK MAG RELAPSE']},
    {id:'APO',name:'Alpha Phi Omega',aliases:[],poster:'APO',players:['Silvs.','Del123.','Dracarys.','Prime Cris.','Aquil.','Solace.']},
    {id:'EARTH SAVERS',name:'Earth Savers Club',aliases:['USM EARTH SAVERS CLUB'],poster:'EARTH SAVERS',players:['KAISER.','Solo┃levelingッ','Turzxc','music and cats','Cyfer']},
    {id:'PICE',name:'Philippine Institute of Civil Engineers',aliases:['Philippines Institution of Civil Engineers'],poster:'PICE',players:['CEEJAY','Gravity','Reinhart','Escanor','Cronus.','Nathzz Wongsawat']}
  ];
  const key=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function team(value){return teams.find(t=>[t.id,t.name,...t.aliases].some(n=>key(n)===key(value)));}
  const smallCaps={'ᴀ':'a','ʙ':'b','ᴄ':'c','ᴅ':'d','ᴇ':'e','ꜰ':'f','ɢ':'g','ʜ':'h','ɪ':'i','ᴊ':'j','ᴋ':'k','ʟ':'l','ᴍ':'m','ɴ':'n','ᴏ':'o','ᴘ':'p','ꞯ':'q','ʀ':'r','ꜱ':'s','ᴛ':'t','ᴜ':'u','ᴠ':'v','ᴡ':'w','ʏ':'y','ᴢ':'z'};
  const ignKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().split('').map(c=>smallCaps[c]||c).join('').replace(/[^a-z0-9]/g,'');
  function identify(players){
    const names=[...new Set((players||[]).map(p=>ignKey(typeof p==='string'?p:p?.name)).filter(Boolean))];
    const votes=teams.map(t=>({team:t,matches:names.filter(n=>t.players.some(p=>ignKey(p)===n))})).sort((a,b)=>b.matches.length-a.matches.length);
    // Three distinct registered IGNs identify a starting five. Repeated rows,
    // punctuation and small-cap lettering cannot create extra roster votes.
    const best=votes[0];return best.matches.length>=3&&best.matches.length>votes[1].matches.length?best:null;
  }
  const identity=t=>({name:t.name,tag:t.id,logo:'/assets/playoffs/logos/'+t.id.replaceAll(' ','-')+'.png'});
  function defaults(){return {matches:Array.from({length:7},(_,i)=>({blue:i<4?teams[i*2].id:'',red:i<4?teams[i*2+1].id:'',blueScore:0,redScore:0})),featuredTeam:'JMES',useVideo:false,bestOf:[3,3,5],portraits:[],autoResults:true,results:[],captureArmed:true};}
  function migrate(p){const d=defaults();if(!p)return d;return {...d,...p,matches:p.matches?.length===4?[...p.matches,...d.matches.slice(4)]:p.matches||d.matches};}
  function validate(p){
    if(!p||!Array.isArray(p.matches)||p.matches.length!==7||typeof p.featuredTeam!=='string'||p.featuredTeam.length>120||typeof p.useVideo!=='boolean'||!Array.isArray(p.bestOf)||p.bestOf.length!==3||p.bestOf.some(n=>![3,5,7].includes(n)))throw Error('Invalid playoffs data');
    for(const m of p.matches)if(!m||['blue','red'].some(k=>typeof m[k]!=='string'||m[k].length>120)||['blueScore','redScore'].some(k=>!Number.isInteger(m[k])||m[k]<0||m[k]>99))throw Error('Invalid playoffs match');
    if(!Array.isArray(p.portraits)||p.portraits.length>46||p.portraits.some(r=>!r||!team(r.team)?.players.includes(r.ign)||!/^\/assets\/playoffs\/portraits\/[a-f0-9]{24}\.jpg$/.test(r.url)))throw Error('Invalid player portrait mapping');
    if(typeof p.autoResults!=='boolean'||typeof p.captureArmed!=='boolean'||!Array.isArray(p.results)||p.results.length>1000)throw Error('Invalid playoff automation settings');
    for(const r of p.results)if(!r||typeof r.id!=='string'||r.id.length>160||!/^[a-f0-9]{64}$/.test(r.fingerprint)||!Number.isInteger(r.match)||r.match<0||r.match>6||!Number.isInteger(r.game)||r.game<1||r.game>199||!['match','capture'].includes(r.source)||!Number.isFinite(r.recordedAt)||r.recordedAt<0||![r.blueTeam,r.redTeam,r.winnerTeam].every(v=>teams.some(t=>t.id===v))||r.blueTeam===r.redTeam||![r.blueTeam,r.redTeam].includes(r.winnerTeam))throw Error('Invalid recorded playoff result');
    return p;
  }
  const round=i=>i<4?0:i<6?1:2;
  function resolved(p){p=migrate(p);const out=[];for(let i=0;i<7;i++){const m={...p.matches[i]};if(i>=4){const source=i===6?4:(i-4)*2;m.blue=m.blue||out[source].winner;m.red=m.red||out[source+1].winner;}const wins=Math.floor(p.bestOf[round(i)]/2)+1;m.winner=m.blue&&m.red?(m.blueScore>=wins&&m.blueScore>m.redScore?m.blue:m.redScore>=wins&&m.redScore>m.blueScore?m.red:''):'';out.push(m);}return out;}
  function edit(p,index,field,value){
    p=structuredClone(migrate(p));validate(p);if(!Number.isInteger(index)||index<0||index>6||!['blue','red','blueScore','redScore'].includes(field))throw Error('Invalid playoff field');
    const before=resolved(p),previous=p.matches[index][field];p.matches[index][field]=value;validate(p);
    if((field==='blue'||field==='red')&&previous!==value){p.matches[index].blueScore=0;p.matches[index].redScore=0;}
    for(let i=index+1;i<7;i++){const now=resolved(p)[i];if(now.blue!==before[i].blue||now.red!==before[i].red){p.matches[i].blueScore=0;p.matches[i].redScore=0;}}
    return p;
  }
  function format(p,index,value){p=structuredClone(migrate(p));if(!Number.isInteger(index)||index<0||index>2)throw Error('Invalid playoff round');const before=resolved(p);p.bestOf[index]=value;validate(p);for(let i=4;i<7;i++){const now=resolved(p)[i];if(now.blue!==before[i].blue||now.red!==before[i].red){p.matches[i].blueScore=0;p.matches[i].redScore=0;}}return p;}
  function feature(p,s){const value=p?.featuredTeam||'JMES';return team(value==='blue'||value==='red'?(team(s[value]?.tag)?.id||s[value]?.name):value);}
  return {teams,team,ignKey,identify,identity,defaults,migrate,validate,resolved,edit,format,round,feature};
});
