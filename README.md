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

The server listens only on this computer. Your teammate runs their own copy; a GitHub link does not host or synchronize the panel. A fresh clone starts with default teams. No production state or uploaded ads are included.

## OBS setup

Add a Browser Source, set its size to **1920 x 1080**, and use:

`http://127.0.0.1:3210/overlay.html`

This Program source follows the scene selected in Live Production. Use it for the built-in scene wipe: the old scene stays visible until the cover arrives, the HUD swaps under cover, and the wipe exits without a middle pause.

For fixed sources, append `?scene=draft`, `?scene=scoreboard`, `?scene=players`, `?scene=countdown`, `?scene=intermission`, `?scene=sponsors`, `?scene=ads`, `?scene=postgame`, or `?scene=schedule`. Switching separate OBS scenes uses OBS's own transition settings. Draft, scoreboard and player rails have transparent backgrounds.

Disable "Shutdown source when not visible" to keep sources loaded. Refresh the panel and OBS browser sources after pulling updates. For ad audio, enable "Control audio via OBS" in Browser Source properties and verify the mixer. Videos default to muted.

## Operator workflow

1. Set event, stage, team tags/logos, five players and three bans per side in Teams & draft.
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

Manual changes and accepted OCR readings are pushed to browser sources immediately through server-sent events. OCR uses two local workers, confirms a field before proceeding through a long list, skips unchanged regions, and publishes each accepted reading as it finishes. There is no three-second scan interval. Actual recognition speed depends on hardware, crop quality and the number of changed fields. The panel shows recognition and delivery times separately.

1. Capture the **clean game feed**, before your overlay is composited. You can also open a screenshot or a local test video. Capturing the composed OBS output can read your own displayed values back into the system.
2. Select the scoreboard, player rails or draft text profile. Player/draft presets target the supplied reference crops; redraw the boxes for full game capture. Select each field and drag over only its text/digits.
3. Read regions and review results. Confidence defaults to 80%. Continuous OCR normally requires two matching readings; use three for noisy footage. One reading is available if you accept the greater risk of false values.
4. Start **continuous OCR**. Turn on **Automatically apply confident readings** when the calibration is working. Low-confidence and unconfirmed values remain in the review panel. Confirmed decreases in cumulative live statistics are held; use **New game / clear OCR history** between matches or after correcting a bad reading.
5. The game clock can tick between live readings. Repeated frozen clock readings pause extrapolation; stopping OCR freezes it. Disable clock smoothing for footage that is frequently paused. Screenshot application sets a fixed time.

Starting OCR stops API auto-sync, and starting API auto-sync stops continuous OCR, to avoid competing automatic writers. The API refresh interval is selectable (1, 2 or 5 seconds); it also depends on the provider's response time and data freshness. Source changes invalidate outstanding OCR work. OCR applies only its recognized fields against the latest server state, preserving unrelated player edits.

Development checks now include real Tesseract recognition, multi-reading confirmation, stream delivery, and a sampled frame from the supplied feedback video. These are **not full-match accuracy validation**. Test your clean capture before a live production. Hero identification from draft portraits/video is still future work; current OCR reads text and numbers.

## Official match parser

This workflow is intended for **Custom Room Draft Pick (6 Ban)**:

1. Create a match at https://play.mobilelegends.com/match/#/.
2. Scan the QR code as host/spectator; have players join.
3. Copy the website's Match ID into Match parser.
4. Fetch and review the response before applying.

The server calls `https://sg-api.mobilelegends.com/matchTools/v1/getMatchUrl?matchId=<matchId>`. The supplied sample ID returned "match not found" during development. A successful current provider schema is unverified. Recognized JSON team shapes and explicit field mappings are supported; numeric hero IDs or unknown schemas need an adapter built from a real response. Errors leave the last valid broadcast state intact.

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
node tests/text-fit.cjs
node tests/logo-transparency.cjs
```

These use temporary state directories and separate ports. Screenshots go to ignored `data/`. The checks use ports 3211?3213 and 3216?3219; run each listed command sequentially if using the same port. They leave the production server and saved match untouched.

Before a rehearsal, check all nine scenes, BO3/5/7, long team tags, pick/ban editing, moving artwork, timer reset/pause/resume, ad playback and rapid scene changes. Test OCR separately against clean screenshots and recorded matches; record expected versus recognized values. Report browser/OBS version, steps, expected result, actual result and a screenshot or clip. Do not attach credentials or private match information.

Update with `git pull` and `npm ci`, restart the server, and refresh browser sources. See [VALIDATION.md](VALIDATION.md) for development checks and limits.
