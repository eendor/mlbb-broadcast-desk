const Model=require('../public/live-detection-model');
const OCR=require('../public/ocr-model');
const catalog=require('../public/assets/catalog.json');
const heroes=new Set(catalog.heroes.map(h=>h.name));

function prepare(state,body,now=Date.now()){
  if(!body||!['game','result','draft'].includes(body.mode)||!Array.isArray(body.readings)||body.readings.length>60||typeof body.live!=='boolean'||typeof body.switchScene!=='boolean'||!Number.isFinite(body.sampledAt)||body.sampledAt>now+1000||body.sampledAt<now-10000)throw Error('Invalid or expired live detection');
  const allowed=new Set(Model.profiles[body.mode].map(r=>r.field));if(body.mode==='result')allowed.add('winner');const seen=new Set();
  for(const r of body.readings){
    if(!r||!allowed.has(r.field)||seen.has(r.field))throw Error('Invalid live detection field');seen.add(r.field);
    const valid=r.field==='winner'?['blue','red'].includes(r.value):r.field==='draftPhase'?Model.draftPhase(r.value)===r.value:r.field==='draftTimer.remaining'?Number.isInteger(r.value)&&r.value>=0&&r.value<=60:r.field==='resultStatus'?!!Model.resultOutcome(r.value):Model.isHero(r.field)?heroes.has(r.value):OCR.parse(String(r.value),r.field)===r.value;
    if(!valid)throw Error('Invalid live detection value');
  }
  const patch={},held=[];
  if(body.switchScene)patch.scene=body.mode==='result'?'postgame':body.mode==='draft'?'draft':'scoreboard';
  const identities={};
  for(const r of body.readings){const p=r.field.split('.');if(p[1]==='players'&&['name','hero'].includes(p[3]))(identities[p[0]+p[2]]??={})[p[3]]=r.value;}
  const targets=new Map(),counts=new Map();
  for(const side of ['blue','red'])for(let row=0;row<5;row++){
    // Draft and final-result tables retain team row order. Only the live
    // spectator rail can reorder players and therefore needs identity matching.
    const i=body.mode==='game'?Model.playerIndex(state[side].players,identities[side+row]||{},row):row;
    if(i!==null){const key=side+i;targets.set(side+row,key);counts.set(key,(counts.get(key)||0)+1);}
  }
  for(const [source,target]of targets)if(counts.get(target)>1)targets.set(source,null);
  for(const r of body.readings){
    const [side,group,index,key]=r.field.split('.');
    if(group==='players'){
      const target=targets.get(side+index);if(!target){held.push(r.field);continue;}const i=Number(target.slice(side.length));
      // Retain the full draft name when spectator mode shortens it.
      if(body.mode==='game'&&key==='name'&&!/^Player [1-5]$/.test(state[side].players[i].name))continue;
      ((patch[side]??={}).players??=structuredClone(state[side].players))[i][key]=r.value;
    }else if(group==='bans'){
      const team=patch[side]??={};team.bans??=Array.from({length:5},(_,i)=>state[side].bans[i]||'');team.bans[Number(index)]=r.value;
    }else if(r.field==='draftPhase')patch.phase=r.value;
    else if(r.field==='draftTimer.remaining'){
      patch.draftTimer={...state.draftTimer,remaining:r.value,endAt:body.live?body.sampledAt+r.value*1000:null};
    }else if(r.field==='winner')patch.winner=r.value;
    else if(r.field==='resultStatus')patch.winner=Model.resultOutcome(r.value);
    else if(r.field==='gameTime'){
      const [m,s]=r.value.split(':').map(Number);patch.gameTime=r.value;patch.gameClock={running:body.live,seconds:m*60+s,syncedAt:body.sampledAt};
    }
    else (patch[side]??={})[group]=r.value;
  }
  return {patch,held};
}
module.exports={prepare};
