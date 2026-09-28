import json,re,pathlib
s=pathlib.Path('data/giphy.html').read_text(encoding='utf-8').replace('\\"','"').replace('\\/','/')
# Inspect public GIF metadata without executing the page's scripts.
for m in re.finditer(r'"title":"([^"]+)"',s):
 t=m.group(1);snippet=s[max(0,m.start()-180):m.end()+450]
 if 'GIF' in t:print(snippet[:650])
