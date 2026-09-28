import pathlib,json,re,urllib.request,urllib.parse,concurrent.futures
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Icons(HTMLParser):
 def __init__(self):super().__init__();self.rows=[]
 def handle_starttag(self,tag,attrs):
  if tag!='img':return
  a=dict(attrs);alt=a.get('alt','');src=a.get('src','')
  if ' - ' not in alt or 'hero released' not in alt:return
  url=urllib.parse.parse_qs(urllib.parse.urlparse(src).query).get('url',[src])[0]
  if urllib.parse.urlparse(url).hostname!='akmweb.youngjoygame.com':return
  self.rows.append({'name':alt.split(' - ')[0],'url':url})
p=Icons();page=(ROOT/'data/heroes-page.html').read_text(encoding='utf-8');p.feed(page)
decoded=page.replace('\\"','"')
start=decoded.find('"heroes":[{"id":')
if start>=0:
 roster,_=json.JSONDecoder().raw_decode(decoded[start+len('"heroes":'):])
 p.rows=[{'name':r['name'],'url':r['splashArt']} for r in roster if urllib.parse.urlparse(r['splashArt']).hostname=='akmweb.youngjoygame.com']
print('Current hero cards:',len(p.rows),flush=True)
catalog_path=ROOT/'public/assets/catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8-sig'))
key=lambda s:re.sub('[^a-z0-9]','',s.lower())
existing={key(h['name']):h for h in catalog['heroes']};out=ROOT/'public/assets/hero-icons';out.mkdir(exist_ok=True)
def download(row):
 k=key(row['name']);url=row['url'];file=k+pathlib.Path(urllib.parse.urlparse(url).path).suffix
 with urllib.request.urlopen(url,timeout=30) as r:data=r.read()
 if len(data)<1000:raise ValueError('Invalid artwork '+row['name'])
 (out/file).write_bytes(data)
 h=existing.get(k,{'name':row['name']});h['name']=row['name'];h['icon']='/assets/hero-icons/'+file;h['iconSource']=url
 # Current game database portraits supplement the partial official lore roster.
 h.setdefault('img',h['icon']);return k,h
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for k,h in pool.map(download,p.rows):existing[k]=h
# Merge the official service's latest/revamped hero highlights fetched separately.
latest=json.loads((ROOT/'data/official-response.json').read_text(encoding='utf-8'))['data']
dest=ROOT/'public/assets/heroes-current'
for r in latest:
 name=r['name'].strip();k=key(name);url='https:'+r['hero_cast_image'];file=k+pathlib.Path(url.split('?')[0]).suffix
 with urllib.request.urlopen(url,timeout=30) as response:(dest/file).write_bytes(response.read())
 h=existing.setdefault(k,{'name':name});h.update(img='/assets/heroes-current/'+file,source=url,officialId=r['id'])
catalog['heroes']=sorted(existing.values(),key=lambda h:h['name'].lower());catalog['iconArtworkCount']=len(p.rows)
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
print('Icon refresh complete; total heroes',len(catalog['heroes']),flush=True)
