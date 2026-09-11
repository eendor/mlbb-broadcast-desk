// Fit editable broadcast copy in layout pixels, independent of OBS/preview scale.
(() => {
  const selectors = [
    '.draft-center-team>b', '.broadcast-player-name', '.broadcast-bans>span',
    '.draft-center-clock>span', '.draft-match-label', '.draft-unpicked', '.vertical-hero',
    '.rail-name>b', '.rail-numbers>strong', '.sb-lead', '.logo.initial',
    '.broadcast-brand h1', '.broadcast-brand p', '.broadcast-topline>b',
    '.fixture-side>span', '.fixture-caption>*', '.standby-versus>b',
    '.broadcast-ad-placeholder h2', '.broadcast-ad-placeholder p',
    '.broadcast-bottom', '.ticker', '.showheader>span', '.winner h1',
    '.resultteam h2', '.resultrow>span', '.resultrow>b',
    '.fixture>strong', '.fixture>time', '.fixture>small',
    '.sponsor-show h1', '.partner-tile>b', '.partner-tile>small', '.ad-bug>b'
  ].join(',');
  const defaults = new WeakMap();
  function fitBroadcastText() {
    if (!stage.clientWidth) return;
    const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
    if (!scale) return;
    stage.querySelectorAll(selectors).forEach(el => {
      if (!defaults.has(el)) defaults.set(el, parseFloat(getComputedStyle(el).fontSize));
      const base = defaults.get(el)*Number(el.dataset.hudFontFactor||1);
      el.style.fontSize = base + 'px';
      const css = getComputedStyle(el);
      const vertical = css.writingMode.startsWith('vertical');
      const available = vertical
        ? el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
        : el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      if (available <= 0) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const size = () => {
        const rect = range.getBoundingClientRect();
        const box=el.getBoundingClientRect();const localScale=vertical?box.height/el.offsetHeight:box.width/el.offsetWidth;return (vertical ? rect.height : rect.width) / (localScale||scale);
      };
      if (size() <= available) return;
      let low = 0, high = base;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        el.style.fontSize = mid + 'px';
        if (size() <= available - 1) low = mid;
        else high = mid;
      }
      el.style.fontSize = low + 'px';
    });
    fitScoreboardNames();
  }
  window.fitBroadcastText=fitBroadcastText;
  const original = render;
  render = function() { original(); fitBroadcastText(); };
  // Timers, playlist content and font loading can change after a scene render.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fitBroadcastText(); });
  }).observe(stage, { childList: true, characterData: true, subtree: true });
  document.fonts.ready.then(fitBroadcastText);
  window.addEventListener('resize', fitBroadcastText);
})();
