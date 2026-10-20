'use strict';

// Overlay state: defaults and validation for everything the control panel can change.

const DEFAULT_CALIBRATION = Object.freeze({ center: 960, width: 945, height: 55, offsetY: 0 });

// Allowed calibration range for each key, in 1920x1080 stage pixels
const CALIBRATION_LIMITS = Object.freeze({
  center: [900, 1020],
  width: [800, 1100],
  height: [30, 90],
  offsetY: [-20, 40],
});

const DEFAULT_PARTNERS = Object.freeze([
  Object.freeze({ name: 'MSL PHILIPPINES', logo: 'msl-ph.png', show: true }),
  Object.freeze({ name: 'UEC PRODUCTION', logo: 'uec-production.png', show: true }),
]);

const DEFAULT_STATE = Object.freeze({
  blueTeam: 'JPES',
  redTeam: 'JMES',
  blueScore: 0,
  redScore: 0,
  format: 'BO3 GRAND FINALS',
  tournamentTitle: 'CBDEM DAGYAWAN 2026',
  tournamentSubtitle: 'UNIVERSITY OF SOUTHERN MINDANAO',
  showScore: true,
  showEvent: true,
  showEmblem: true,
  showPartners: true,
  showGuides: false,
  partnersLabel: 'IN PARTNERSHIP WITH',
  partners: DEFAULT_PARTNERS,
  glass: 60,
  sheen: true,
  calibration: DEFAULT_CALIBRATION,
});

const TEXT_KEYS = ['format', 'tournamentTitle', 'tournamentSubtitle', 'partnersLabel'];
const BOOLEAN_KEYS = ['showScore', 'showEvent', 'showEmblem', 'showPartners', 'showGuides', 'sheen'];

const MAX_TEXT = 60;
const MAX_PARTNERS = 4;
const MAX_PARTNER_NAME = 40;
const MAX_SCORE = 4; // BO7 needs 4 wins

// File name inside public/assets/partners/
const PARTNER_LOGO_RE = /^[a-z0-9][a-z0-9._-]{0,60}\.(png|jpe?g|webp)$/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Finite number from a number or numeric string, otherwise null
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanTeam(value, teamIds) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toUpperCase();
  return teamIds.includes(id) ? id : null;
}

function cleanPartner(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = cleanText(value.name, MAX_PARTNER_NAME);
  const logo = typeof value.logo === 'string' && PARTNER_LOGO_RE.test(value.logo) ? value.logo : '';
  return { name: name || '', logo, show: typeof value.show === 'boolean' ? value.show : true };
}

/**
 * Turn an untrusted patch into a clean partial state.
 * Unknown keys and invalid values are dropped; numbers are clamped.
 * Calibration keys are merged with the current calibration.
 */
function sanitizePatch(current, patch, teamIds) {
  const out = {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);

  for (const side of ['blueTeam', 'redTeam']) {
    if (!has(side)) continue;
    const id = cleanTeam(patch[side], teamIds);
    if (id) out[side] = id;
  }

  // Picking the other side's team swaps the two sides, scores included
  const swapSides = (changed, other) => {
    if (!(changed in out) || (other in out) || out[changed] !== current[other]) return;
    out[other] = current[changed];
    const [changedScore, otherScore] = changed === 'blueTeam' ? ['blueScore', 'redScore'] : ['redScore', 'blueScore'];
    if (!has(changedScore) && !has(otherScore)) {
      out[changedScore] = current[otherScore];
      out[otherScore] = current[changedScore];
    }
  };
  swapSides('blueTeam', 'redTeam');
  swapSides('redTeam', 'blueTeam');
  if (out.blueTeam && out.blueTeam === (out.redTeam || current.redTeam)) delete out.blueTeam;
  if (out.redTeam && out.redTeam === (out.blueTeam || current.blueTeam)) delete out.redTeam;

  for (const key of ['blueScore', 'redScore']) {
    if (!has(key)) continue;
    const n = toNumber(patch[key]);
    if (n !== null) out[key] = clamp(Math.round(n), 0, MAX_SCORE);
  }

  for (const key of TEXT_KEYS) {
    if (!has(key)) continue;
    const text = cleanText(patch[key], MAX_TEXT);
    if (text !== null) out[key] = text;
  }

  for (const key of BOOLEAN_KEYS) {
    if (has(key) && typeof patch[key] === 'boolean') out[key] = patch[key];
  }

  if (has('glass')) {
    const n = toNumber(patch.glass);
    if (n !== null) out.glass = clamp(Math.round(n), 0, 100);
  }

  if (has('calibration') && patch.calibration && typeof patch.calibration === 'object' && !Array.isArray(patch.calibration)) {
    const calibration = { ...DEFAULT_CALIBRATION, ...(current.calibration || {}) };
    let changed = false;
    for (const [key, [min, max]] of Object.entries(CALIBRATION_LIMITS)) {
      if (!Object.prototype.hasOwnProperty.call(patch.calibration, key)) continue;
      const n = toNumber(patch.calibration[key]);
      if (n === null) continue;
      calibration[key] = clamp(Math.round(n), min, max);
      changed = true;
    }
    if (changed) out.calibration = calibration;
  }

  if (has('partners') && Array.isArray(patch.partners)) {
    out.partners = patch.partners.slice(0, MAX_PARTNERS).map(cleanPartner).filter(Boolean);
  }

  return out;
}

function copyDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

/** Full, valid state from whatever was saved on disk (older versions included). */
function normalizeState(saved, teamIds) {
  const base = copyDefaults();
  if (!teamIds.includes(base.blueTeam)) base.blueTeam = teamIds[0];
  if (!teamIds.includes(base.redTeam) || base.redTeam === base.blueTeam) {
    base.redTeam = teamIds.find((id) => id !== base.blueTeam) || base.blueTeam;
  }
  const state = { ...base, ...sanitizePatch(base, saved, teamIds) };
  if (saved && typeof saved.updatedAt === 'string') state.updatedAt = saved.updatedAt;
  return state;
}

module.exports = {
  DEFAULT_STATE,
  DEFAULT_CALIBRATION,
  CALIBRATION_LIMITS,
  PARTNER_LOGO_RE,
  MAX_PARTNERS,
  MAX_PARTNER_NAME,
  MAX_SCORE,
  MAX_TEXT,
  sanitizePatch,
  normalizeState,
};
