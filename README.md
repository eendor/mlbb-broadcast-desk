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

## OCR: experimental, live testing required

OCR is **not validated for live production**. Development checks exercised the parser and a single supplied screenshot field; these do not establish accuracy across a match, changing HUDs, video compression or transitions.

The current Tesseract implementation reads text/numbers: scoreboard statistics, player name/level/KDA/gold, and draft phase/countdown. It does **not** identify picked heroes from portraits or video. Player-rail and draft presets were calibrated to cropped reference screenshots, not a full game feed.

To test: open OCR, select a layout, upload your screenshot or capture the clean game window, and redraw each region to match your feed. Start with Selected field only. Scan, review confidence and values, then apply accepted readings. Keep automatic application off until tested thoroughly. Avoid capturing the composed OBS overlay, which can feed displayed values back into itself. API auto-polling and OCR can overwrite the same fields.

Future work: recognize picks and bans from draft scenes or recorded/live video, detect draft phases, map recognized heroes to slots, and require confidence across multiple frames before applying changes. This is planned work, not implemented functionality. Collect representative clips and expected picks/bans to build a validation dataset.

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
```

These use temporary state directories and separate ports. Screenshots go to ignored `data/`. Close any other test process using ports 3211 or 3213 first.

Before a rehearsal, check all nine scenes, BO3/5/7, long team tags, pick/ban editing, moving artwork, timer reset/pause/resume, ad playback and rapid scene changes. Test OCR separately against clean screenshots and recorded matches; record expected versus recognized values. Report browser/OBS version, steps, expected result, actual result and a screenshot or clip. Do not attach credentials or private match information.

Update with `git pull` and `npm ci`, restart the server, and refresh browser sources. See [VALIDATION.md](VALIDATION.md) for development checks and limits.
