# CBDEM Dagyawan 2026 · MLBB OBS Overlay

Broadcast overlay for the CBDEM Dagyawan 2026 Mobile Legends: Bang Bang tournament (College of Business, Development Economics and Management, University of Southern Mindanao). It runs as an OBS Browser Source at 1920×1080 and is controlled from a web panel.

Everything on screen comes from the control panel. There is no OCR and no minimap: the game's own scoreboard (kills, gold, towers, timer) stays visible, and the overlay frames it.

## What it shows

- **Team logo tiles** at both ends of the game's scoreboard.
- **Team bar** under the scoreboard: slanted name tabs in each team's colours with the full society name.
- **Series wins** as pips under the inner end of each team bar (BO1 to BO7).
- **CBDEM seal** under the game timer, with the **GAME** chip below it.
- **Event card** (top right): USM lion logo, subtitle, title with the year in gold, MLBB logo.
- **Format strip** ("BO3" on a gold tab, then e.g. "GRAND FINALS") and **partners strip** (MSL Philippines, UEC Production).

The look is frosted white glass in the style of pro MLBB broadcasts, coloured from each team's logo.

## Quick start

```bash
npm install
npm start
```

- Control panel: **http://localhost:3211/**
- OBS overlay: **http://localhost:3211/overlay.html**

To use another port: `PORT=4000 npm start`.

On a network, the server prints the addresses other computers can use when it starts, for example `http://192.168.1.34:3211/overlay.html`. Run the server on one PC and open the panel or the overlay from any PC on the same network.

## OBS setup

1. Add a **Browser Source** above your game capture.
2. URL: `http://localhost:3211/overlay.html` (or the network address).
3. Width **1920**, height **1080**. The background is transparent.

Changes made in the panel show up in OBS straight away (Server-Sent Events). If the server restarts, the overlay reconnects on its own.

## Control panel

- **Teams**: pick the blue side and red side teams.
- **Series score**: wins for each side. Pips fill from the centre outwards, the GAME chip counts up from the wins, and its dot turns gold when the series is decided.
- **Match**: format line, e.g. `BO3 GRAND FINALS`.
- **Event**: title and subtitle for the event card.
- **Partners**: up to 4 partners, each with a name and a logo (PNG, JPG or WebP upload).
- **Display**: show or hide each part, and the **Glass** slider (how milky the panels are).
- **Calibration**: line the team bar up with the game's scoreboard, with alignment guides.

Settings are saved in `data/state.json` and survive restarts.

## Team colours

Each team's colours are set in `public/teams.json`:

```json
{ "id": "JPES", "name": "Junior Philippine Economics Society",
  "lines": ["Junior Philippine", "Economics Society"],
  "color": "#2d9c5f", "color2": "#0d5470", "accent": "#84e46c" }
```

- `color`: name tab and pips (white text sits on it, so keep it fairly dark).
- `color2`: the darker end of the tab gradient.
- `accent`: the line under the tab, the logo glow and lit pips.

Leave the colour fields out and the overlay picks colours from the team's logo instead. Logos go in `public/assets/logos-transparent/<ID>.png` (with `public/assets/logos/<ID>.png` as a fallback).

| Team | Full name |
|------|-----------|
| **JPES** | Junior Philippine Economics Society |
| **JMES** | Junior Marketing Executives Society |
| **JPSPA** | Junior Philippine Society for Public Administration |
| **JPIA** | Junior Philippine Institute of Accountants |
| **JPAMS** | Junior Philippine Agribusiness Management Society |

## Lining up with the game's scoreboard

The defaults (centre 960, width 945, height 55, offset 0) match MLBB's spectator view at 1920×1080. If your capture is scaled or cropped differently, turn on **Alignment guides** in Calibration, move the sliders until the dashed box sits exactly on the game's scoreboard, then turn the guides off before going live (they show in OBS too).

## URL options

Add these to the overlay URL:

| Option | What it does |
|--------|--------------|
| `?preview=1` | Shows a sample game frame behind the overlay, for checking the look in a browser. |
| `?guides=1` | Shows the alignment guides. |
| `?blur=1` | Real background blur in a browser (only useful with `?preview=1`; OBS can't see behind a Browser Source). |
| `?mask=1` | Draws every panel in solid white, for the real blur setup below. |

## Real blur (optional)

OBS can't blur what sits behind a Browser Source, so the frosted glass is drawn (milky fill, bright rim, gloss, grain and a passing sheen). For real blur behind the panels:

1. Install the **Composite Blur** plugin for OBS.
2. Add a second Browser Source with `http://localhost:3211/overlay.html?mask=1` at 1920×1080. Keep it off the stream (hide it, or put it in a scene you don't show) and leave "Shutdown source when not visible" unticked so it keeps updating.
3. Add a **Composite Blur** filter to the game capture and use that Browser Source as its mask, so only the parts under the panels are blurred.
4. Turn the **Glass** slider down a little so the blur shows through.

The mask follows the overlay: when a part is hidden in the panel, its blur goes too.

## Files

```
cbdem-mlbb-overlay/
├── server.js               # Express server, SSE, partner logo uploads
├── lib/state.js            # State defaults and validation
├── tests/state.test.js     # npm test
├── data/state.json         # Saved state (created on first run)
└── public/
    ├── index.html, app.js, app.css             # Control panel
    ├── overlay.html, overlay.js, overlay.css   # OBS overlay (1920×1080 stage)
    ├── fonts.css                               # Teko, Rajdhani, Chakra Petch (bundled, works offline)
    ├── teams.json                              # Teams and their colours
    └── assets/
        ├── brand/              # CBDEM seal, USM lion, MLBB logo
        ├── partners/           # Partner logos (uploads land here)
        ├── logos/              # Original team logos
        ├── logos-transparent/  # Team logos with transparent backgrounds
        ├── fx/                 # Glass grain texture
        └── preview/            # Sample game frame for ?preview=1
```

## API

- `GET /api/state`: current state
- `POST /api/state`: change part of the state (JSON); every overlay and panel updates
- `GET /api/events`: live updates (Server-Sent Events)
- `GET /api/config`: defaults and limits used by the panel
- `POST /api/partner-logo`: upload a partner logo

## Troubleshooting

**Overlay doesn't update in OBS**
1. Check the server is running (`npm start`).
2. Right-click the Browser Source → Refresh.
3. Right-click → Interact, then press F12 to see the browser console.

**Logos not showing**: check `public/assets/logos-transparent/<ID>.png` exists and the ID matches `teams.json`.

**Can't open the panel from another PC**: use the network address the server prints, check both PCs are on the same network, and allow port 3211 through the firewall.

## License

MIT
