from html.parser import HTMLParser
import urllib.request,pathlib
class Links(HTMLParser):
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ['a','source','video']:
   v=a.get('href') or a.get('src')
   if v and any(k in v.lower() for k in ['mobile','hanabi','hanzo','floryn','beatrix','kagura','ling','kadita','mp4']):print(v)
url='https://motionbgs.com/pubg-mobile'
with urllib.request.urlopen(url,timeout=20) as r:s=r.read().decode()
pathlib.Path('data/motion-live.html').write_text(s,encoding='utf-8');Links().feed(s)
