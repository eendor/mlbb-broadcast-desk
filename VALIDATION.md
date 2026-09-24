# Validation status

- September 14 draft update: all 46 backend tests pass. Real MP4 playback was checked through the desk, detection API and OBS output using temporary production state. Checks include the initial ban, covered/pending slots, window normalization, all ten final picks and ten bans, the red countdown, stop/freeze and schedule preservation. The final validation frame is at 05:10; captured skin references include 05:00.
- All 988 downloaded CDN images decode successfully. The collection covers 133 heroes and 181 item records with artwork, plus metadata for three removed items without published images. Local result hero/item resolution is covered by backend and browser checks.
- Gameplay and match-result browser regressions pass after enabling draft detection. The supplied recording is one match; this does not establish accuracy for every skin, layout or player name.

- Swiss checks cover all five rounds (33 matches), 8 qualified and 8 eliminated teams, live updates to the supplied SVG, name corrections, result undo, SVG export and reload persistence. API checks verify that Swiss operations leave the schedule and all other production fields unchanged. Browser checks use temporary state.
- MSL placement was visually checked across the nine existing scenes: compact marks in draft/scoreboard branding, wordmarks in fullscreen headers or partner areas, and no floating badge or logo over ad media/player rails. Swiss retains the original artwork's partner row.

- Backend unit checks cover parsing, mappings, timers, invalid state, BO3/5/7, ad rotation, media validation and OCR value parsing.
- Browser checks have exercised nine scenes, click editing, series selection, hero video playback, pick highlights, scoreboard text fitting, uploads and ad rotation.
- Scene-transition regression checks verify that the old HUD remains until cover, the new HUD appears under cover, and the wipe has no deliberate midpoint delay.
- Real Tesseract checks read blue kills 4, red kills 2 and clock 01:47 from a rendered scoreboard. Two-reading continuous confirmation updated both kill fields in 168 ms in one local run; this is a small three-region test, not a guaranteed full-rail scan rate.
- A sampled frame at 2.5 seconds of the user-provided feedback clip read 4 / 2 / 01:47 with confidence 85% / 95% / 93%. The clip films a composed overlay, so this is a recognition spot check, not ground truth for the underlying game or full-match validation.
- Local browser checks measured 94 ms for a manual edit and 15 ms for an already-recognized OCR update to reach a second OBS output page. Network/recognition/load can change these timings.
- Layout browser checks exercise all nine scenes, dragging, resize handles, undo, hiding/reset, persistence across page reload, and ticking game clocks. The backend validates allowed elements, bounds and duplicate layout entries.
- OCR regression checks cover latest-state player merges, stale/invalid readings, confirmation after isolated spikes, concurrent worker completion and cancellation of pending work. Live-match accuracy remains unverified.
- Successful current official match API payloads remain unverified. The sample match ID returned match not found.
- Only sixteen heroes have bundled moving artwork; other portraits are still. Draft picks and bans can be detected automatically; names are manual unless the operator enables name recognition. Gameplay portrait matching has not been validated against an entire live match or every skin.
- Live detection uses two successive HUD classifications before switching between drafting, gameplay and match results. The draft mode uses a heading plus countdown as evidence, with repeat confirmation for hero readings. Backend checks cover scoreboard values, result winner/final statistics, player identity rules, stale deliveries and invalid fields.

Browser tests require Playwright Chromium. Some additional development scripts use a running server on port 3210 or an optional local screenshot; the README lists the portable isolated checks.
