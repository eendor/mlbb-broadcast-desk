from pathlib import Path
p=Path('public/overlay.html');s=p.read_text(encoding='utf-8-sig').replace('</head>','<link rel="stylesheet" href="/scoreboard-reference.css"></head>');s=s.replace('<script src="/overlay.js">','<script src="/scoreboard-reference.js"></script><script src="/overlay.js">');p.write_text(s,encoding='utf-8')
p=Path('public/overlay.js');s=p.read_text(encoding='utf-8-sig');start=s.index("if(scene==='scoreboard')");end=s.index("else if(scene==='draft')",start);s=s[:start]+"if(scene==='scoreboard')renderReferenceScoreboard(s);\n"+s[end:];p.write_text(s,encoding='utf-8')
