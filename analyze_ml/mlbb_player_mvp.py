# -*- coding: utf-8 -*-
"""
Player-level Partial MVP for the MLBB Swiss tournament.
Uses per-player stats from the 62 fetched battles + team mapping from the dataset.
Battle data (win_camp / player_list) is treated as ground truth.
"""
import csv, json, os, time
from collections import defaultdict, Counter

BASE = r"D:/Desktop/OBS Mobile Legends ML Setup/analyze_ml"
CSV_PATH = BASE + "/mlbb_swiss_dataset.csv"
AGG_PATH = BASE + "/mlbb_data/battleData_raw.json"
OUT_CSV = BASE + "/mlbb_player_mvp_standings.csv"
HERO_MAP = BASE + "/mlbb_heroes_final_map.json"

rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
battles = json.load(open(AGG_PATH, encoding="utf-8"))

# ---- 1) camp->side mapping check (camp1 == Blue?) ----
votes = Counter()
for r in rows:
    bid = r["BattleID"].strip()
    bd = (battles.get(bid) or {}).get("battleData") or {}
    pl = bd.get("player_list") or []
    if not pl or not r["Winner"].strip() or not (r["BlueSide"].strip() and r["RedSide"].strip()):
        continue
    wc = bd.get("win_camp")
    if wc not in (1, 2):
        continue
    blue_won = r["Winner"].strip() == r["BlueSide"].strip()
    votes["camp1=Blue" if (wc == 1) == blue_won else "camp1=Red"] += 1
SIDE1_IS_BLUE = votes["camp1=Blue"] >= votes["camp1=Red"]
print("Camp mapping votes:", dict(votes), "| assume camp1=Blue:", SIDE1_IS_BLUE)

# ---- 2) per-player aggregation (battle data = ground truth) ----
players = defaultdict(lambda: dict(team_votes=Counter(), gp=0, w=0, l=0, k=0, d=0, a=0,
                                   mvp=0, score=0.0, fight=0.0, dmg=0.0, dmg_share=0.0,
                                   gold=0.0, tower=0.0, heroes=Counter()))

def side_team(blue, red, camp):
    return blue if (camp == 1) == SIDE1_IS_BLUE else red

checked = 0
skipped = []
filled_unknown = []
battle_winner_ok = 0
battle_winner_bad = []
for r in rows:
    bid = r["BattleID"].strip()
    rec = battles.get(bid) or {}
    bd = rec.get("battleData") or {}
    pl = bd.get("player_list") or []
    if not pl:
        continue
    checked += 1
    wc = bd.get("win_camp")
    blue, red, gwinner = r["BlueSide"].strip(), r["RedSide"].strip(), r["Winner"].strip()
    if gwinner and blue and red:
        if gwinner == side_team(blue, red, wc):
            battle_winner_ok += 1
        else:
            battle_winner_bad.append((bid, r["Match"], r["Game"], gwinner, "camp%d"%wc))
    elif not gwinner and blue and red:
        filled_unknown.append((bid, r["Match"], r["Game"], side_team(blue, red, wc)))
    for p in pl:
        name = (p.get("name") or "?").strip()
        st = players[name]
        camp = p.get("camp")
        st["team_votes"][side_team(blue, red, camp) if blue and red else "?"] += 1
        st["gp"] += 1
        if camp == wc:
            st["w"] += 1
        else:
            st["l"] += 1
        st["k"] += p.get("kill_num", 0)
        st["d"] += p.get("dead_num", 0)
        st["a"] += p.get("assist_num", 0)
        st["mvp"] += 1 if p.get("is_mvp") else 0
        st["score"] += p.get("score", 0)
        st["fight"] += p.get("fight_rate", 0)
        st["dmg"] += p.get("hero_hurt", 0)
        st["dmg_share"] += p.get("hero_hurt_rate", 0)
        st["gold"] += p.get("gold_total", 0)
        st["tower"] += p.get("tower_hurt", 0)
        st["heroes"][p.get("heroid")] += 1

print(f"Battles with player data used: {checked}")
print("Battle winner matches transcript:", battle_winner_ok, "| disagreements:", len(battle_winner_bad))
for b in battle_winner_bad[:8]:
    print("   ", b)
print("Winners resolved from battle data (were missing in transcript):")
for b in filled_unknown:
    print("   ", b)

# ---- 3) team = mode of attributions ----
for st in players.values():
    st["team"] = st["team_votes"].most_common(1)[0][0]

# ---- 4) Player MVP Index (0-100) ----
def kda_eff(st):
    return (st["k"] + st["a"]) / max(1, st["d"])

def mvp_index(st):
    gp = st["gp"]
    score_avg = st["score"] / gp
    mvp_rate = st["mvp"] / gp
    idx = (0.30 * (score_avg / 15.0 * 100) +
           0.20 * (mvp_rate * 100) +
           0.15 * (min(kda_eff(st), 12.0) / 12.0 * 100) +
           0.15 * (st["fight"] / gp) +
           0.10 * (st["w"] / gp * 100) +
           0.10 * (st["dmg_share"] / gp))
    return idx

stats = [(n, s) for n, s in players.items() if s["gp"] > 0]
for _, s in stats:
    s["idx"] = mvp_index(s)
stats.sort(key=lambda x: (-x[1]["idx"], -x[1]["gp"], -x[1]["mvp"]))

# hero id -> name (official Moonton ids; 0 = unknown)
try:
    hero_name = {int(k): v for k, v in json.load(open(HERO_MAP, encoding="utf-8")).items()}
except Exception:
    hero_name = {}

def top_hero(cnt):
    """most-played hero; ties broken by lowest hero id (deterministic)."""
    if not cnt:
        return 0
    mx = max(cnt.values())
    return min(h for h, c in cnt.items() if c == mx)

with open(OUT_CSV + ".tmp", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Rank", "Player", "Team", "GP", "W", "L", "WinRate", "K", "D", "A",
                "KDAeff", "MVPbadges", "MVPRate", "AvgScore", "AvgFight", "AvgDmgShare", "AvgGold",
                "TopHeroID", "TopHeroName", "TopHeroPicks", "MVPIndex"])
    for i, (name, st) in enumerate(stats, 1):
        hid = top_hero(st["heroes"])
        w.writerow([i, name, st["team"], st["gp"], st["w"], st["l"], round(st["w"]/st["gp"], 3),
                    st["k"], st["d"], st["a"], round(kda_eff(st), 2), st["mvp"],
                    round(st["mvp"]/st["gp"], 3), round(st["score"]/st["gp"], 2),
                    round(st["fight"]/st["gp"], 1), round(st["dmg_share"]/st["gp"], 1),
                    round(st["gold"]/st["gp"], 0), hid, hero_name.get(hid, f"?({hid})"),
                    st["heroes"].get(hid, 0), round(st["idx"], 2)])
for _ in range(6):
    try:
        os.replace(OUT_CSV + ".tmp", OUT_CSV)
        break
    except PermissionError:
        time.sleep(2)
else:
    print("WARNING: target CSV locked (open in Excel?) - results kept in *.tmp")

print("\n=== PLAYER MVP LEADERBOARD (>=2 games played) ===")
n = 0
for name, st in stats:
    if st["gp"] < 2:
        continue
    n += 1
    if n > 15:
        break
    print(f"{n:>2}. {name[:20]:<21}{st['team']:<10}GP={st['gp']:<3}W-L={st['w']}-{st['l']:<3}"
          f"K/D/A={st['k']}/{st['d']}/{st['a']}  MVP={st['mvp']}  score={st['score']/st['gp']:.1f}  idx={st['idx']:.2f}")

top = [x for x in stats if x[1]["gp"] >= 2]
print("\n== PARTIAL MVP PLAYER ==")
print(top[0][0], f"({top[0][1]['team']})  index={top[0][1]['idx']:.2f}  GP={top[0][1]['gp']}  K/D/A={top[0][1]['k']}/{top[0][1]['d']}/{top[0][1]['a']}  MVP badges={top[0][1]['mvp']}")
print("Runner-up:", top[1][0], f"({top[1][1]['team']})  index={top[1][1]['idx']:.2f}")