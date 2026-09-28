# -*- coding: utf-8 -*-
"""Fetch full battle data (per-player stats) for every unique BattleID in the dataset."""
import csv, json, os, time, urllib.request, urllib.error

BASE = r"D:/Desktop/OBS Mobile Legends ML Setup/analyze_ml"
CSV_PATH = BASE + "/mlbb_swiss_dataset.csv"
OUT_DIR = BASE + "/mlbb_data"
AGG_PATH = os.path.join(OUT_DIR, "battleData_raw.json")
API = "https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl"

os.makedirs(OUT_DIR, exist_ok=True)

rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
ids = []
for r in rows:
    bid = (r["BattleID"] or "").strip()
    if bid and bid not in ids:
        ids.append(bid)
    if bid == "26aa67a2eac75df7a21fd719b" and "6aa67a2eac75df7a21fd719b" not in ids:
        pass  # corrected fallback appended below

# corrected fallback for the 25-char typo
if "6aa67a2eac75df7a21fd719b" not in ids:
    ids.append("6aa67a2eac75df7a21fd719b")
print(f"Unique battle ids to fetch: {len(ids)}")

def fetch(bid):
    url = f"{API}?matchId={bid}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://play.mobilelegends.com",
        "Referer": "https://play.mobilelegends.com/match/",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

agg = {}
if os.path.exists(AGG_PATH):
    agg = json.load(open(AGG_PATH, encoding="utf-8"))

ok = fail = 0
for i, bid in enumerate(ids):
    if bid in agg:
        continue
    try:
        j = fetch(bid)
        if j.get("code") == 0 and j.get("data", {}).get("battleData"):
            agg[bid] = j["data"]
            ok += 1
        else:
            agg[bid] = {"error": j.get("message", "unknown"), "code": j.get("code")}
            fail += 1
            print(f"  [{bid}] no data: {j.get('message')}")
    except Exception as e:
        agg[bid] = {"error": str(e)}
        fail += 1
        print(f"  [{bid}] fetch error: {e}")
    # save incrementally every 10
    if (i + 1) % 10 == 0:
        json.dump(agg, open(AGG_PATH, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  progress {i+1}/{len(ids)} (ok={ok}, fail={fail})")
    time.sleep(0.4)

json.dump(agg, open(AGG_PATH, "w", encoding="utf-8"), ensure_ascii=False)
print(f"DONE ok={ok} fail={fail} total stored={len(agg)}")