const fs=require('node:fs');
let p='public/ocr-v2.js',s=fs.readFileSync(p,'utf8');
s=s.replace("$('#ocrStability').onchange=invalidate;","$('#ocrStability').onchange=invalidate;$('#detectDraftNames').onchange=invalidate;");fs.writeFileSync(p,s);
p='README.md';s=fs.readFileSync(p,'utf8');
s=s.replace(/For live automation,[^\n]+/, 'For live automation, open **OCR capture > Start live auto-detect**, then choose the clean game window. Auto-detect follows drafting, the spectator scoreboard and match results. Keep the desk page open. To replay a recording, choose **Open test video**, select **Auto-detect draft + game + result**, and start continuous OCR.');
s=s.replace('Draft picks and bans remain manual.','Draft detection reads the phase, countdown (including red final seconds), five picks and five bans per side. Player names stay manual by default; enable **Read draft player names** only when the captured names read cleanly. The draft preset and skin references were checked against the supplied September 13 recording.');
s=s.replace('**Follow game / result scenes in OBS Program**','**Follow draft / game / result scenes in OBS Program**');
s=s.replace('Calibration is saved separately for gameplay and match results.','Calibration is saved separately for drafting, gameplay and match results. Black borders and the mirroring title bar in the supplied windowed recording are normalized to the same game coordinates. A panel covering the heading pauses detection.');
s=s.replace('five players and three bans per side','five players and five bans per side');
s=s.replace('This workflow is intended for **Custom Room Draft Pick (6 Ban)**:','The official match parser supports completed match results, independently of the live draft detector:');
s=s.replace('node tests/result-detection-browser.cjs','node tests/result-detection-browser.cjs\nnode tests/draft-video.cjs "D:\\Downloads\\2026-09-13 19-54-22.mp4"');
s=s.replace('## Official match parser',`## Local hero and item artwork

The publisher index supplies 133 heroes and 184 equipment records. **988 image files** (about 54 MiB) are stored in public/assets/mlbb-cdn, including 78 images under the requested community path. All 133 heroes and 181 equipment records have local artwork; three removed items have no image in the publisher index. The manifest records each source URL and SHA-256 hash. The CDN does not permit directory listing, so coverage means the indexed assets, not every unlisted file on the server.

Circular hero pictures appear in selectors and compact HUD slots; existing full portraits and moving clips remain available. The recognition library uses the downloaded variants. Match-result hero and item IDs resolve to local images, including older saved results that contain remote URLs. Refresh this collection with node tools/import-mlbb-assets.cjs.

## Official match parser`);fs.writeFileSync(p,s);
p='VALIDATION.md';s=fs.readFileSync(p,'utf8');
s=s.replace('# Validation status',`# Validation status

- September 14 draft update: all 46 backend tests pass. Real MP4 playback was checked through the desk, detection API and OBS output using temporary production state. Checks include the initial ban, covered/pending slots, window normalization, all ten final picks and ten bans, the red countdown, stop/freeze and schedule preservation. The final validation frame is at 05:10; captured skin references include 05:00.
- All 988 downloaded CDN images decode successfully. The collection covers 133 heroes and 181 item records with artwork, plus metadata for three removed items without published images. Local result hero/item resolution is covered by backend and browser checks.
- Gameplay and match-result browser regressions pass after enabling draft detection. The supplied recording is one match; this does not establish accuracy for every skin, layout or player name.`);
s=s.replace('Draft heroes remain operator-controlled.','Draft picks and bans can be detected automatically; names are manual unless the operator enables name recognition.');
s=s.replace('between gameplay and match results. Draft OCR is disabled.','between drafting, gameplay and match results. The draft mode uses a heading plus countdown as evidence, with repeat confirmation for hero readings.');fs.writeFileSync(p,s);
p='public/assets/ARTWORK-SOURCES.md';s=fs.readFileSync(p,'utf8');
s=`# Publisher CDN refresh - 2026-09-14

The requested CDN community directory denies listing. Public publisher GMS indexes at https://api.gms.moontontech.com/api/gms/source/2713644/2766683 (heroes) and https://api.gms.moontontech.com/api/gms/source/2713644/2775075 (equipment) enumerate the artwork used here. The local mlbb-cdn/manifest.json contains source URLs, sizes and SHA-256 hashes for 988 files, including 78 community-directory files, all indexed pictures for 133 heroes and the equipment icons published for 181 of 184 item records. Goldshine Hammer, Ares Crown and Greedy Crusher are marked removed by the index and have no image URL.

tools/import-mlbb-assets.cjs refreshes these files and connects the catalog, portrait matcher and result display. The original downloaded image bytes are retained. Existing full-panel portraits and real video artwork retain their previous sources.

draft-reference-samples.json contains small labeled portrait samples from the user-provided September 13 draft video, plus empty and covered slots. Pick labels were verified on the video loading screen; ban labels were checked against the publisher head images. These are capture references, not a model trained on every skin.

`+s;fs.writeFileSync(p,s);
