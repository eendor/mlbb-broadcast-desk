const fs=require('node:fs'),path=require('node:path');
let library;
function load(){
 if(library)return library;
 const file=path.join(__dirname,'../public/assets/mlbb-cdn/manifest.json');
 if(!fs.existsSync(file))return null;
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 return library={heroes:Object.fromEntries(data.heroes.map(h=>[h.id,{name:h.name,icon:h.face||h.icon}])),items:Object.fromEntries(data.items.map(i=>[i.id,{name:i.name,icon:i.icon}]))};
}
module.exports={load};
