"""Deterministic logo cutouts. Originals remain untouched. Requires Pillow, numpy, opencv-python."""
from pathlib import Path
import json
from urllib.parse import quote
import numpy as np
import cv2
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
source=root/'public/assets/logos'
out=root/'public/assets/logos-transparent'
out.mkdir(exist_ok=True)
mapping={}
for p in sorted(source.iterdir()):
    im=Image.open(p).convert('RGBA'); a=np.array(im); rgb=a[:,:,:3]; h,w=rgb.shape[:2]
    if a[:,:,3].min()<128:
        result=im
    elif p.name in ['ICpEP.jpg','JPEDS_.jpg']:
        # Separate photographic/textured backgrounds with foreground-seeded GrabCut.
        yy,xx=np.mgrid[:h,:w]
        if p.name=='JPEDS_.jpg': cx,cy,rx,ry=470,384,266,266
        else: cx,cy,rx,ry=w*.5,h*.5,w*.456,h*.456
        dist=((xx-cx)/rx)**2+((yy-cy)/ry)**2
        mask=np.full((h,w),cv2.GC_PR_BGD,np.uint8)
        mask[dist<1]=cv2.GC_PR_FGD
        mask[dist<.74]=cv2.GC_FGD
        mask[dist>1.16]=cv2.GC_BGD
        cv2.grabCut(rgb,mask,None,np.zeros((1,65)),np.zeros((1,65)),6,cv2.GC_INIT_WITH_MASK)
        a[:,:,3]=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0)
        result=Image.fromarray(a)
    else:
        edge=np.concatenate([rgb[:3].reshape(-1,3),rgb[-3:].reshape(-1,3),rgb[:,:3].reshape(-1,3),rgb[:,-3:].reshape(-1,3)])
        bg=np.median(edge,axis=0)
        diff=np.max(np.abs(rgb.astype(float)-bg),axis=2)
        white=bg.min()>200
        dark=bg.max()<90
        if white:
            candidate=(rgb.min(axis=2)>215)&(np.ptp(rgb.astype(int),axis=2)<38)
        else:
            candidate=diff<(48 if dark else 35)
        # Typography-only logos need enclosed background in letter counters removed too.
        text_only=p.name in ['APO.jpg','JPES.jpg','TRIMMOC .jpeg','USM-Environmental Science Society.jpg','MicroSoc.jpg','FOOD TECHNOLOGY_.jpg','Screenshot 2025-09-14 185949.png']
        if text_only:
            if p.name=='Screenshot 2025-09-14 185949.png':
                candidate=(rgb[:,:,1]<95)&(rgb[:,:,2]<90)&(rgb[:,:,0]>rgb[:,:,1]*1.35)
            if p.name=='MicroSoc.jpg': candidate=rgb.max(axis=2)<125
            removed=candidate
        else:
            padded=np.pad(candidate.astype('uint8'),1,constant_values=1)
            cv2.floodFill(padded,None,(0,0),2)
            removed=padded[1:-1,1:-1]==2
        a[:,:,3][removed]=0
        result=Image.fromarray(a)
    # Tight, consistent transparent padding, keeping all foreground pixels.
    bbox=result.getbbox()
    if not bbox: raise RuntimeError('Empty logo: '+p.name)
    result=result.crop(bbox)
    pad=max(4,round(max(result.size)*.035))
    canvas=Image.new('RGBA',(result.width+pad*2,result.height+pad*2))
    canvas.paste(result,(pad,pad))
    dest=out/(p.name+'.png');canvas.save(dest,optimize=True)
    mapping['/assets/logos/'+quote(p.name)]='/assets/logos-transparent/'+quote(dest.name)
    print(p.name, 'transparent',round(100*(np.array(canvas)[:,:,3]==0).mean()),'%')
(root/'public/assets/logo-transparency.json').write_text(json.dumps(mapping,indent=2)+'\n')
# Embed the map so even existing saved productions use the cutouts without changing state.
(root/'public/logo-transparency.js').write_text('''// Use transparent copies while preserving original logo choices and saved production URLs.
(() => {
 const paths = '''+json.dumps(mapping)+''';
 const normalized = new Map(Object.entries(paths).map(([key,value])=>[decodeURIComponent(key),value]));
 function update(img) {
   const raw=img.getAttribute('src');
   if(!raw)return;
   try { const url=new URL(raw,location.href); if(url.origin!==location.origin)return;
     const replacement=normalized.get(decodeURIComponent(url.pathname));
     if(replacement)img.setAttribute('src',replacement);
   } catch {}
 }
 function scan(node) { if(node.nodeType!==1)return; if(node.matches('img'))update(node); node.querySelectorAll('img').forEach(update); }
 new MutationObserver(records=>records.forEach(record=>{if(record.type==='attributes')update(record.target);else record.addedNodes.forEach(scan);})).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 scan(document.documentElement);
})();
''')
