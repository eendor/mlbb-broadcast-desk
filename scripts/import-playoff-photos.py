"""Package all local playoff poses and photos explicitly paired with registration IGNs."""
import base64, hashlib, io, json, re, subprocess, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageOps
import pymupdf

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'PLAYOFFS'
OUT=ROOT/'public/assets/playoffs/portraits'
OUT.mkdir(parents=True,exist_ok=True)
teams=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./public/playoffs-model').teams))"],cwd=ROOT).decode('utf8'))
manifest={'poses':[],'players':[]}
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
aliases={'apo':'APO','fsms':'FSMS','jmes':'JMES','jmess':'JMES','pice':'PICE','psits':'PSITS','uls':'ULS-CED','usl':'ULS-CED','usmearthsavers':'EARTH SAVERS','earthsavaers':'EARTH SAVERS','uttts':'UFTTS','uffts':'UFTTS'}
def package(raw):
    digest=hashlib.sha256(raw).hexdigest()[:24]
    with Image.open(io.BytesIO(raw)) as im:
        im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((1800,1800))
        im.save(OUT/(digest+'.jpg'),quality=92,optimize=True)
        im.thumbnail((260,320));im.save(OUT/(digest+'-thumb.webp'),quality=80)
    return {'url':'/assets/playoffs/portraits/'+digest+'.jpg','thumb':'/assets/playoffs/portraits/'+digest+'-thumb.webp'}
def member(z,name):
    # Several supplied Word files contain stale CRC fields; Pillow verifies the recovered media.
    with z.open(name) as f:
        f._expected_crc=None
        return f.read()
def register(id,index,raw,source):
    t=next(t for t in teams if t['id']==id)
    manifest['players'].append({'team':id,'ign':t['players'][index],'source':source,**package(raw)})
for folder in sorted(SOURCE.glob('POSE*')):
    for p in sorted(folder.rglob('*.jpg')):
        id=aliases.get(re.sub('[^a-z]','',p.parent.name.lower()))
        if not id:raise ValueError('Unmapped photo folder: '+str(p.parent))
        manifest['poses'].append({'team':id,'pose':'formal' if 'formal' in folder.name.lower() else 'freestyle','filename':p.name,**package(p.read_bytes())})
def photo_stem(name):
    return re.sub(r'[\\/:*?"<>|]','_',name).rstrip(' .')
for t in teams:
    for ign in t['players']:
        filename=photo_stem(ign)+'.jpg'
        pose=next((p for p in manifest['poses'] if p['team']==t['id'] and p['pose']=='formal' and p['filename']==filename),None)
        if pose:manifest.setdefault('formalPlayers',[]).append({'team':t['id'],'ign':ign,'source':filename,'url':pose['url'],'thumb':pose['thumb']})
    linked=[p for p in manifest.get('formalPlayers',[]) if p['team']==t['id']]
    if len(linked)!=len(t['players']):raise ValueError(f"{t['id']}: expected {len(t['players'])} IGN-named formal photos, found {len(linked)}")
doc_ids={'Earth Savers Club.docx':'EARTH SAVERS','Junior Marketing Executives Society.docx':'JMES','Philippines Institution of Civil Engineers.docx':'PICE','ULS.docx':'ULS-CED','FSMS.docx':'FSMS'}
for filename,id in doc_ids.items():
    with zipfile.ZipFile(SOURCE/'TEAM IGN'/filename) as z:
        root=ET.fromstring(z.read('word/document.xml'))
        rels={n.get('Id'):n.get('Target') for n in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
        table=root.find('.//w:tbl',ns);rows=table.findall('./w:tr',ns)
        photo_row=rows[0 if id in ('PICE','FSMS') else 4]
        cells=photo_row.findall('./w:tc',ns);found={}
        for ci,cell in enumerate(cells):
            if ci==0:continue
            for draw in cell.findall('.//w:drawing',ns):
                blip=draw.find('.//a:blip',ns)
                if blip is None:continue
                rid=blip.get('{'+ns['r']+'}embed')
                if id=='EARTH SAVERS' and rid=='rId9':continue # repeated registration watermark
                index=ci-1
                offset=draw.find('.//wp:positionH/wp:posOffset',ns)
                if id=='JMES' and offset is not None and int(offset.text)>1000000:index+=1 # anchored into adjacent player column
                found[index]=rid
        for index,rid in sorted(found.items()):
            if index>=len(next(t for t in teams if t['id']==id)['players']):continue
            register(id,index,member(z,'word/'+rels[rid]),filename)
pdf_ids={'ALPHA PHI OMEGA.pdf':('APO',150,300),'Philippine Society of Information Technology Students.pdf':('PSITS',170,230),'Union of Filipino Tourism and Travel Students.pdf':('UFTTS',170,220)}
for filename,(id,min_x,min_y) in pdf_ids.items():
    with pymupdf.open(SOURCE/'TEAM IGN'/filename) as doc:
        page=doc[0]
        blocks=[b for b in page.get_text('dict')['blocks'] if b['type']==1 and b['bbox'][0]>min_x and min_y<=b['bbox'][1]<min_y+20]
        blocks.sort(key=lambda b:b['bbox'][0])
        assert len(blocks)==len(next(t for t in teams if t['id']==id)['players']),(filename,len(blocks))
        for i,b in enumerate(blocks):register(id,i,b['image'],filename)
(OUT.parent/'player-photos.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(f"Imported {len(manifest['poses'])} poses; {len(manifest['players'])} document-linked IGN portraits.")
