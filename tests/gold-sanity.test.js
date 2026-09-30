const test=require('node:test'),assert=require('node:assert/strict');
const OCR=require('../public/ocr-model'),{defaults}=require('../lib/state');
const Live=require('../lib/live-detection');
test('gold rejects missing-decimal noise and hundred-thousand readings early in the match',()=>{
 const s=defaults();s.gameTime='03:00';
 assert.equal(OCR.parse('1234k','blue.gold'),null);
 assert.equal(OCR.parse('123456','blue.players.0.gold'),null);
 assert.equal(OCR.goldPlausible(123000,s,'blue.gold'),false);
 assert.equal(OCR.goldPlausible(18000,s,'blue.gold'),true);
 assert.deepEqual(OCR.patch(s,[{field:'blue.gold',value:123000}]),{});
 const d=Live.prepare(s,{mode:'game',readings:[{field:'blue.gold',value:123000}],sampledAt:Date.now(),live:true,switchScene:false});
 assert.deepEqual(d.held,['blue.gold']);assert.equal(d.patch.blue,undefined);
 s.gameTime='30:00';assert.equal(OCR.goldPlausible(120000,s,'blue.gold'),true);
});
