const forbidden=['__proto__','constructor','prototype'];
function get(obj,path){return String(path).replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean).reduce((v,k)=>forbidden.includes(k)?undefined:v?.[k],obj);}
function set(obj,path,value){const keys=path.split('.');if(keys.some(k=>forbidden.includes(k)))throw Error('Invalid mapping path');let p=obj;keys.forEach((k,i)=>{if(i===keys.length-1)p[k]=value;else p=p[k]??=(/^\d+$/.test(keys[i+1])?[]:{});});}
function numeric(v){if(typeof v==='number')return v;const m=String(v).replace(/,/g,'').trim().match(/^(\d+(?:\.\d+)?)\s*([km])?$/i);if(!m)throw Error(`Invalid number: ${v}`);return Number(m[1])*({k:1000,m:1000000}[m[2]?.toLowerCase()]||1);}
function clock(v){if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v).trim())){const seconds=Math.max(0,Math.floor(Number(v)));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}return String(v);}
const roles=['EXP','JUNGLE','MID','GOLD','ROAM'];
function battleObjectives(battle){
 const out={blue:{},red:{}};
 const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 const val=v=>{try{const n=numeric(v);return Number.isFinite(n)&&n>=0&&n<=50?n:undefined;}catch{return undefined;}};
 const sides={blue:['blue','bluecamp','campblue','blueteam','teamblue','camp2','team2','camp_2','team_2'],red:['red','redcamp','campred','redteam','teamred','camp1','team1','camp_1','team_1']};
 const mets={
  turrets:['tower','towers','turret','turrets','towerdestroy','towerdestroyed','destroytower','destroyedtower','pushtower','pushedtower','towerkill','towerkills','towersdestroyed','destroyed_tower_num','destroy_tower_num','kill_tower_num','tower_num','pushtowernum','towerdestroynum'],
  lord:['lord','lords','lordkill','lordkills','killedlord','lordcount','lordnum','lordkillnum','killlordnum','kill_lord_num','kill_boss_num','boss_num','killboss','lordkilled'],
  turtle:['turtle','turtles','turtlekill','turtlekills','turtlecount','turtlenum','killturtle','killturtles','kill_turtle_num','dragon','dragons','dragonkill','dragonkills','kill_dragon_num','dragon_num','turtlekilled']
 };
 const combo=(obj,side,aliases)=>{for(const k of Object.keys(obj||{})){const nk=norm(k);for(const p of sides[side])for(const m of aliases){const nm=norm(m);if(nk===p+nm||nk===nm+p){const v=val(obj[k]);if(v!==undefined)return v;}}}return undefined;};

 if(Array.isArray(battle?.player_list)){
  for(const p of battle.player_list){
   const c=String(p.camp??p.campid??p.camp_id??'');
   const side=c==='1'||c==='camp1'?'red':c==='2'||c==='camp2'?'blue':null;
   if(!side)continue;
   for(const [metric,aliases] of Object.entries(mets)){
    for(const [k,v] of Object.entries(p)){
     if(aliases.some(a=>norm(a)===norm(k))){
      const n=val(v);
      if(n!==undefined){
       const sumKey='_'+metric+'Sum';
       out[side][sumKey]=(out[side][sumKey]||0)+n;
      }
     }
    }
   }
  }
 }

 const visit=(node,side=null,depth=0)=>{
  if(!node||typeof node!=='object'||depth>6)return;
  if(Array.isArray(node)){
   for(const item of node)visit(item,side,depth+1);
   return;
  }
  const nk=norm(node.camp??node.campid??node.camp_id??'');
  const nodeSide=side||(nk==='1'||nk==='camp1'?'red':nk==='2'||nk==='camp2'?'blue':null);
  for(const [team,aliases] of Object.entries(sides)){
   if(out[team].turrets===undefined){const n=combo(node,team,mets.turrets);if(n!==undefined)out[team].turrets=n;}
   if(out[team].lord===undefined){const n=combo(node,team,mets.lord);if(n!==undefined)out[team].lord=n;}
   if(out[team].turtle===undefined){const n=combo(node,team,mets.turtle);if(n!==undefined)out[team].turtle=n;}
  }
  if(nodeSide&&!node.pos&&!node.equip_list){
   for(const [metric,aliases] of Object.entries(mets)){
    if(out[nodeSide][metric]!==undefined)continue;
    for(const [key,value] of Object.entries(node)){
     if(aliases.some(alias=>norm(alias)===norm(key))){const n=val(value);if(n!==undefined){out[nodeSide][metric]=n;break;}}
    }
   }
  }
  for(const [metric,aliases] of Object.entries(mets)){
   if(out.blue[metric]!==undefined&&out.red[metric]!==undefined)continue;
   for(const [key,value] of Object.entries(node)){
    if(!aliases.some(alias=>norm(alias)===norm(key))||!value||typeof value!=='object'||Array.isArray(value))continue;
    const b=val(value.blue??value.Blue??value.camp2??value.camp_2??value.team2);
    const r=val(value.red??value.Red??value.camp1??value.camp_1??value.team1);
    if(b!==undefined&&out.blue[metric]===undefined)out.blue[metric]=b;
    if(r!==undefined&&out.red[metric]===undefined)out.red[metric]=r;
   }
  }
  for(const [key,value] of Object.entries(node)){
   if(value&&typeof value==='object'&&key!=='player_list'){
    const k=norm(key);
    const childSide=sides.blue.some(p=>k===p||k.startsWith(p))?'blue':sides.red.some(p=>k===p||k.startsWith(p))?'red':nodeSide;
    visit(value,childSide,depth+1);
   }
  }
 };
 visit(battle);
 for(const side of ['blue','red']){
  for(const m of ['turrets','lord','turtle']){
   const sumKey='_'+m+'Sum';
   if(out[side][m]===undefined&&out[side][sumKey]!==undefined)out[side][m]=out[side][sumKey];
   delete out[side][sumKey];
  }
 }
 return out;
}
function battlePlayers(list,camp,assets={}){const players=list.filter(p=>p&&Number(p.camp)===camp).sort((a,b)=>numeric(a.pos??0)-numeric(b.pos??0));if(players.length!==5)return null;return players.map((p,i)=>{const heroId=numeric(p.heroid??p.hero_id??0),heroAsset=assets.heroes?.[heroId],itemIds=(Array.isArray(p.equip_list)?p.equip_list:[]).filter(Boolean).slice(0,6).map(numeric);return{name:String(p.name??`Player ${i+1}`),role:String(p.role??roles[i]),hero:String(p.hero??p.heroName??heroAsset?.name??''),heroId,heroIcon:String(heroAsset?.icon??''),items:itemIds.map(id=>({id,name:String(assets.items?.[id]?.name??`Item ${id}`),icon:String(assets.items?.[id]?.icon??'')})),kda:`${numeric(p.kill_num??0)}/${numeric(p.dead_num??0)}/${numeric(p.assist_num??0)}`,gold:numeric(p.gold_total??p.gold??0),level:numeric(p.max_level??p.level??0)};});}
function normalize(raw,mapping={},assets={},currentState=null){if(!raw||typeof raw!=='object')throw Error('Expected a JSON object');if(raw.code!==undefined&&![0,200,'0','200'].includes(raw.code))throw Error(raw.message||`API error ${raw.code}`);let d=raw.data??raw;if(typeof d==='string'){try{d=JSON.parse(d);}catch{throw Error('Response contains a URL or text; resolve the match feed first');}}const patch={},warnings=[];
 const root=d.matchdata??d;const teams=root.teamdata??root.teams??root;
 for(const [side,aliases] of Object.entries({blue:['blue','blueteam','blueTeam'],red:['red','redteam','redTeam']})){const t=aliases.map(k=>teams[k]).find(v=>v&&typeof v==='object');if(!t)continue;const out={};for(const [dest,srcs] of Object.entries({name:['name','teamname','teamName'],tag:['tag'],score:['score'],kills:['kills','killscore'],gold:['gold','totalgold'],turrets:['turrets','turret'],lord:['lord'],turtle:['turtle']})){const v=srcs.map(k=>t[k]).find(v=>v!==undefined);if(v!==undefined)out[dest]=['name','tag'].includes(dest)?String(v):numeric(v);}for(const metric of ['turrets','lord','turtle']){if((out[metric]===undefined||out[metric]===0)&&currentState?.[side]?.[metric]>0){out[metric]=currentState[side][metric];}}const players=t.players??t.playerlist;if(Array.isArray(players)&&players.length===5)out.players=players.map((p,i)=>({name:String(p.name??p.nickname??`Player ${i+1}`),role:String(p.role??['EXP','JUNGLE','MID','GOLD','ROAM'][i]),hero:String(p.hero??p.heroName??''),kda:String(p.kda??p.KDA??'0/0/0'),gold:numeric(p.gold??0)}));if(Array.isArray(t.bans)&&[3,5].includes(t.bans.length))out.bans=t.bans.map(v=>String(v?.name??v));patch[side]=out;}
 if(root.gameTime!==undefined||root.game_duration!==undefined)patch.gameTime=String(root.gameTime??root.game_duration);
 const battle=root.battleData;if(battle&&typeof battle==='object'){const result=String(root.status||'').toLowerCase()==='result'||root.isClosed===true;if(!result)throw Error('Post-match result is not available yet. Use OCR Capture for live broadcast data.');if(!Array.isArray(battle.player_list))throw Error('The completed match has no player result data yet. Try fetching again shortly.');if(battle.blue_camp_kill!==undefined)patch.blue={...(patch.blue||{}),kills:numeric(battle.blue_camp_kill)};if(battle.red_camp_kill!==undefined)patch.red={...(patch.red||{}),kills:numeric(battle.red_camp_kill)};if(battle.game_time!==undefined)patch.gameTime=clock(battle.game_time);patch.phase='RESULT';const objectives=battleObjectives(battle);for(const side of ['blue','red'])for(const metric of ['turrets','lord','turtle']){if(objectives[side][metric]===undefined||objectives[side][metric]===0){if(currentState?.[side]?.[metric]!==undefined&&currentState[side][metric]>0){objectives[side][metric]=currentState[side][metric];}else if(objectives[side][metric]===undefined){warnings.push(`${side} ${metric} count is not provided by this match feed.`);}}}for(const side of ['blue','red'])for(const [k,v] of Object.entries(objectives[side]))patch[side]={...(patch[side]||{}),[k]:v};if(!Object.keys(objectives.blue).length&&!Object.keys(objectives.red).length)warnings.push('Objectives not in match feed — enter turrets / lord / turtle in Teams & draft.');if([1,'1',2,'2'].includes(battle.win_camp)){patch.winner=[1,'1'].includes(battle.win_camp)?'red':'blue';patch.scene='postgame';}const red=battlePlayers(battle.player_list,1,assets),blue=battlePlayers(battle.player_list,2,assets);if(red){patch.red={...(patch.red||{}),players:red,gold:red.reduce((sum,p)=>sum+p.gold,0)};}if(blue){patch.blue={...(patch.blue||{}),players:blue,gold:blue.reduce((sum,p)=>sum+p.gold,0)};}if(!red||!blue)throw Error('The post-match result does not contain five players for both teams yet.');}
 for(const [destination,source]of Object.entries(mapping)){if(!/^(gameTime|phase|blue\.(name|tag|score|kills|gold|turrets|lord|turtle)|red\.(name|tag|score|kills|gold|turrets|lord|turtle))$/.test(destination))throw Error(`Unsupported destination: ${destination}`);const v=get(raw,source);if(v===undefined){warnings.push(`Missing: ${source}`);continue;}set(patch,destination,/\.(score|kills|gold|turrets|lord|turtle)$/.test(destination)?numeric(v):String(v));}
 if(!Object.keys(patch).length)throw Error('Unrecognized schema. Inspect raw JSON and add field mappings. No broadcast data changed.');require('./playoff-results').identifyPatch(patch);return {patch,warnings};}
function findFeed(raw){const candidates=[raw?.data,raw?.data?.url,raw?.data?.matchUrl,raw?.data?.match_url,raw?.data?.resultUrl,raw?.data?.result_url,raw?.data?.data_url,raw?.data?.feed_url,raw?.url];const found=candidates.find(v=>typeof v==='string'&&/^https:\/\//i.test(v));if(found)return found;const search=(obj,depth=0)=>{if(!obj||typeof obj!=='object'||depth>5)return null;for(const k of Object.keys(obj)){const val=obj[k];if(typeof val==='string'&&/^https:\/\/[^\s"']+/i.test(val)&&(k.toLowerCase().includes('url')||val.includes('match')||val.includes('battle')||val.includes('json')||val.includes('moonton')||val.includes('mobilelegends')))return val;if(typeof val==='object'){const res=search(val,depth+1);if(res)return res;}}return null;};return search(raw?.data)||search(raw)||null;}
module.exports={normalize,get,numeric,findFeed,clock,battlePlayers};
