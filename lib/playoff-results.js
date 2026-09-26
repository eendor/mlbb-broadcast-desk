const {createHash}=require('node:crypto');
const Playoffs=require('../public/playoffs-model');
const Detection=require('../public/live-detection-model');

function identifyTeams(patch){
  const identified=Object.fromEntries(['blue','red'].map(side=>[side,Playoffs.identify(patch[side]?.players)?.team||null]));
  if(identified.blue?.id===identified.red?.id)return {blue:null,red:null};
  return identified;
}

function identifyPatch(patch){
  const teams=identifyTeams(patch);
  for(const side of ['blue','red'])if(teams[side])Object.assign(patch[side],Playoffs.identity(teams[side]));
  return teams;
}

function matchingMatches(playoffs,teams){
  if(!teams.blue||!teams.red||teams.blue.id===teams.red.id)return [];
  return Playoffs.resolved(playoffs).map((match,index)=>({...match,index})).filter(m=>{
    const a=Playoffs.team(m.blue)?.id,b=Playoffs.team(m.red)?.id;
    return a!==b&&[a,b].includes(teams.blue.id)&&[a,b].includes(teams.red.id);
  });
}

function resultId(raw){
  let root=raw?.data??raw;
  if(typeof root==='string'){try{root=JSON.parse(root);}catch{return '';}}
  root=root?.matchdata??root;
  for(const obj of [root?.battleData,root,raw])for(const k of ['battle_id','battleId','battleid','match_id','matchId','matchid']){
    const value=obj?.[k];
    // Large numeric IDs may already have lost precision in JSON. The result
    // fingerprint still works when no reliable explicit ID is available.
    if(typeof value==='number'&&!Number.isSafeInteger(value))continue;
    if(value!=null&&/^[a-zA-Z0-9_-]{6,100}$/.test(String(value)))return String(value);
  }
  return '';
}

function fingerprint(patch,teams){
  if(!['blue','red'].includes(patch.winner)||!teams.blue||!teams.red||!/^\d{1,4}:\d{2}$/.test(patch.gameTime||''))return '';
  const [minutes,seconds]=patch.gameTime.split(':').map(Number);
  if(seconds>59||minutes*60+seconds<=0)return '';
  const totals=['blue','red'].map(side=>({team:teams[side].id,kills:patch[side]?.kills})).sort((a,b)=>a.team.localeCompare(b.team));
  if(totals.some(t=>!Number.isInteger(t.kills)||t.kills<0))return '';
  return createHash('sha256').update(JSON.stringify([totals,minutes*60+seconds,teams[patch.winner].id])).digest('hex');
}

function syncSeries(patch,p,match,teams,game){
  patch.bestOf=p.bestOf[Playoffs.round(match.index)];
  patch.game=Math.min(patch.bestOf,Math.max(1,game));
  for(const side of ['blue','red']){
    const slot=Playoffs.team(match.blue)?.id===teams[side].id?'blue':'red';
    patch[side]??={};patch[side].score=match[slot+'Score'];
  }
}

function prepareResult(state,input,{source='match',id='',now=Date.now()}={}){
  const patch=structuredClone(input),teams=identifyPatch(patch),p=Playoffs.migrate(state.playoffs);
  const report={status:'waiting',message:'Waiting for three registered IGNs on each side and a complete result.'};
  if(!p.autoResults)return {patch,report:{status:'disabled',message:'Automatic playoff scoring is off.'}};
  if(!teams.blue||!teams.red)return {patch,report};
  const matches=matchingMatches(p,teams);
  if(matches.length!==1)return {patch,report:{status:matches.length?'ambiguous':'unmatched',message:matches.length?'This team pairing appears in more than one bracket match.':'These teams do not share a ready playoff matchup.'}};
  const match=matches[0],winnerTeam=teams[patch.winner]?.id;
  const signature=fingerprint(patch,teams);
  if(!winnerTeam||!signature)return {patch,report};
  Object.assign(report,{match:match.index,winnerTeam,blueTeam:teams.blue.id,redTeam:teams.red.id});
  const previous=p.results.find(r=>id&&r.id?r.id===id:r.fingerprint===signature);
  if(previous){
    const samePair=[previous.blueTeam,previous.redTeam].includes(teams.blue.id)&&[previous.blueTeam,previous.redTeam].includes(teams.red.id);
    if(previous.winnerTeam!==winnerTeam||!samePair)return {patch,report:{...report,status:'conflict',message:'This game was already recorded with a different result. Review the bracket score.'}};
    if(id&&!previous.id){patch.playoffs=structuredClone(p);patch.playoffs.results[p.results.indexOf(previous)].id=id;}
    syncSeries(patch,p,match,teams,previous.game);
    return {patch,report:{...report,status:'duplicate',message:'This game is already counted in the playoff bracket.'}};
  }
  if(match.winner)return {patch,report:{...report,status:'complete',message:'This playoff series is already complete.'}};
  if(source==='capture'&&!p.captureArmed)return {patch,report:{...report,status:'held',message:'Result already captured. Waiting for the next draft or opening game clock.'}};
  if(p.results.length>=1000)return {patch,report:{...report,status:'held',message:'The playoff result history is full.'}};
  const winningSlot=Playoffs.team(match.blue)?.id===winnerTeam?'blue':'red';
  const next=Playoffs.edit(p,match.index,winningSlot+'Score',match[winningSlot+'Score']+1);
  const game=match.blueScore+match.redScore+1;
  next.results.push({id,fingerprint:signature,match:match.index,game,blueTeam:teams.blue.id,redTeam:teams.red.id,winnerTeam,source,recordedAt:now});
  next.captureArmed=false;
  const updated={...Playoffs.resolved(next)[match.index],index:match.index};
  syncSeries(patch,next,updated,teams,game);
  patch.playoffs=next;
  const score=updated.blueScore+'-'+updated.redScore;
  return {patch,report:{...report,status:'applied',score,clinched:!!updated.winner,message:`${winnerTeam} wins game ${game}. Match ${match.index+1}: ${score}${updated.winner?' — '+winnerTeam+(match.index<6?' advances.':' wins the championship.'):'.'}`}};
}

// Only fresh readings from the current capture mode can identify organizations;
// existing on-air player names may belong to the previous game or opposite side.
function prepareDetection(state,body,observed){
  for(const r of body.readings)observed.set(r.field,r.value);
  const evidence={blue:{players:[]},red:{players:[]}};
  for(const [field,value] of observed){
    const [side,group,index,key]=field.split('.');
    if(group==='players'&&key==='name')evidence[side].players[index]={name:value};
    else if(field==='gameTime')evidence.gameTime=value;
    else if(group==='kills')evidence[side].kills=value;
    else if(field==='winner')evidence.winner=value;
    else if(field==='resultStatus'&&!observed.has('winner'))evidence.winner=Detection.resultOutcome(value);
  }
  const teams=identifyTeams(evidence),patch={};
  for(const side of ['blue','red'])if(teams[side])patch[side]=Playoffs.identity(teams[side]);
  const p=Playoffs.migrate(state.playoffs);
  if(body.mode==='result'){
    const prepared=prepareResult(state,evidence,{source:'capture'});
    // Detection owns player/stat updates. The result service supplies identity,
    // organization-based series scores and a single persistent bracket commit.
    for(const side of ['blue','red'])if(prepared.patch[side]?.tag){
      patch[side]=Playoffs.identity(teams[side]);
      if(prepared.patch[side].score!==undefined)patch[side].score=prepared.patch[side].score;
    }
    for(const key of ['playoffs','game','bestOf'])if(prepared.patch[key]!==undefined)patch[key]=prepared.patch[key];
    return {patch,report:prepared.report};
  }
  if(p.autoResults){
    const opening=body.readings.some(r=>r.field==='draftPhase'||r.field==='gameTime'&&/^0[0-2]:[0-5]\d$/.test(r.value));
    if(!p.captureArmed&&opening)patch.playoffs={captureArmed:true};
    const matches=matchingMatches(p,teams);
    if(matches.length===1&&!matches[0].winner)syncSeries(patch,p,matches[0],teams,matches[0].blueScore+matches[0].redScore+1);
  }
  return {patch,report:null};
}

module.exports={identifyTeams,identifyPatch,matchingMatches,resultId,prepareResult,prepareDetection};
