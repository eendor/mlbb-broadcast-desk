// Transparent team-camera overlay, positioned to sit ABOVE the draft package so
// it can be mixed with the Draft Arena scene. The two openings are edge-aligned
// with the draft's blue (left) and red (right) sides. Discord team views go
// behind this overlay in OBS; the framed openings mark where to crop them.
//
// URL background modes:
//   (none)     fully transparent (nothing but frames + header)
//   bg=1       full 1920x1080 dark-gold backdrop with the two camera boxes
//              cut out. Use for the standalone Team Cameras scene.
//   bg=draft   backdrop fills only the top area ABOVE the draft package, with
//              the two camera boxes cut out. The draft region stays clear so
//              the Draft Arena source shows through beneath it.
function renderPlayerCameras(s) {
  // Draft Arena package: left:16 right:16 bottom:18 height:310 -> its top is
  // 1080-18-310 = 752. The draft splits into 1fr / 365 / 1fr, so the blue side
  // spans x 16..777 and the red side x 1143..1904 (width ~761 each). The camera
  // openings match those columns and stop above the draft top edge.
  const FRAME_W = 761, FRAME_TOP = 150, FRAME_H = 500;
  const bgMode = new URLSearchParams(location.search).get('bg');
  const withBackdrop = bgMode === '1' || bgMode === 'draft';
  // The drafting mix must not paint over the Draft Arena below it.
  const bgHeight = bgMode === 'draft' ? 748 : 1080;
  const columns = [
    { side: 'blue', x: 16, label: 'BLUE SIDE' },
    { side: 'red', x: 1143, label: 'RED SIDE' },
  ];
  // Punch the two camera boxes out of the animated backdrop with an inline SVG
  // clip-path (compound path + evenodd). This renders reliably in OBS's CEF
  // browser, unlike CSS mask/data-URI masks. The outer rect is kept; the two
  // inner rects become holes so the cropped Discord feeds behind show through.
  const holeY = FRAME_TOP + 96;
  const clipPath = withBackdrop ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="tc-clip" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="M0 0H1920V${bgHeight}H0Z ${columns.map(({ x }) => `M${x} ${holeY}h${FRAME_W}v${FRAME_H}h-${FRAME_W}Z`).join(' ')}"/></clipPath></defs></svg>` : '';
  const maskStyle = withBackdrop ? `height:${bgHeight}px;clip-path:url(#tc-clip);-webkit-clip-path:url(#tc-clip);` : '';
  const backdrop = withBackdrop ? `${clipPath}<div class="tc-backdrop-wrap" style="${maskStyle}">
    <div class="tc-anim" aria-hidden="true">
      <div class="tc-topglow"></div>
      <div class="tc-heat"></div>
      <div class="tc-flame f1"></div><div class="tc-flame f2"></div><div class="tc-flame f3"></div>
      <div class="tc-surges">${Array.from({ length: 7 }, (_, i) => `<i style="--x:${8 + i * 13}%;--delay:-${i * 0.9}s"></i>`).join('')}</div>
      <div class="tc-sparks">${Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 3.4) % 100}%;--d:${5 + (i % 6)}s;--delay:-${i * 0.6}s;--s:${2 + (i % 3)}px;--drift:${(i % 5) * 12 - 24}px"></i>`).join('')}</div>
    </div>
  </div>` : '';
  const cards = columns.map(({ side, x, label }) => {
    const team = s[side];
    const crest = team.logo?.startsWith('/assets/')
      ? `<img class="team-camera-logo" src="${esc(window.transparentLogoUrl?.(team.logo) || team.logo)}" alt="${esc(team.tag)} logo">`
      : '';
    return `<section class="team-camera-card ${side}" style="left:${x}px;width:${FRAME_W}px">
      <header class="tc-head">${crest}<div class="tc-id"><span class="tc-eyebrow">${label}</span><h2>${esc(team.tag)}</h2></div><b class="tc-team-score">${team.score}</b></header>
      <div class="team-camera-frame" style="height:${FRAME_H}px" aria-label="${esc(team.tag)} camera"></div>
    </section>`;
  }).join('');
  stage.innerHTML = `<div class="team-camera-scene${withBackdrop ? ' has-backdrop' : ''}" style="--frame-top:${FRAME_TOP}px">
    ${backdrop}
    <div class="tc-top"><img src="/assets/pasiklaban/wordmark.png" alt="Pasiklaban"><div><span class="tc-eyebrow">USM PASIKLABAN 2026</span><h1>${esc(s.stage)}</h1></div><span class="tc-format">BEST OF ${s.bestOf}<i></i>GAME ${s.game}</span></div>
    ${cards}
  </div>`;
}
