const OCRModel=require('../public/ocr-model');
const fields=new Set(Object.values(OCRModel.profiles).flat().map(r=>r.field));
function prepare(state,body,now=Date.now()){
  if(!body||!Array.isArray(body.readings)||!body.readings.length||body.readings.length>60||typeof body.live!=='boolean'||!Number.isFinite(body.sampledAt)||body.sampledAt>now+1000||body.sampledAt<now-30000)throw Error('Invalid or expired OCR readings');
  const seen=new Set();
  for(const r of body.readings){
    if(!r||!fields.has(r.field)||seen.has(r.field)||OCRModel.parse(String(r.value),r.field)!==r.value)throw Error('Invalid OCR field or value');
    seen.add(r.field);
  }
  const patch=OCRModel.patch(state,body.readings);
  if(patch.gameTime){const [m,s]=patch.gameTime.split(':').map(Number);patch.gameClock={running:body.live,seconds:m*60+s,syncedAt:body.sampledAt};}
  if(patch.draftTimer&&body.live){patch.draftTimer.endAt=body.sampledAt+patch.draftTimer.remaining*1000;}
  return patch;
}
module.exports={prepare};
