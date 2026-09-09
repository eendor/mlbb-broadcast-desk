# Validation status

- Backend unit checks cover parsing, mappings, timers, invalid state, BO3/5/7, ad rotation, media validation and OCR value parsing.
- Browser checks have exercised nine scenes, click editing, series selection, hero video playback, pick highlights, scoreboard text fitting, uploads and ad rotation.
- Scene-transition regression checks verify that the old HUD remains until cover, the new HUD appears under cover, and the wipe has no deliberate midpoint delay.
- Real Tesseract checks read blue kills 4, red kills 2 and clock 01:47 from a rendered scoreboard. Two-reading continuous confirmation updated both kill fields in 168 ms in one local run; this is a small three-region test, not a guaranteed full-rail scan rate.
- A sampled frame at 2.5 seconds of the user-provided feedback clip read 4 / 2 / 01:47 with confidence 85% / 95% / 93%. The clip films a composed overlay, so this is a recognition spot check, not ground truth for the underlying game or full-match validation.
- Local browser checks measured 94 ms for a manual edit and 15 ms for an already-recognized OCR update to reach a second OBS output page. Network/recognition/load can change these timings.
- Layout browser checks exercise all nine scenes, dragging, resize handles, undo, hiding/reset, persistence across page reload, and ticking game clocks. The backend validates allowed elements, bounds and duplicate layout entries.
- OCR regression checks cover latest-state player merges, stale/invalid readings, confirmation after isolated spikes, concurrent worker completion and cancellation of pending work. Live-match accuracy remains unverified.
- Successful current official match API payloads remain unverified. The sample match ID returned match not found.
- Only sixteen heroes have bundled moving artwork. Other portraits are still. Hero recognition from scenes/video is future work.

Browser tests require Playwright Chromium. Some additional development scripts use a running server on port 3210 or an optional local screenshot; the README lists the portable isolated checks.
