import re,json,pathlib
for filename in ['official-heroes.html','heroes-page.html','giphy.html']:
 s=pathlib.Path('data',filename).read_text(encoding='utf-8-sig')
 print('\nFILE',filename)
 if filename=='official-heroes.html': print(re.findall(r'<script[^>]*src=([^ >]+)',s))
 elif filename=='heroes-page.html':
  print(re.findall(r'<img[^>]+>',s)[:5])
  for word in ['Hirara','Aamon']: 
   i=s.find(word);print(s[max(0,i-400):i+300])
 else:
  print(re.findall(r'https[^"\s<>]+\.gif[^"\s<>]*',s)[:6])
  print(re.findall(r'<script[^>]*id=[^>]+>',s)[-5:])
