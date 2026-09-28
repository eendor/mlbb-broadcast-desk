import pathlib,re,json
s=pathlib.Path('data/lore-app.js').read_text(encoding='utf-8')
for m in list(re.finditer('baseURL|api.mobile|api/|hero/list|getHeroList',s))[:25]: print(s[max(0,m.start()-100):m.end()+180])
g=pathlib.Path('data/giphy.html').read_text(encoding='utf-8')
for m in list(re.finditer('"title"',g))[:20]:print(g[max(0,m.start()-100):m.start()+220])
