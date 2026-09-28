from pathlib import Path
from html.parser import HTMLParser
import subprocess,json,concurrent.futures,re
root=Path(__file__).resolve().parents[1];cache=root/'data/motion';cache.mkdir(exist_ok=True);dest=root/'public/assets/hero-motion';dest.mkdir(exist_ok=True)
def fetch(url,file):
 subprocess.run(['curl.exe','-f','-L','-s','--max-time','45',url,'-o',str(file)],check=True)
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.videos=[]
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=='a' and a.get('href','').endswith('-mobile-legends'):self.links.append(a['href'])
  if t=='source' and '.mp4' in a.get('src',''):self.videos.append(a['src'])
p=Links();p.feed((root/'data/motion-catalog.html').read_text(encoding='utf-8'));slugs=list(dict.fromkeys(p.links));slugs=[s for s in slugs if s!='/skylark-mobile-legends']
catalog_file=root/'public/assets/catalog.json';catalog=json.loads(catalog_file.read_text(encoding='utf-8'));byname={h['name'].lower():h for h in catalog['heroes']}
def one(slug):
 name=slug.strip('/').removesuffix('-mobile-legends');name={'zhou':'chou'}.get(name,name)
 if name not in byname:return None
 html=cache/(name+'.html');fetch('https://motionbgs.com'+slug,html);page=Links();page.feed(html.read_text(encoding='utf-8'))
 if not page.videos:raise RuntimeError('No video for '+name)
 url='https://motionbgs.com'+page.videos[0] if page.videos[0].startswith('/') else page.videos[0]
 video=dest/(name+'.mp4');fetch(url,video)
 if video.read_bytes()[4:8]!=b'ftyp':raise RuntimeError('Invalid MP4 '+name)
 return name,{'animation':'/assets/hero-motion/'+name+'.mp4','animationSource':'https://motionbgs.com'+slug,'animationMediaSource':url,'animationPosition':50}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for f in concurrent.futures.as_completed([pool.submit(one,s) for s in slugs]):
  try:
   result=f.result()
   if result:results.append(result);print('Downloaded moving hero:',result[0],flush=True)
  except Exception as e:print('FAILED:',str(e),flush=True)
for name,fields in results:byname[name].update(fields)
for h in catalog['heroes']:
 for k in ['gif','gifSource','gifType']:h.pop(k,None)
catalog['movingHeroCount']=len(results);catalog_file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8');print('Motion assets installed:',len(results),flush=True)
