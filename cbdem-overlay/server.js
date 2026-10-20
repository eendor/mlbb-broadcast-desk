'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const {
  CALIBRATION_LIMITS, DEFAULT_STATE, MAX_PARTNERS, MAX_PARTNER_NAME, MAX_SCORE, MAX_TEXT,
  sanitizePatch, normalizeState,
} = require('./lib/state');

const PORT = Number(process.env.PORT) || 3211;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PARTNER_DIR = path.join(PUBLIC_DIR, 'assets', 'partners');
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

const teamIds = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'teams.json'), 'utf8'))
  .map((team) => String(team.id).toUpperCase());

function saveState(next) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file first so a crash never leaves a half-written state.json
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, STATE_FILE);
}

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${STATE_FILE}, starting from defaults: ${err.message}`);
  }
  const loaded = normalizeState(saved, teamIds);
  if (!loaded.updatedAt) loaded.updatedAt = new Date().toISOString();
  saveState(loaded);
  return loaded;
}

let state = loadState();

// ---- live updates (Server-Sent Events)

const clients = new Set();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

// A comment line every 25 s keeps idle connections from being dropped
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000).unref();

// ---- partner logo uploads

// Only real PNG, JPEG or WebP files are accepted (checked by their first bytes, not the name)
function imageType(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop accents: Ñ -> N
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

// ---- network addresses

const PRIVATE_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

// Addresses other computers on the same network can use to reach this server.
// Home and school networks (192.168.x, 10.x, 172.16-31.x) are listed first.
function lanOrigins() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const ipv4 = net.family === 'IPv4' || net.family === 4;
      if (ipv4 && !net.internal && !net.address.startsWith('169.254.') && !ips.includes(net.address)) ips.push(net.address);
    }
  }
  const rank = (ip) => {
    const i = PRIVATE_RANGES.findIndex((re) => re.test(ip));
    return i === -1 ? PRIVATE_RANGES.length : i;
  };
  return ips.sort((a, b) => rank(a) - rank(b)).map((ip) => `http://${ip}:${PORT}`);
}

// ---- app

const app = express();
app.disable('x-powered-by');

app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/state', express.json({ limit: '64kb' }), (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Send a JSON object with the fields to change.' });
  }
  const changes = sanitizePatch(state, req.body, teamIds);
  // Values equal to what is already saved are not a change: no write, no broadcast
  for (const key of Object.keys(changes)) {
    if (JSON.stringify(changes[key]) === JSON.stringify(state[key])) delete changes[key];
  }
  if (Object.keys(changes).length) {
    state = { ...state, ...changes, updatedAt: new Date().toISOString() };
    saveState(state);
    broadcast('state', state);
  }
  res.json(state);
});

// Defaults and limits, so the control panel never has to copy them
app.get('/api/config', (req, res) => {
  res.json({
    defaults: DEFAULT_STATE,
    calibrationLimits: CALIBRATION_LIMITS,
    maxPartners: MAX_PARTNERS,
    maxPartnerName: MAX_PARTNER_NAME,
    maxScore: MAX_SCORE,
    maxText: MAX_TEXT,
    maxLogoBytes: MAX_LOGO_BYTES,
    lanOrigins: lanOrigins(),
  });
});

app.post('/api/partner-logo', express.json({ limit: '6mb' }), (req, res) => {
  const { name, data } = req.body || {};
  const match = typeof data === 'string' && /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(data);
  if (!match) return res.status(400).json({ error: 'Send the image as a base64 data URL.' });

  const buf = Buffer.from(match[1], 'base64');
  if (buf.length > MAX_LOGO_BYTES) return res.status(413).json({ error: 'Logo is larger than 4 MB.' });
  const ext = imageType(buf);
  if (!ext) return res.status(415).json({ error: 'Use a PNG, JPG or WebP image.' });

  const logo = `${slugify(name) || 'partner'}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.mkdirSync(PARTNER_DIR, { recursive: true });
  fs.writeFileSync(path.join(PARTNER_DIR, logo), buf);
  res.json({ logo });
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, 'state', state);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.use(express.static(PUBLIC_DIR));

// JSON errors for the API (bad JSON, body too large)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = err.type === 'entity.too.large' ? 'Request is too large.'
    : err.type === 'entity.parse.failed' ? 'Request body is not valid JSON.'
      : status >= 500 ? 'Server error.' : err.message;
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, () => {
  console.log('CBDEM Dagyawan 2026 overlay server');
  console.log('');
  console.log('  On this computer');
  console.log(`    Control panel  http://localhost:${PORT}/`);
  console.log(`    OBS overlay    http://localhost:${PORT}/overlay.html`);
  const origins = lanOrigins();
  if (origins.length) {
    console.log('');
    console.log('  From other computers on the same network');
    for (const origin of origins) {
      console.log(`    Control panel  ${origin}/`);
      console.log(`    OBS overlay    ${origin}/overlay.html`);
    }
  }
  console.log('');
  console.log('  OBS: add a Browser Source, size 1920 x 1080.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server first, or start this one with PORT=3212 npm start`);
    process.exit(1);
  }
  throw err;
});

function shutdown() {
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
