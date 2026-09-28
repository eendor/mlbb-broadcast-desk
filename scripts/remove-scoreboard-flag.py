from pathlib import Path
p=Path('public/scoreboard-reference.js');s=p.read_text(encoding='utf-8-sig');s=s.replace('<div class="sb-flag"><img src="/assets/scoreboard/philippines.png" alt="Philippines"></div>','');p.write_text(s,encoding='utf-8')
p=Path('public/scoreboard-reference.css');s=p.read_text(encoding='utf-8-sig');s=s.replace('left:190px;width:1540px','left:235px;width:1450px').replace('grid-template-columns:90px 135px 350px 130px 180px 130px 390px 135px','grid-template-columns:135px 350px 130px 180px 130px 390px 135px');p.write_text(s,encoding='utf-8')
