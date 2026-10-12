# CBDEM MLBB Tournament OBS Overlay

Standalone OBS Browser Source overlay for the CBDEM (College of Business, Development Economics and Management) MLBB tournament at University of Southern Mindanao.

## Quick Start

```bash
npm install
npm start
```

Server runs on **http://localhost:3211**

## Setup

### 1. Start the Server

```bash
cd /home/rodnee/cbdem-mlbb-overlay
npm start
```

### 2. Configure OBS

1. Add a **Browser Source** to your OBS scene
2. Set URL to: `http://localhost:3211/overlay.html`
3. Set dimensions to: **1920 × 1080**
4. Check "Shutdown source when not visible" (optional)
5. Leave other settings at defaults

The overlay has a transparent background and will sit cleanly over your game feed.

### 3. Control Panel

Open **http://localhost:3211/** in your browser to control the overlay.

- **Blue Side** (left column): Click to select the blue team
- **Red Side** (right column): Click to select the red team
- **Match Format**: Enter the match format (e.g., "BO3 GRAND FINALS", "BO5 UPPER BRACKET")
- **Caster**: Enter the shoutcaster name
- Click **Apply Changes** to update the overlay live

Changes push instantly to OBS via Server-Sent Events (SSE).

## Teams

Five student societies competing:

| Acronym | Full Name |
|---------|-----------|
| **JPES** | Junior Philippine Economics Society |
| **JMES** | Junior Marketing Executives Society |
| **JPSPA** | Junior Philippine Society for Public Administration |
| **JPIA** | Junior Philippine Institute of Accountants |
| **JPAMS** | Junior Philippine Agribusiness Management Society |

## Design & Layout

- **Two Team Overlays Only**: Clean, uncluttered layout matching professional MLBB broadcasts.
- **Top Bar Alignment**: Anchored at `y: 56px` directly framing the in-game scoreboard (leaving native gold, turret, and turtle stats visible at the top).
- **Esports Chamfered Chassis**: Sharp geometric angular cuts (`clip-path: polygon(...)`) with dark carbon/obsidian backgrounds.
- **Shield Crest Badges**: Team logos held in metallic hexagonal shield crests with NO white background boxes.
- **Luminous Energy Stripes**: Electric cyan glow for Blue Side, vibrant ruby glow for Red Side.
- **Esports Typography**: Condensed bold typeface (`Teko`) for team acronyms with subtitle tracking (`Rajdhani`).
- **Series Score Indicators**: Diamond pips showing game wins for BO1, BO3, and BO5 series.

## File Structure

```
cbdem-mlbb-overlay/
├── server.js                      # Express server + SSE + state persistence
├── package.json                   # Dependencies and scripts
├── data/
│   └── state.json                 # Current overlay state (persisted)
├── public/
│   ├── index.html                 # Control panel UI
│   ├── app.js                     # Control panel logic
│   ├── app.css                    # Control panel styles
│   ├── overlay.html               # OBS overlay scene
│   ├── overlay.js                 # Overlay auto-scale + SSE client
│   ├── overlay.css                # Overlay layout (1920×1080 stage)
│   └── assets/
│       ├── logos/                 # Original team logos
│       └── logos-transparent/     # Chroma-keyed transparent PNGs
└── generate_transparent_logos.py  # Logo processing script
```

## API Endpoints

- `GET /api/state` — Returns current overlay state
- `POST /api/state` — Update overlay state (broadcasts to all connected overlays)
- `GET /api/events` — SSE stream for live updates

## Troubleshooting

### Overlay doesn't update in OBS

1. Check that the server is running (`npm start`)
2. Refresh the Browser Source in OBS (right-click → Refresh)
3. Check the browser console in OBS (right-click → Interact → F12)

### Logos not showing

1. Verify logos exist in `public/assets/logos-transparent/`
2. Check browser console for 404 errors
3. Fallback path tries `public/assets/logos/{TEAM}.png` if transparent version fails

### Control panel won't connect

1. Verify server is running on port 3211
2. Check for port conflicts: `lsof -i :3211`
3. Try accessing from same machine first: `http://localhost:3211`

## License

MIT
