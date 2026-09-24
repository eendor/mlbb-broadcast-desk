const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load}=require('../lib/asset-library'),{battlePlayers}=require('../lib/parser');
test('official hero and equipment IDs resolve to downloaded local artwork',()=>{
 const assets=load(),manifest=require('../public/assets/mlbb-cdn/manifest.json');
 assert.equal(Object.keys(assets.heroes).length,manifest.heroes.length);assert.equal(Object.keys(assets.items).length,manifest.items.length);
 for(const item of [...Object.values(assets.heroes),...Object.values(assets.items)]){assert.ok(item.name);if(!item.icon){assert.match(item.name,/\(removed\)$/);continue;}assert.ok(item.icon.startsWith('/assets/mlbb-cdn/'));assert.ok(fs.existsSync(path.resolve(__dirname,'../public'+item.icon)));}
 const [heroId,hero]=Object.entries(assets.heroes)[0],[itemId,item]=Object.entries(assets.items)[0];
 const rows=Array.from({length:5},(_,pos)=>({camp:1,pos,heroid:Number(heroId),equip_list:[Number(itemId)]}));
 const players=battlePlayers(rows,1,assets);assert.equal(players[0].hero,hero.name);assert.equal(players[0].heroIcon,hero.icon);assert.deepEqual(players[0].items,[{id:Number(itemId),name:item.name,icon:item.icon}]);
});
