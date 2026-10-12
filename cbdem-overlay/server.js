const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3211;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and state file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_STATE = {
  blueTeam: 'JPES',
  redTeam: 'JPSPA',
  blueScore: 0,
  redScore: 0,
  format: 'BO3 GRAND FINALS',
  tournamentTitle: 'CBDEM MLBB TOURNAMENT',
  tournamentSubtitle: 'UNIVERSITY OF SOUTHERN MINDANAO',
  caster: 'ALFRICKPLAYS',
  showCaster: true,
  showScore: true,
  updatedAt: new Date().toISOString()
};

if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
}

// SSE clients
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return DEFAULT_STATE;
  }
}

function writeState(patch) {
  const current = readState();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

// API routes
app.get('/api/state', (req, res) => {
  res.json(readState());
});

app.post('/api/state', (req, res) => {
  const updated = writeState(req.body || {});
  broadcast('state', updated);
  res.json(updated);
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.add(res);

  // Send current state on connect
  res.write(`event: state\ndata: ${JSON.stringify(readState())}\n\n`);

  req.on('close', () => {
    clients.delete(res);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`CBDEM MLBB Overlay server running on http://localhost:${PORT}`);
  console.log(`Control panel: http://localhost:${PORT}/`);
  console.log(`Overlay (OBS): http://localhost:${PORT}/overlay.html`);
});
