# MLBB Broadcast Desk

Local OBS overlay control panel for Mobile Legends broadcasts. Includes a white, blue and red broadcast package, draft, scoreboard and player rails, Starting Soon, intermission, sponsor/ads screens, results and schedule.

**Testing build:** manual production controls are available. OCR has not been tested on a live match. The official match API has not been validated against a successful current live payload. Please test off air before using this for an event.

## Install and run

1. Install Node.js 24 or newer and Git.
2. Clone this repository and open a terminal in its folder.
3. Run `npm ci`.
4. Run `npm start`.
5. Open http://127.0.0.1:3210 in Chrome or Edge.

On Windows, after installing dependencies, you can instead double-click **Start Broadcast Desk.bat**. It starts a hidden server and opens the panel. Stop that server using `powershell -ExecutionPolicy Bypass -File .\Stop-Broadcast.ps1`. For `npm start`, stop with Ctrl+C.

The desk binds to the host computer and prints its private LAN address at startup. On another PC, tablet or phone on the same trusted network, open `http://<host-LAN-IP>:3210` (for example, `http://192.168.1.20:3210`). All devices control the same running desk: edits and timers sync live to every open panel and OBS output. They must use the same host address and server process; separate clones do not sync. A fresh clone starts with default teams, and uploaded media is not included.

LAN control is intentionally limited to private local addresses, but it has no user login: only run it on a network where everyone who can connect is trusted to operate the broadcast. If Windows Firewall asks, allow Node.js on **Private networks**. Screen-capture OCR may need to stay open on the host computer at `http://127.0.0.1:3210`, because browsers restrict screen capture from plain-HTTP LAN addresses.

## OBS setup

Add a Browser Source, set its size to **1920 x 1080**, and use:

`http://127.0.0.1:3210/overlay.html`

This Program source follows the scene selected in Live Production. Use it for the built-in scene wipe: the old scene stays visible until the cover arrives, the HUD swaps under cover, and the wipe exits without a middle pause.

For fixed sources, append `?scene=draft`, `?scene=scoreboard`, `?scene=players`, `?scene=countdown`, `?scene=intermission`, `?scene=sponsors`, `?scene=ads`, `?scene=postgame`, or `?scene=schedule`. Switching separate OBS scenes uses OBS's own transition settings. Draft, scoreboard and player rails have transparent backgrounds.

Program scene changes use the Pasiklaban red, gold and cream woven-fabric wipe. The other broadcast scenes and control desk share the same event palette. The in-game HUD stays at X 365 / Y 5 and 1190 × 116 so it continues covering the native ML HUD; the USM seal and caster card extend to its sides. Art Roselle and Ralph Duco appear in the caster strip. Score and objective updates roll into place, with a light sweep for kills and a highlight for new series wins; the clock ticks steadily.

## Automatic playoff results

**Playoffs → Auto-update playoffs from match results** is enabled by default. Three distinct registered player IGNs identify each organization, including substitutes and names with small-cap lettering or decorative punctuation. The match parser previews the detected names, tags and logos. **Apply parsed data** records the game; fetching or parsing alone does not change the bracket.

Live auto-detection also records a confirmed result once enough fresh player names, the winner, final kills and duration have arrived. The organization receives its win regardless of its blue/red position. The matching playoff series uses its configured best-of format and advances its winner when clinched. Unrecognized rosters, incomplete results and team pairings that do not match a ready bracket fixture leave the bracket unchanged.

Recorded games persist in production backups and are protected against duplicate application. Capture scoring waits for the next draft or opening game clock (the first three minutes) before accepting another result screen. Turn automatic scoring off to operate the bracket manually.

Disable "Shutdown source when not visible" to keep sources loaded. Refresh the panel and OBS browser sources after pulling updates. For ad audio, enable "Control audio via OBS" in Browser Source properties and verify the mixer. Videos default to muted.

## Swiss bracket broadcast

Open **Swiss bracket** in the sidebar. Its separate OBS source is `http://127.0.0.1:3210/overlay.html?scene=swiss`, at **1920 × 1080**. **Show Swiss bracket in Program** selects the same scene in the main output.

The scene uses the supplied `swiss stage.svg` artwork and its original organization logos. The sixteen qualifiers from the supplied Groups A–H results follow these first-round pairings: ULS / USM EARTH SAVERS CLUB, JMES / FTSS, APO / ABES, PICE / DEVCOM, PSITS / JIECEP, JPEDS / AMS, FSMS / PNSA, and ICPEP / UFTTS. Group-stage records do not carry into Swiss.

Click the winning team in the tournament controls. Results update the artwork immediately; completing a round fills the next round's record pools. Three wins qualify and three losses eliminate. The completed bracket shows all five rounds and all sixteen final placements. Results can be corrected or cleared within the current round; previous rounds lock once the next round is generated. **Edit team names** preserves logos, results and positions. **Download updated SVG** exports a self-contained copy of the current graphic.

Swiss controls save only bracket data. They do not change the match schedule, ticker, match teams, game number or series format. Saved bracket results survive a restart. The floating MSL badge is removed; MSL branding uses the existing headers and partner areas, and the Swiss artwork retains its own partner logos.

Run `node tests/swiss-browser.cjs` for an isolated check of the controls, all five rounds, live output, SVG export and persistence. It uses temporary state and does not write to the production bracket or schedule.

## Operator workflow

1. Set event, stage, team tags/logos, five players and each round's bans in Teams & draft. Ban slots follow the playoff round: three per side in quarterfinals, five in semifinals, third place and grand finals.
2. Choose **Best of 3, 5 or 7** using the top toolbar. Series wins and in-game kills are separate values.
3. Click hero or ban slots in the Live Production preview to open the picker without leaving the tab. Click supported names, statistics, logos and timers to edit them. Schedule and sponsor areas open their respective controls.
4. Picked heroes pop in with a team-colored highlight. **MOTION** means a real looping clip is available; **STILL** means the portrait does not continuously animate. Sixteen heroes currently have MP4 artwork. Use the moving-artwork filter or import your own GIF/MP4/WebM and adjust its crop under Teams & draft. Alpha currently has no bundled moving clip.
5. Set/reset and start countdowns in Rundown & timers. Select the scene in Live Production.
6. Configure sponsors and upload ad media under Breaks & sponsors. Start rotation, hold, or advance manually. Hold pauses playlist advancement while the video keeps playing. Test media codecs and audio locally.
7. Export a backup before major changes. State is stored in `data/state.json`; uploaded files are in `public/assets/uploads`. Copy those files separately when transferring a production setup. OCR calibration is stored in each browser's local storage.

No PH flag, heart rate or AI prediction widgets are included. Artwork sources and moving-hero coverage are documented in [ARTWORK-SOURCES.md](public/assets/ARTWORK-SOURCES.md). Third-party artwork remains owned by its respective rights holders; inclusion does not grant ownership or unrestricted reuse.

## Adjust every scene's HUD

In **Live production**, click **Adjust HUD layout** below the preview. Select a group or individual element from the list, or click it in the preview. Drag to move, drag the corner to resize, or enter X/Y offsets, width/height percentages, text size and opacity. Hold Shift while resizing for independent height. Arrow keys nudge by one pixel; Shift + arrows nudge by ten. Use **Expand preview** for more working room.

The scoreboard, individual objectives, team tags, logos, player rails/cards, draft panels, timers, standby fixtures, ads, result tables and sponsor elements can be adjusted. Hide elements you do not need. Reset an element or the current scene, or undo recent element edits. Exit layout mode to resume normal click-to-edit controls.

Layout changes go live to all matching OBS sources and persist separately for each of the nine scenes in `data/state.json`. Production exports include layouts. Start by moving the player rails down/away from the game minimap and resizing the scoreboard to your capture. Coordinates are offsets in the 1920 ? 1080 canvas; nested elements move relative to their parent. Group and child sizes combine. The editor's outlines never appear in OBS output.

All 41 bundled organization logos have transparent PNG copies. Saved original logo selections automatically resolve to these copies; original artwork files remain available.

## OCR and synchronization

For live automation, open **OCR capture > Start live auto-detect**, then choose the clean game window. Auto-detect follows drafting, the spectator scoreboard and match results. Keep the desk page open. To replay a recording, choose **Open test video**, select **Auto-detect draft + game + result**, and start continuous OCR.

In-game detection reads the clock, kills, team gold and turret counts from the supplied spectator layout. Match-result detection reads the winner, final kills, duration, player names, KDA and player gold, then switches Program to postgame when scene following is enabled. It does not invent statistics absent from the HUD. Draft detection reads the phase, countdown (including red final seconds), five picks and each side's ban slots for the current round (three per side in quarterfinals, five in semifinals, third place and grand finals). Player names stay manual by default; enable **Read draft player names** only when the captured names read cleanly. The draft preset and skin references were checked against the supplied September 13 recording.

**Follow draft / game / result scenes in OBS Program** controls automatic scene switching. Turn it off to choose scenes yourself while continuing live data updates. The fixed OBS source URLs retain their chosen scenes. When the HUD disappears, readings stop; lost capture or a closed panel also stops extrapolating detected clocks. API auto-sync and continuous capture share the existing single-source controls.

The full-capture presets use the supplied examples as starting positions. For a different game aspect ratio, spectator HUD, result table, or borders, stop scanning, choose **Layout to calibrate**, select a field and drag its box over the corresponding content. Calibration is saved separately for drafting, gameplay and match results. Black borders and the mirroring title bar in the supplied windowed recording are normalized to the same game coordinates. A panel covering the heading pauses detection. Choose the actual game window or a fullscreen clean feed, so browser controls do not cover the clock.

Hero detection compares visible portraits with bundled artwork and locally saved samples. **It is not a model trained on every MLBB skin.** Unfamiliar artwork, tiny compressed portraits, pending picks and obscured slots can remain unknown. Under **Recognize an unfamiliar skin**, capture a portrait, select the hero shown, and remember it. The displayed sample stays frozen while you label it; subsequent live frames are matched automatically. Samples and calibration stay in this browser's local storage. Blank or uncertain slots do not clear existing picks or bans; use the manual draft controls between matches.

Manual changes and accepted capture readings are pushed to browser sources immediately through server-sent events. The manual OCR profiles use two local workers, confirm a field before proceeding through a long list, skip unchanged regions, and publish each accepted reading as it finishes. There is no three-second scan interval. Actual recognition speed depends on hardware, crop quality and the number of changed fields. The panel shows recognition and delivery times separately.

1. Capture the **clean game feed**, before your overlay is composited. You can also open a screenshot or a local test video. Capturing the composed OBS output can read your own displayed values back into the system.
2. Select the scoreboard or player-rail profile. Redraw the boxes for a different full-game capture. Select each field and drag over only its text/digits.
3. Read regions and review results. Confidence defaults to 80%. Continuous OCR normally requires two matching readings; use three for noisy footage. One reading is available if you accept the greater risk of false values.
4. Start **continuous OCR**. Turn on **Automatically apply confident readings** when the calibration is working. Low-confidence and unconfirmed values remain in the review panel. Confirmed decreases in cumulative live statistics are held; use **New game / clear OCR history** between matches or after correcting a bad reading.
5. The game clock can tick between live readings. Repeated frozen clock readings pause extrapolation; stopping OCR freezes it. Disable clock smoothing for footage that is frequently paused. Screenshot application sets a fixed time.

Starting OCR stops API auto-sync, and starting API auto-sync stops continuous OCR, to avoid competing automatic writers. The API refresh interval is selectable (1, 2 or 5 seconds); it also depends on the provider's response time and data freshness. Source changes invalidate outstanding OCR work. OCR applies only its recognized fields against the latest server state, preserving unrelated player edits.

Development checks include real Tesseract recognition, multi-reading confirmation, stream delivery, scoreboard recapture, and match-result synchronization. These are **not full-match accuracy validation**. Test your clean capture before a live production. Live portrait matching has the artwork and skin limitations described above.

## Local hero and item artwork

The publisher index supplies 133 heroes and 184 equipment records. **988 image files** (about 54 MiB) are stored in public/assets/mlbb-cdn, including 78 images under the requested community path. All 133 heroes and 181 equipment records have local artwork; three removed items have no image in the publisher index. The manifest records each source URL and SHA-256 hash. The CDN does not permit directory listing, so coverage means the indexed assets, not every unlisted file on the server.

Circular hero pictures appear in selectors and compact HUD slots; existing full portraits and moving clips remain available. The recognition library uses the downloaded variants. Match-result hero and item IDs resolve to local images, including older saved results that contain remote URLs. Refresh this collection with node tools/import-mlbb-assets.cjs.

## Official match parser

The official match parser supports completed match results, independently of the live draft detector:

1. Create a match at https://play.mobilelegends.com/match/#/.
2. Scan the QR code as host/spectator; have players join.
3. Copy the website's Match ID into Match parser.
4. Fetch and review the response before applying.

The server calls `https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=<matchId>`. The supplied sample ID returned "match not found" during development, so a successful current result payload still needs verification against a real Match ID. Recognized JSON team shapes and explicit field mappings are supported; numeric hero IDs or unknown schemas need an adapter built from a real response. Errors leave the last valid broadcast state intact.

Moonton's GMS asset service also exposes emblem metadata at source `2718120` (7 emblem families) and emblem talent metadata at source `2718121` (26 talents), using the same `api/gms/source/2713644/{sourceId}` endpoint and headers used for hero/item assets. These are catalogs, not a player's selected in-match build. The current parser has no verified field mapping for selected emblem/talent IDs; test that only after capturing an actual successful Moonton match response.

## Test and report issues

Run backend tests:

```sh
npm test
```

Install the optional browser test engine and run isolated smoke checks:

```sh
npx playwright install chromium
node tests/breaks-browser.cjs
node tests/scene-transition.cjs
node tests/live-production-browser.cjs
node tests/ocr-browser.cjs
node tests/live-detection-browser.cjs
node tests/result-detection-browser.cjs
node tests/draft-video.cjs "D:\Downloads\2026-09-13 19-54-22.mp4"
node tests/text-fit.cjs
node tests/logo-transparency.cjs
```

These use temporary state directories and separate ports. Screenshots go to ignored `data/`. The checks use ports 3211?3213 and 3216?3219 and 3221; run each listed command sequentially if using the same port. They leave the production server and saved match untouched.

Before a rehearsal, check all nine scenes, BO3/5/7, long team tags, pick/ban editing, moving artwork, timer reset/pause/resume, ad playback and rapid scene changes. Test OCR separately against clean screenshots and recorded matches; record expected versus recognized values. Report browser/OBS version, steps, expected result, actual result and a screenshot or clip. Do not attach credentials or private match information.

Update with `git pull` and `npm ci`, restart the server, and refresh browser sources. See [VALIDATION.md](VALIDATION.md) for development checks and limits.
