import pathlib,re
for name in ['motion-heroes.html','moe-heroes.html']:
 s=pathlib.Path('data',name).read_text(encoding='utf-8');print(name,len(s));print('\n'.join(dict.fromkeys(re.findall(r'href=["\']([^"\']+)["\']',s)))[:5000])
