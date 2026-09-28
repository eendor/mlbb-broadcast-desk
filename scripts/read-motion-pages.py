from html.parser import HTMLParser
from pathlib import Path
class P(HTMLParser):
 def handle_starttag(self,t,a):
  d=dict(a);v=d.get('href') or d.get('src') or ''
  if any(k in v for k in ['mp4','download','mobile-legends']):print(t,v)
for f in ['hanabi-motion.html','motion-catalog.html']:
 s=Path('data',f).read_text(encoding='utf-8');print(f,len(s));P().feed(s)
