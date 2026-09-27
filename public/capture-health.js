/* Capture health for the local OCR feed.
 *
 * A capture source can fail in ways that still deliver a technically "live"
 * track: a fullscreen swapchain stops presenting and returns black, a Windows
 * Graphics Capture item stalls and returns the last painted frame, an OBS
 * Virtual Camera drops its resolution mid-match, or a track is muted while the
 * browser keeps decoding the last frame. None of these raise an `ended` event,
 * so none of them can be detected by track state alone.
 *
 * This module is deliberately pure and DOM-free so it can be unit tested with
 * synthetic pixel data. ocr-v2.js is responsible for reading pixels off a
 * canvas and turning a verdict into operator-facing behaviour.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptureHealth = api;
})(globalThis, () => {
  // A real game frame always has a spread of bright and dark pixels. A flat
  // field means the compositor gave us nothing to look at.
  const DEFAULTS = {
    darkRatio: 0.985,   // fraction of near-black samples that reads as "no picture"
    meanFloor: 2,       // average luma floor
    varianceFloor: 1.2, // luma spread floor, catches uniformly dark-but-not-black
    freezeDelta: 0.35,  // mean absolute luma change vs previous frame
    freezeFrames: 12,   // consecutive near-identical frames before calling it frozen
    settleFrames: 2     // good frames required before reporting a clean recovery
  };

  /* Reduce a RGBA buffer to the statistics that matter. */
  function analyze(pixels, width, height, step) {
    const stride = step || Math.max(1, Math.round(Math.min(width, height) / 48));
    let sum = 0, samples = 0, dark = 0, sumSq = 0;
    const luma = [];
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const i = (y * width + x) * 4;
        const v = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        luma.push(v);
        sum += v;
        sumSq += v * v;
        // A pixel this dark carries no broadcast information.
        if (v < 12) dark++;
        samples++;
      }
    }
    if (!samples) return { mean: 0, variance: 0, darkRatio: 1, luma: null };
    const mean = sum / samples;
    return {
      mean,
      variance: samples > 1 ? Math.max(0, sumSq / samples - mean * mean) : 0,
      darkRatio: dark / samples,
      luma
    };
  }

  function meanAbsoluteDelta(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    return d / a.length;
  }

  /* Decide whether one frame is a usable game frame. */
  function frameVerdict(sample, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const s = sample || {};
    if (s.trackState === 'ended') return { ok: false, state: 'ended', reason: 'Capture track ended' };
    if (s.trackState === 'muted') return { ok: false, state: 'muted', reason: 'Capture track is muted' };
    // "No picture yet" is a genuinely absent sample. A buffer full of black
    // pixels is a real, present, and useless frame — it must be reported as
    // black rather than waiting forever for a first frame.
    if (!s.width || !s.height || !s.luma || !s.luma.length)
      return { ok: false, state: 'starting', reason: 'Waiting for the first frame' };
    if (s.darkRatio >= o.darkRatio || s.mean < o.meanFloor)
      return { ok: false, state: 'black', reason: 'Capture is returning a black frame' };
    if (s.variance < o.varianceFloor)
      return { ok: false, state: 'black', reason: 'Capture is returning a flat, featureless frame' };
    return { ok: true, state: 'ok', reason: '' };
  }

  /*
   * Stateful monitor. A single black frame during a scene switch is normal, so
   * a verdict only becomes "unusable" once it persists, and a source has to
   * deliver several good frames before it is trusted again. That hysteresis is
   * what stops a live broadcast from flapping between reading and holding.
   */
  function create(options) {
    const o = Object.assign({}, DEFAULTS, options);
    let previous = null, badRun = 0, goodRun = 0, state = 'starting';
    let lastWidth = 0, lastHeight = 0, resolutionChangedAt = 0, lastGoodAt = 0, reason = '';
    // Recovery must be signalled once per outage, not on every settling frame.
    let outageSignalled = false;

    function reset() {
      previous = null; badRun = 0; goodRun = 0; state = 'starting'; lastGoodAt = 0; reason = '';
      outageSignalled = false;
    }

    /* `now` is injected so tests are deterministic. */
    function observe(sample, now) {
      const at = now == null ? Date.now() : now;
      const verdict = frameVerdict(sample, o);

      if (sample && sample.width && sample.height) {
        if (lastWidth && (sample.width !== lastWidth || sample.height !== lastHeight)) resolutionChangedAt = at;
        lastWidth = sample.width; lastHeight = sample.height;
      }

      if (!verdict.ok) {
        goodRun = 0;
        badRun++;
        state = verdict.state === 'starting' && badRun === 1 ? 'starting' : verdict.state;
        reason = verdict.reason;
        outageSignalled = false;
        // A black frame carries no usable delta, so it must not become the
        // frozen-frame reference or a later good frame looks like a huge jump.
        if (verdict.state === 'black' || verdict.state === 'ended') previous = null;
        return { ok: false, state, reason, badRun, goodRun, resolutionChangedAt, lastGoodAt };
      }

      const delta = meanAbsoluteDelta(previous, sample.luma);
      previous = sample.luma;
      const frozen = delta < o.freezeDelta;
      badRun = frozen ? badRun + 1 : 0;

      if (frozen && badRun >= o.freezeFrames) {
        state = 'frozen';
        reason = `Capture is frozen (${badRun} identical frames)`;
        outageSignalled = false;
        return { ok: false, state, reason, badRun, goodRun, resolutionChangedAt, lastGoodAt };
      }

      const wasDown = state === 'black' || state === 'frozen' || state === 'muted' || state === 'ended';
      const recovered = wasDown && !outageSignalled;
      if (recovered) outageSignalled = true;
      goodRun++;
      lastGoodAt = at;
      if (goodRun >= o.settleFrames) { state = 'ok'; reason = ''; }
      return {
        ok: true,
        state: goodRun >= o.settleFrames ? 'ok' : 'settling',
        reason,
        recovered,
        badRun,
        goodRun,
        resolutionChangedAt,
        lastGoodAt
      };
    }

    return {
      observe,
      reset,
      get state() { return state; },
      get reason() { return reason; },
      get resolutionChangedAt() { return resolutionChangedAt; },
      get lastGoodAt() { return lastGoodAt; },
      options: o
    };
  }

  return { DEFAULTS, analyze, meanAbsoluteDelta, frameVerdict, create };
});
