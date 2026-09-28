# -*- coding: utf-8 -*-
"""Most-played hero across the whole Swiss tournament.

Aggregates every player pick from the fetched battle data (battleData_raw.json)
and reports per hero: picks, wins, win rate, K/D/A, game-MVP badges, avg score.
Hero ids are mapped to official Moonton hero names (mlbb_heroes_final_map.json).
"""
import csv, json
from collections import defaultdict, Counter

BASE = r"D:/Desktop/OBS Mobile Legends ML Setup/analyze_ml"
AGG_PATH = BASE + "/mlbb_data/battleData_raw.json"
HERO_MAP = BASE + "/mlbb_heroes_final_map.json"
OUT_CSV = BASE + "/mlbb_tournament_hero_usage.csv"

heroes = json.load(open(HERO_MAP, encoding="utf-8"))
hero_map = {int(k): v for k, v in heroes.items()}
battles = json.load(open(AGG_PATH, encoding="utf-8"))

stats = defaultdict(lambda: dict(picks=0, wins=0, k=0, d=0, a=0, mvp=0, score=0.0))
used_battles = 0
for bid, rec in battles.items():
    bd = rec.get("battleData") or {}
    pl = bd.get("player_list") or []
    if not pl:
        continue
    used_battles += 1
    wc = bd.get("win_camp")
    for p in pl:
        hid = p.get("heroid")
        if hid is None:
            continue
        s = stats[hid]
        s["picks"] += 1
        if wc in (1, 2) and p.get("camp") == wc:
            s["wins"] += 1
        s["k"] += p.get("kill_num", 0)
        s["d"] += p.get("dead_num", 0)
        s["a"] += p.get("assist_num", 0)
        s["mvp"] += 1 if p.get("is_mvp") else 0
        s["score"] += p.get("score", 0)

rows = []
for hid, s in stats.items():
    rows.append({
        "HeroID": hid,
        "HeroName": hero_map.get(hid, f"?({hid})"),
        "Picks": s["picks"],
        "Wins": s["wins"],
        "WinRate": round(s["wins"] / s["picks"], 3),
        "K": s["k"], "D": s["d"], "A": s["a"],
        "KDA": round((s["k"] + s["a"]) / max(1, s["d"]), 2),
        "GameMVP": s["mvp"],
        "AvgScore": round(s["score"] / s["picks"], 2),
    })
rows.sort(key=lambda r: (-r["Picks"], -r["WinRate"], r["HeroID"]))

with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print(f"Battles with player data: {used_battles} | distinct heroes used: {len(rows)}")
print(f"Saved: {OUT_CSV}")

# ---- Most Played Heroes top-10 table (curated columns, skips the id-0 placeholder) ----
TOP10_CSV = BASE + "/mlbb_most_played_heroes.csv"
top10 = [r for r in rows if r["HeroID"] != 0][:10]
with open(TOP10_CSV, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["Hero", "Picks", "W/L", "Win%", "K/D/A", "Game MVP"])
    for r in top10:
        # ="15-16" Excel trick: keeps W/L as TEXT (Excel turns 15-16 into a date)
        w.writerow([f"{r['HeroName']} (id {r['HeroID']})", r["Picks"],
                    f'="{r["Wins"]}-{r["Picks"] - r["Wins"]}"', f"{r['WinRate']*100:.1f}%",
                    f"{r['K']}/{r['D']}/{r['A']}", r["GameMVP"]])
print(f"Saved: {TOP10_CSV}  ({len(top10)} heroes)")

print("\n=== MOST PLAYED HEROES OF THE TOURNAMENT ===")
for r in rows[:20]:
    flag = "  (hero id 0 = unknown/no hero)" if r["HeroID"] == 0 else ""
    print(f"{r['Picks']:>3} picks  {r['HeroName']:<12} id {r['HeroID']:>3}  "
          f"win {r['Wins']:>2}/{r['Picks']:>2}  {r['WinRate']*100:>5.1f}%  "
          f"KDA {r['K']}/{r['D']}/{r['A']}  MVPx{r['GameMVP']}{flag}")