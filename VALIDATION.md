# Validation status

- Backend unit checks cover parsing, mappings, timers, invalid state, BO3/5/7, ad rotation, media validation and OCR value parsing.
- Browser checks have exercised nine scenes, click editing, series selection, hero video playback, pick highlights, scoreboard text fitting, uploads and ad rotation.
- Scene-transition regression checks verify that the old HUD remains until cover, the new HUD appears under cover, and the wipe has no deliberate midpoint delay.
- OCR has not been tested on a live match. A single screenshot KDA was recognized as 1/0/3 at 92% confidence during development; this is not an accuracy benchmark.
- Successful current official match API payloads remain unverified. The sample match ID returned match not found.
- Only sixteen heroes have bundled moving artwork. Other portraits are still. Hero recognition from scenes/video is future work.

Browser tests require Playwright Chromium. Some additional development scripts use a running server on port 3210 or an optional local screenshot; the README lists the portable isolated checks.
