import pathlib,re
s=pathlib.Path('data/heroes-page.html').read_text(encoding='utf-8')
for m in list(re.finditer('Aamon',s))[-5:]:print(s[m.start()-180:m.start()+900])
