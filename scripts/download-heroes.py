"""Refresh local artwork from the public official MLBB lore service."""
import json,pathlib,urllib.request,concurrent.futures,re,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
def post(route,payload):
 req=urllib.request.Request('https://api.mobilelegends.com'+route,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
def key(name):return re.sub('[^a-z0-9]','',name.lower())
def main():
 catalog_path=ROOT/'public/assets/catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8-sig'))
 all_rows=[];seen=set()
 for page in range(1,25):
  response=post('/lore/hero/getHeroList',{'page':page,'index_page':1,'lang':'en'})
  if response.get('code')!=0:raise RuntimeError(response)
  rows=response.get('data',[])
  if not isinstance(rows,list):raise RuntimeError('Unexpected official schema')
  fresh=[r for r in rows if r['id'] not in seen]
  if not fresh:break
  all_rows+=fresh;seen.update(r['id'] for r in fresh);print('Official page',page,len(fresh),flush=True)
 (ROOT/'data/official-hero-list.json').write_text(json.dumps(all_rows,indent=2),encoding='utf-8')
 dest=ROOT/'public/assets/heroes-current';dest.mkdir(exist_ok=True)
 # Newest entries come first, so keep those for heroes with revamp duplicates.
 unique={}
 for row in all_rows:unique.setdefault(key(row['name'].strip()),row)
 def download(row):
  name=row['name'].strip();url=row['hero_cast_image'];url='https:'+url if url.startswith('//') else url
  ext=pathlib.Path(url.split('?')[0]).suffix;filename=key(name)+ext
  for attempt in range(3):
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as r:content=r.read()
    if len(content)<1000:raise RuntimeError('Empty image')
    (dest/filename).write_bytes(content)
    return {'name':name,'img':'/assets/heroes-current/'+filename,'source':url,'officialId':row['id'],'downloadedAt':time.strftime('%Y-%m-%d')}
   except Exception:
    if attempt==2:raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:downloaded=list(pool.map(download,unique.values()))
 old={key(h['name']):h for h in catalog['heroes']}
 aliases={'arlot':'arlott','beleric':'belerick','carmila':'carmilla'}
 for h in downloaded:
  k=key(h['name']);previous=old.get(k,{})
  h['aliases']=previous.get('aliases',[])
  for alias,target in aliases.items():
   if k==target and alias in old:h['aliases'].append(old.pop(alias)['name'])
  old[k]=h
 catalog['heroes']=sorted(old.values(),key=lambda h:h['name'].lower())
 catalog['updatedAt']=time.strftime('%Y-%m-%d');catalog['officialArtworkCount']=len(downloaded)
 catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Downloaded',len(downloaded),'official portraits; library',len(catalog['heroes']),flush=True)
if __name__=='__main__':main()
