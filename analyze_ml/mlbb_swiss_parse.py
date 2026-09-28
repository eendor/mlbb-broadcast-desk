# -*- coding: utf-8 -*-
"""
MLBB Swiss Tournament - BattleID dataset builder + Partial MVP algorithm.
Parses battle IDs / match results from the Discord transcript into:
  1. mlbb_swiss_dataset.csv       - one row per game (74 rows)
  2. mlbb_swiss_mvp_standings.csv - team stats + MVP Index
Then prints the leaderboard.

MVP Index (0-100), weighted on PARTIAL data available:
  40%  Series win rate   (Swiss match points)
  25%  Game win rate     (known games only)
  15%  Schedule strength (avg opponent series win rate = "Buchholz lite")
  10%  Form              (share of series won in the last 2 played)
  10%  Decisiveness      (sweep rate among series won)
"""
import csv
from collections import defaultdict, Counter

BASE = "https://play.mobilelegends.com/match/#/"

def G(game, battle_id, blue, red, winner, by, time, note=""):
    return dict(game=game, battle_id=battle_id, blue=blue, red=red,
                winner=winner, by=by, time=time, note=note)

def M(round_, bracket, matchup, match, series_winner, games):
    return dict(round=round_, bracket=bracket, matchup=matchup,
                match=match, series_winner=series_winner, games=games)

MATCHES = [
    # ============================ ROUND 1 ============================
    M("Round 1", "", "", "ULS vs USM ESC", "USM ESC", [
        G(1, "6aa676b1e10f8b2ba2c7cdc1", "USM ESC", "ULS", "USM ESC", "jrai", "Yesterday 6:22 PM", "Reported as ROW 1"),
        G(2, "6aa67ce3e10f8b2ba2c7ce86", "ULS", "USM ESC", "USM ESC", "ML.Ivoezxc_", "Yesterday 6:43 PM", "Reported as ROW 1"),
    ]),
    M("Round 1", "", "", "FSMS vs PNSA", "FSMS", [
        G(1, "6aa67608ac75df7a21fd718c", "FSMS", "PNSA", "", "ML.Angcool", "Yesterday 6:36 PM", "Reported ROW 7; game winner not stated"),
        G(2, "6aa67bb6ac75df7a21fd71a4", "PNSA", "FSMS", "", "jrai", "Yesterday 6:40 PM", "Reported ROW 7; game winner not stated"),
    ]),
    M("Round 1", "", "", "DEVCOM vs PICE", "PICE", [
        G(1, "", "PICE", "DEVCOM", "PICE", "ML.Keiji", "Yesterday 6:37 PM", "BattleID missing from report"),
        G(2, "26aa67a2eac75df7a21fd719b", "DEVCOM", "PICE", "PICE", "ML.Acsel", "Yesterday 6:55 PM", "ID is 25 chars (likely typo, probably 6aa67a2eac75df7a21fd719b)"),
    ]),
    M("Round 1", "", "", "JPEDS vs AMS", "AMS", [
        G(1, "6aa67439e10f8b2ba2c7cd6b", "JPEDS", "AMS", "AMS", "ML.Keiji", "Yesterday 6:51 PM", "Duplicate report by ML.Ergin 7:20 PM; series winner inferred from R2 brackets"),
    ]),
    M("Round 1", "", "", "PSITS vs JIECEP", "PSITS", [
        G(1, "6aa67611e10f8b2ba2c7cda9", "PSITS", "JIECEP", "PSITS", "ML.USG Undersec - Marian", "Yesterday 7:03 PM", "Reported ROW 5"),
        G(2, "", "JIECEP", "PSITS", "PSITS", "ML.USG Undersec - Marian", "Yesterday 7:03 PM", "BattleID missing"),
    ]),
    M("Round 1", "", "", "APO vs ABES", "APO", [
        G(1, "6aa67482ac75df7a21fd7184", "ABES", "APO", "APO", "ML.AART [ESMO]", "Yesterday 7:11 PM", "Reported ROW 3"),
        G(2, "6aa67db6e10f8b2ba2c7ce8c", "APO", "ABES", "APO", "ML.AART [ESMO]", "Yesterday 7:11 PM", ""),
    ]),
    M("Round 1", "", "", "ICPEP vs UFTTS", "ICPEP", [
        G(1, "6aa65099ac75df7a21fd7038", "UFTTS", "ICPEP", "ICPEP", "ML.MJ", "Yesterday 7:24 PM", "Reported ROW 8"),
        G(2, "6aa65099ac75df7a21fd7038", "ICPEP", "UFTTS", "ICPEP", "ML.MJ", "Yesterday 7:24 PM", "Same BattleID as Game 1 (likely copy-paste, verify)"),
    ]),
    M("Round 1", "", "", "JMES vs FTSS", "JMES", [
        G(1, "6aa66c1fac75df7a21fd7160", "JMES", "FTSS", "", "ML.Keiji", "Yesterday 7:38 PM", "Game winner not stated; series winner inferred from R2 brackets"),
        G(2, "6aa68004ac75df7a21fd71b4", "FTSS", "JMES", "", "ML.Keiji", "Yesterday 7:38 PM", "Game winner not stated"),
    ]),

    # ============================ ROUND 2 ============================
    M("Round 2", "", "R2M1", "USM ESC vs JMES", "USM ESC", [
        G(1, "6aa68d2ae10f8b2ba2c7cee9", "USM ESC", "JMES", "JMES", "ML.Ivoezxc_", "Yesterday 8:57 PM", "Reported ROW 1"),
        G(2, "6aa69244e10f8b2ba2c7cf15", "JMES", "USM ESC", "USM ESC", "ML.Ivoezxc_", "Yesterday 8:57 PM", ""),
        G(3, "6aa697e8e10f8b2ba2c7cf46", "USM ESC", "JMES", "USM ESC", "ML.Ivoezxc_", "Yesterday 8:57 PM", ""),
    ]),
    M("Round 2", "1-0 bracket", "R2M2", "APO vs PICE", "APO", [
        G(1, "6aa68a19ac75df7a21fd71e1", "PICE", "APO", "PICE", "ML.MJ", "Yesterday 8:59 PM", "Reported ROW 2"),
        G(2, "6aa69310e10f8b2ba2c7cf1e", "APO", "PICE", "APO", "ML.MJ", "Yesterday 8:59 PM", ""),
        G(3, "6aa698cfe10f8b2ba2c7cf52", "PICE", "APO", "APO", "ML.MJ", "Yesterday 8:59 PM", "Series winner: APO"),
    ]),
    M("Round 2", "", "R2M3", "PSITS vs AMS", "PSITS", [
        G(1, "6aa68cdfac75df7a21fd71f2", "PSITS", "AMS", "PSITS", "ML.MARK", "Yesterday 8:38 PM", "Reported ROW 3; sent as 'AMS vs PSITS'"),
        G(2, "6aa69385ac75df7a21fd721e", "PSITS", "AMS", "PSITS", "ML.MARK", "Yesterday 8:38 PM", ""),
    ]),
    M("Round 2", "", "R2M4", "FSMS vs ICPEP", "ICPEP", [
        G(1, "6aa6826bac75df7a21fd71b9", "FSMS", "ICPEP", "ICPEP", "ML.Angcool", "Yesterday 9:06 PM", "Reported ROW 4; 'ICEPEP' = ICPEP"),
        G(2, "6aa69215e10f8b2ba2c7cf11", "ICPEP", "FSMS", "FSMS", "ML.Angcool", "Yesterday 9:06 PM", ""),
        G(3, "6aa697c0e10f8b2ba2c7cf42", "FSMS", "ICPEP", "ICPEP", "ML.Angcool", "Yesterday 9:06 PM", ""),
    ]),
    M("Round 2", "", "R2M5", "ULS vs FTSS", "ULS", [
        G(1, "", "FTSS", "ULS", "FTSS", "ML.Acsel", "Yesterday 9:03 PM", "BattleID missing"),
        G(2, "", "ULS", "FTSS", "ULS", "ML.Acsel", "Yesterday 9:03 PM", "BattleID missing; header typo 'JIECEP vs PSITS' but sides are FTSS/ULS"),
        G(3, "6aa68d80e10f8b2ba2c7cef0", "FTSS", "ULS", "ULS", "ML.Acsel", "Yesterday 9:03 PM", ""),
    ]),
    M("Round 2", "", "R2M6", "ABES vs DEVCOM", "ABES", [
        G(1, "6aa68d5ee10f8b2ba2c7ceec", "ABES", "DEVCOM", "ABES", "ML.AART [ESMO]", "Yesterday 8:17 PM", ""),
        G(2, "6aa6986aac75df7a21fd723e", "DEVCOM", "ABES", "ABES", "ML.AART [ESMO]", "Yesterday 8:17 PM", ""),
    ]),
    M("Round 2", "0-1 bracket", "R2M7", "JIECEP vs JPEDS", "JPEDS", [
        G(1, "6aa68938e10f8b2ba2c7cece", "JIECEP", "JPEDS", "JPEDS", "jrai", "Yesterday 9:18 PM", ""),
        G(2, "6aa6943dac75df7a21fd7220", "JPEDS", "JIECEP", "JIECEP", "jrai", "Yesterday 9:18 PM", ""),
        G(3, "6aa69b32ac75df7a21fd7256", "JIECEP", "JPEDS", "JPEDS", "jrai", "Yesterday 9:18 PM", ""),
    ]),
    M("Round 2", "", "R2M8", "PNSA vs UFTTS", "UFTTS", [
        G(1, "", "UFTTS", "PNSA", "UFTTS", "ML.Ergin", "Yesterday 9:18 PM", "Reported ROW 8; sent as 'PNSA VS UFTTS'. Link duplicated G2's battle; winner kept from transcript, excluded from player stats"),
        G(2, "6aa694b0e10f8b2ba2c7cf2b", "PNSA", "UFTTS", "PNSA", "ML.Ergin", "Yesterday 9:18 PM", "Verified: rosters are PNSA (camp1/Blue) vs UFTTS (camp2/Red); G1/G3 links were duplicates of this battle"),
        G(3, "", "UFTTS", "PNSA", "UFTTS", "ML.Ergin", "Yesterday 9:18 PM", "Link duplicated G2's battle; winner kept from transcript, excluded from player stats"),
    ]),

    # ============================ ROUND 3 ============================
    M("Round 3", "", "R3M1", "USM ESC vs APO", "APO", [
        G(1, "6aa6a488e10f8b2ba2c7cf8e", "APO", "USM ESC", "USM ESC", "ML.Ivoezxc_", "Yesterday 10:39 PM", "Reported ROW 1"),
        G(2, "6aa6aaa6ac75df7a21fd72a1", "USM ESC", "APO", "APO", "ML.Ivoezxc_", "Yesterday 10:39 PM", ""),
        G(3, "6aa6b08de10f8b2ba2c7cfee", "APO", "USM ESC", "APO", "ML.Ivoezxc_", "Yesterday 10:39 PM", ""),
    ]),
    M("Round 3", "2-0 bracket", "R3M2", "PSITS vs ICPEP", "PSITS", [
        G(1, "6aa69f09e10f8b2ba2c7cf77", "ICPEP", "PSITS", "ICPEP", "ML.MJ", "Yesterday 10:32 PM", "Reported ROW 2"),
        G(2, "6aa6aa93ac75df7a21fd729f", "PSITS", "ICPEP", "PSITS", "ML.MJ", "Yesterday 10:32 PM", ""),
        G(3, "6aa6af84ac75df7a21fd72bd", "ICPEP", "PSITS", "PSITS", "ML.MJ", "Yesterday 10:32 PM", "Series winner: PSITS"),
    ]),
    M("Round 3", "", "R3M3", "ULS vs JMES", "ULS", [
        G(1, "6aa6a424e10f8b2ba2c7cf87", "JMES", "ULS", "JMES", "ML.MARK", "Yesterday 10:38 PM", "Reported ROW 3"),
        G(2, "6aa6aa1aac75df7a21fd729b", "ULS", "JMES", "ULS", "ML.MARK", "Yesterday 10:38 PM", ""),
        G(3, "6aa6af75ac75df7a21fd72bb", "JMES", "ULS", "ULS", "ML.MARK", "Yesterday 10:38 PM", ""),
    ]),
    M("Round 3", "", "R3M4", "ABES vs PICE", "PICE", [
        G(1, "6aa6a424ac75df7a21fd726d", "ABES", "PICE", "PICE", "ML.Angcool", "Yesterday 10:09 PM", "Reported ROW 4"),
        G(2, "6aa6a973e10f8b2ba2c7cfaf", "PICE", "ABES", "PICE", "ML.Angcool", "Yesterday 10:09 PM", ""),
    ]),
    M("Round 3", "", "R3M5", "JPEDS vs FSMS", "FSMS", [
        G(1, "", "JPEDS", "FSMS", "FSMS", "ML.Acsel", "Yesterday 10:19 PM", "Reported ROW 5; BattleID missing"),
        G(2, "6aa6a4c8e10f8b2ba2c7cf91", "FSMS", "JPEDS", "FSMS", "ML.Acsel", "Yesterday 10:19 PM", ""),
    ]),
    M("Round 3", "", "R3M6", "AMS vs UFTTS", "UFTTS", [
        G(1, "6aa6a441ac75df7a21fd7272", "UFTTS", "AMS", "UFTTS", "ML.AART [ESMO]", "Yesterday 10:31 PM", ""),
        G(2, "6aa6ac6ee10f8b2ba2c7cfc9", "AMS", "UFTTS", "UFTTS", "ML.AART [ESMO]", "Yesterday 10:31 PM", ""),
    ]),
    M("Round 3", "0-2 bracket", "R3M7", "FTSS vs DEVCOM", "FTSS", [
        G(1, "6aa6a45ce10f8b2ba2c7cf8b", "DEVCOM", "FTSS", "FTSS", "jrai", "Yesterday 10:21 PM", ""),
        G(2, "6aa6a9edac75df7a21fd7298", "FTSS", "DEVCOM", "FTSS", "jrai", "Yesterday 10:21 PM", ""),
    ]),
    M("Round 3", "", "R3M8", "JIECEP vs PNSA", "JIECEP", [
        G(1, "6aa6a679e10f8b2ba2c7cfa0", "JIECEP", "PNSA", "JIECEP", "ML.Ergin", "Yesterday 10:36 PM", "Reported ROW 8"),
        G(2, "6aa6ac10e10f8b2ba2c7cfc6", "PNSA", "JIECEP", "JIECEP", "ML.Ergin", "Yesterday 10:36 PM", ""),
    ]),

    # ============================ ROUND 4 ============================
    M("Round 4", "", "R4M1", "ULS vs PICE", "PICE", [
        G(1, "6aa6b7f8e10f8b2ba2c7d01a", "PICE", "ULS", "PICE", "ML.Ivoezxc_", "Yesterday 11:39 PM", "Reported ROW 1"),
        G(2, "6aa6bd67e10f8b2ba2c7d037", "ULS", "PICE", "PICE", "ML.Ivoezxc_", "Yesterday 11:39 PM", ""),
    ]),
    M("Round 4", "2-1 bracket", "R4M2", "USM ESC vs FSMS", "USM ESC", [
        G(1, "6aa6b93ee10f8b2ba2c7d022", "FSMS", "USM ESC", "USM ESC", "jrai", "Yesterday 11:39 PM", "Header 'ROUND 4 (2-!)'"),
        G(2, "6aa6bf0ce10f8b2ba2c7d047", "USM ESC", "FSMS", "USM ESC", "jrai", "Yesterday 11:39 PM", ""),
    ]),
    M("Round 4", "", "R4M3", "ICPEP vs UFTTS", "UFTTS", [
        G(1, "6aa6b800ac75df7a21fd72da", "ICPEP", "UFTTS", "ICPEP", "ML.MARK", "12:15 AM", "Sent as 'UFTTS vs ICPEP'"),
        G(2, "6aa6be2be10f8b2ba2c7d03f", "UFTTS", "ICPEP", "UFTTS", "ML.MARK", "12:15 AM", ""),
        G(3, "6aa6c49dac75df7a21fd7329", "ICPEP", "UFTTS", "UFTTS", "ML.MARK", "12:15 AM", ""),
    ]),
    M("Round 4", "", "R4M4", "JMES vs ABES", "JMES", [
        G(1, "6aa6b8ede10f8b2ba2c7d01f", "ABES", "JMES", "JMES", "ML.Angcool", "Yesterday 11:44 PM", "Reported ROW 4"),
        G(2, "6aa6bf5ce10f8b2ba2c7d04d", "JMES", "ABES", "JMES", "ML.Angcool", "Yesterday 11:44 PM", ""),
    ]),
    M("Round 4", "", "R4M5", "FTSS vs JIECEP", "JIECEP", [
        G(1, "6aa6b918ac75df7a21fd72e2", "JIECEP", "FTSS", "JIECEP", "ML.Keiji", "Yesterday 11:07 PM", "Sender labeled 'Round 5'; official R4 matchups list this as R4M5"),
        G(2, "6aa6c123ac75df7a21fd730c", "FTSS", "JIECEP", "JIECEP", "ML.Keiji", "Yesterday 11:31 PM", ""),
    ]),
    M("Round 4", "", "R4M6", "JPEDS vs AMS", "AMS", [
        G(1, "", "", "", "JPEDS", "ML.rod / ML.Keiji", "12:34 AM", "No BattleID; sides not stated (image post)"),
        G(2, "", "", "", "AMS", "ML.rod / ML.Keiji", "12:34 AM", "No BattleID; sides not stated (image post)"),
        G(3, "", "", "", "AMS", "ML.rod / ML.Keiji", "12:34 AM", "No BattleID; sides not stated (image post)"),
    ]),

    # ============================ ROUND 5 ============================
    M("Round 5", "", "R5M1", "FSMS vs ICPEP", "FSMS", [
        G(1, "6aa6d139e10f8b2ba2c7d0a6", "FSMS", "ICPEP", "FSMS", "ML.MARK", "1:20 AM", "Reported ROW 3"),
        G(2, "6aa6d669e10f8b2ba2c7d0af", "ICPEP", "FSMS", "FSMS", "ML.MARK", "1:20 AM", ""),
    ]),
    M("Round 5", "", "R5M2", "ULS vs JIECEP", "ULS", [
        G(1, "6aa6d00ae10f8b2ba2c7d09e", "JIECEP", "ULS", "ULS", "ML.Ivoezxc_", "1:33 AM", "Reported ROW 1"),
        G(2, "6aa6d7dfac75df7a21fd735c", "ULS", "JIECEP", "ULS", "ML.Ivoezxc_", "1:33 AM", "Header typo 'ULS vs PICE Game 2' but sides are ULS/JIECEP"),
    ]),
]

# =============================================================
# 1) Build game-level dataset CSV
# =============================================================
rows = []
for m in MATCHES:
    for g in m["games"]:
        bid = g["battle_id"]
        url = BASE + bid if bid else ""
        rows.append({
            "Round": m["round"], "Bracket": m["bracket"], "Matchup": m["matchup"],
            "Match": m["match"], "Game": g["game"], "BattleID": bid,
            "BlueSide": g["blue"], "RedSide": g["red"], "Winner": g["winner"],
            "BattleURL": url, "ReportedBy": g["by"], "ReportedTime": g["time"],
            "Notes": g["note"],
        })

BASE = r"D:/Desktop/OBS Mobile Legends ML Setup/analyze_ml"

with open(BASE + "/mlbb_swiss_dataset.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

ids = [r["BattleID"] for r in rows if r["BattleID"]]
missing = [r for r in rows if not r["BattleID"]]
bad = [i for i in ids if len(i) != 24 or any(c not in "0123456789abcdef" for c in i.lower())]
dup = {k: v for k, v in Counter(i.lower() for i in ids).items() if v > 1}
print(f"DATASET: {len(rows)} game rows | {len(ids)} with BattleID | {len(missing)} missing | {len(bad)} suspicious-length | dup IDs: {dup}")

# =============================================================
# 2) Team stats from series results
# =============================================================
stats = {}
series_list = []
for m in MATCHES:
    known = [g["winner"] for g in m["games"] if g["winner"]]
    winner = Counter(known).most_common(1)[0][0] if known else m["series_winner"]
    a, b = m["match"].split(" vs ")
    for t in (a, b):
        stats.setdefault(t, dict(sw=0, sl=0, gw=0, gl=0, gk=0, opps=[], forms=[], sweeps=0))
    stats[winner]["sw"] += 1
    stats[b if winner == a else a]["sl"] += 1
    stats[a]["opps"].append(b)
    stats[b]["opps"].append(a)
    stats[a]["forms"].append(winner == a)
    stats[b]["forms"].append(winner == b)
    known_games = [g["winner"] for g in m["games"] if g["winner"]]
    for t in (a, b):
        wincnt = known_games.count(t)
        stats[t]["gw"] += wincnt
        stats[t]["gl"] += len(known_games) - wincnt
        stats[t]["gk"] += len(known_games)
    # sweep: series won with >=2 recorded games, all won by same team
    if len(known_games) >= 2 and known_games and len(set(known_games)) == 1:
        stats[known_games[0]]["sweeps"] += 1

for t, s in stats.items():
    total = s["sw"] + s["sl"]
    opp_rates = [stats[o]["sw"] / (stats[o]["sw"] + stats[o]["sl"]) for o in s["opps"]]
    s["sr"] = s["sw"] / total
    s["gr"] = s["gw"] / s["gk"] if s["gk"] else 0.0
    s["sos"] = sum(opp_rates) / len(opp_rates) if opp_rates else 0.0
    s["form"] = sum(s["forms"][-2:]) / 2
    s["sweep_rate"] = s["sweeps"] / s["sw"] if s["sw"] else 0.0
    s["buchholz"] = sum(stats[o]["sw"] for o in s["opps"])

def mvp_index(s):
    return 100 * (0.40 * s["sr"] + 0.25 * s["gr"] + 0.15 * s["sos"]
                  + 0.10 * s["form"] + 0.10 * s["sweep_rate"])

for s in stats.values():
    s["mvp"] = mvp_index(s)

# leaderboard by MVP index
order = sorted(stats, key=lambda t: (-stats[t]["mvp"], -stats[t]["sw"], stats[t]["sl"]))

with open(BASE + "/mlbb_swiss_mvp_standings.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["Rank", "Team", "SeriesW", "SeriesL", "SeriesPct", "GamesW", "GamesL", "GamesRecorded",
                "GamePct", "Sweeps", "SoS", "Form(last2)", "Buchholz", "MVPScore"])
    for r, t in enumerate(order, 1):
        s = stats[t]
        w.writerow([r, t, s["sw"], s["sl"], round(s["sr"], 3), s["gw"], s["gl"], s["gk"],
                    round(s["gr"], 3), s["sweeps"], round(s["sos"], 3), round(s["form"], 2),
                    s["buchholz"], round(s["mvp"], 2)])

# curated "team table standings" (readable columns, same order).
# - "Qualified" marks the organizer-confirmed playoff 8 (poster: APO, PSITS,
#   USM ESC, PICE, UFTTS, ULS, JMES, FSMS). AMS (next in line, 2-2) forfeited,
#   so JMES takes the 8th spot.
# - Series/Games use the ="3-0" Excel trick so Excel keeps them as TEXT
#   (otherwise Excel auto-converts 3-0 / 6-1 into dates on CSV open).
QUALIFIED = {"PSITS", "APO", "PICE", "USM ESC", "UFTTS", "FSMS", "ULS", "JMES"}
with open(BASE + "/mlbb_team_standings.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["Rank", "Team", "Series", "Series%", "Games", "Game%", "Sweeps", "SoS", "Buchholz", "MVP Index", "Qualified"])
    for r, t in enumerate(order, 1):
        s = stats[t]
        w.writerow([r, t, f'="{s["sw"]}-{s["sl"]}"', f"{s['sr']*100:.1f}%",
                    f'="{s["gw"]}-{s["gl"]}"', f"{s['gr']*100:.1f}%",
                    s["sweeps"], round(s["sos"], 3), s["buchholz"], round(s["mvp"], 2),
                    "YES" if t in QUALIFIED else "NO"])

print("\n=== PARTIAL MVP LEADERBOARD (composite MVP Index / 100) ===")
print(f"{'Rank':<4}{'Team':<12}{'W-L':<7}{'GmsW-L':<9}{'SR':<6}{'GR':<6}{'SoS':<6}{'Form':<6}{'Sweep':<6}{'Buch':<6}{'MVP':<7}")
for r, t in enumerate(order, 1):
    s = stats[t]
    print(f"{r:<4}{t:<12}{s['sw']}-{s['sl']:<5}{s['gw']}-{s['gl']:<6}{s['sr']:.3f} {s['gr']:.3f} {s['sos']:.3f} "
          f"{s['form']:.2f}  {s['sweep_rate']:.2f}  {s['buchholz']:<6}{s['mvp']:.2f}")

# pure Swiss standings tiebreak comparison (points -> Buchholz)
swiss = sorted(stats, key=lambda t: (-stats[t]["sw"], stats[t]["sl"], -stats[t]["buchholz"]))
print("\n=== PURE SWISS CHECK (match points -> Buchholz) ===")
for r, t in enumerate(swiss, 1):
    s = stats[t]
    print(f"{r:<4}{t:<12}{s['sw']}-{s['sl']:<5}Buchholz: {s['buchholz']}")

print("\nPARTIAL MVP:", order[0], f"({stats[order[0]]['mvp']:.2f})")
print("Runner-up :", order[1], f"({stats[order[1]]['mvp']:.2f})")