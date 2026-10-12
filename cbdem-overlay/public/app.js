// Team Data
const TEAMS = [
  { id: 'JPES', acronym: 'JPES', name: 'Junior Philippine Economics Society' },
  { id: 'JMES', acronym: 'JMES', name: 'Junior Marketing Executives Society' },
  { id: 'JPSPA', acronym: 'JPSPA', name: 'Junior Philippine Society for Public Administration' },
  { id: 'JPIA', acronym: 'JPIA', name: 'Junior Philippine Institute of Accountants' },
  { id: 'JPAMS', acronym: 'JPAMS', name: 'Junior Philippine Agribusiness Management Society' }
];

// Local state
let state = {
  blueTeam: 'JPES',
  redTeam: 'JPSPA',
  blueScore: 0,
  redScore: 0,
  format: 'BO3 GRAND FINALS'
};

let lastUpdated = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  renderTeamSelectors();
  setupEventListeners();
  loadState();
  initSSE();
});

// Render Blue and Red team selection cards
function renderTeamSelectors() {
  const blueContainer = document.getElementById('blueTeamList');
  const redContainer = document.getElementById('redTeamList');

  if (!blueContainer || !redContainer) return;

  blueContainer.innerHTML = '';
  redContainer.innerHTML = '';

  TEAMS.forEach(team => {
    // Blue Card
    const blueCard = createTeamCard(team, 'blue');
    blueContainer.appendChild(blueCard);

    // Red Card
    const redCard = createTeamCard(team, 'red');
    redContainer.appendChild(redCard);
  });
}

function createTeamCard(team, side) {
  const card = document.createElement('div');
  card.className = `team-card ${side}-card`;
  card.dataset.teamId = team.id;
  card.dataset.side = side;

  card.innerHTML = `
    <div class="team-card-logo-wrap">
      <img src="assets/logos-transparent/${team.id}.png"
           alt="${team.id}"
           class="team-card-logo"
           onerror="this.src='assets/logos/${team.id}.png'">
    </div>
    <div class="team-card-meta">
      <span class="team-card-acronym">${team.acronym}</span>
      <span class="team-card-name">${team.name}</span>
    </div>
  `;

  card.addEventListener('click', () => {
    if (side === 'blue') {
      state.blueTeam = team.id;
    } else {
      state.redTeam = team.id;
    }
    updateSelectedCards();
  });

  return card;
}

function updateSelectedCards() {
  document.querySelectorAll('.team-card[data-side="blue"]').forEach(card => {
    card.classList.toggle('selected', card.dataset.teamId === state.blueTeam);
  });
  document.querySelectorAll('.team-card[data-side="red"]').forEach(card => {
    card.classList.toggle('selected', card.dataset.teamId === state.redTeam);
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Score Steppers
  document.getElementById('blueScorePlus')?.addEventListener('click', () => {
    state.blueScore = Math.min((state.blueScore || 0) + 1, 4);
    updateScoreDisplays();
  });
  document.getElementById('blueScoreMinus')?.addEventListener('click', () => {
    state.blueScore = Math.max((state.blueScore || 0) - 1, 0);
    updateScoreDisplays();
  });

  document.getElementById('redScorePlus')?.addEventListener('click', () => {
    state.redScore = Math.min((state.redScore || 0) + 1, 4);
    updateScoreDisplays();
  });
  document.getElementById('redScoreMinus')?.addEventListener('click', () => {
    state.redScore = Math.max((state.redScore || 0) - 1, 0);
    updateScoreDisplays();
  });

  // Swap Teams
  document.getElementById('swapTeamsBtn')?.addEventListener('click', () => {
    const tempTeam = state.blueTeam;
    const tempScore = state.blueScore;
    state.blueTeam = state.redTeam;
    state.blueScore = state.redScore;
    state.redTeam = tempTeam;
    state.redScore = tempScore;

    updateSelectedCards();
    updateScoreDisplays();
  });

  // Presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      const input = document.getElementById('formatInput');
      if (input && format) {
        input.value = format;
      }
    });
  });

  // Copy URL
  document.getElementById('copyUrlBtn')?.addEventListener('click', () => {
    const code = document.getElementById('obsUrlCode');
    if (code) {
      navigator.clipboard.writeText(code.textContent.trim());
      const btn = document.getElementById('copyUrlBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy URL'; }, 1800);
    }
  });

  // Apply Changes
  document.getElementById('applyBtn')?.addEventListener('click', applyChanges);
}

function updateScoreDisplays() {
  const blueDisp = document.getElementById('blueScoreDisplay');
  const redDisp = document.getElementById('redScoreDisplay');
  if (blueDisp) blueDisp.textContent = state.blueScore || 0;
  if (redDisp) redDisp.textContent = state.redScore || 0;
}

// Fetch current state from server
async function loadState() {
  try {
    updateStatus('Connecting...', false);
    const res = await fetch('/api/state');
    const data = await res.json();
    Object.assign(state, data);

    // Update UI fields
    updateSelectedCards();
    updateScoreDisplays();

    const formatInput = document.getElementById('formatInput');
    if (formatInput && state.format) formatInput.value = state.format;

    lastUpdated = new Date();
    updateStatus('Connected to Broadcast', true);
  } catch (err) {
    console.error('Failed to load state', err);
    updateStatus('Offline / Connection Error', false);
  }
}

// Save changes to server
async function applyChanges() {
  state.format = document.getElementById('formatInput')?.value.trim() || 'BO3 GRAND FINALS';

  try {
    updateStatus('Pushing to OBS...', false);
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });

    if (res.ok) {
      lastUpdated = new Date();
      updateStatus('Applied Live to OBS ✓', true);
      setTimeout(() => { updateStatus('Connected to Broadcast', true); }, 2200);
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    console.error('Failed to push state', err);
    updateStatus('Error Applying Changes', false);
  }
}

// Live SSE Stream
function initSSE() {
  const events = new EventSource('/api/events');
  events.addEventListener('state', (e) => {
    try {
      const data = JSON.parse(e.data);
      Object.assign(state, data);
      updateSelectedCards();
      updateScoreDisplays();
    } catch (err) {
      console.error('SSE parse error', err);
    }
  });

  events.onopen = () => {
    updateStatus('Connected to Broadcast', true);
  };

  events.onerror = () => {
    updateStatus('Reconnecting...', false);
  };
}

function updateStatus(text, isConnected) {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  if (statusText) statusText.textContent = text;
  if (statusDot) {
    statusDot.classList.toggle('connected', isConnected);
  }
}
