// Team Metadata
const TEAMS_INFO = {
  'JPES': { acronym: 'JPES', fullName: 'Economics Society' },
  'JMES': { acronym: 'JMES', fullName: 'Marketing Executives' },
  'JPSPA': { acronym: 'JPSPA', fullName: 'Public Administration' },
  'JPIA': { acronym: 'JPIA', fullName: 'Institute of Accountants' },
  'JPAMS': { acronym: 'JPAMS', fullName: 'Agribusiness Management' }
};

// 1920×1080 auto-scaling for OBS Browser Source / responsive preview
function resize() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const stage = document.getElementById('stage');
  if (stage) {
    stage.style.transform = `scale(${scale})`;
  }
}

window.addEventListener('resize', resize);
window.addEventListener('DOMContentLoaded', resize);
resize();

// Resolve team logo URL (prefer transparent PNG, fall back to original)
function logoUrl(teamId) {
  if (!teamId) return '';
  return `assets/logos-transparent/${teamId.toUpperCase()}.png`;
}

// Render Series Dots based on match format and current score
function renderSeriesDots(containerId, score, format) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let totalDots = 2; // Default for BO3
  const upperFormat = (format || '').toUpperCase();
  if (upperFormat.includes('BO5')) {
    totalDots = 3;
  } else if (upperFormat.includes('BO1')) {
    totalDots = 1;
  } else if (upperFormat.includes('BO7')) {
    totalDots = 4;
  }

  container.innerHTML = '';
  const currentScore = parseInt(score, 10) || 0;

  for (let i = 0; i < totalDots; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i < currentScore ? ' active' : '');
    container.appendChild(dot);
  }
}

function render(state) {
  if (!state) return;

  // Blue Side
  const blueName = document.getElementById('blueName');
  const blueFullName = document.getElementById('blueFullName');
  const blueLogo = document.getElementById('blueLogo');

  if (state.blueTeam) {
    const blueKey = state.blueTeam.toUpperCase();
    const info = TEAMS_INFO[blueKey] || { acronym: blueKey, fullName: blueKey };
    if (blueName) blueName.textContent = info.acronym;
    if (blueFullName) blueFullName.textContent = info.fullName;
    if (blueLogo) {
      blueLogo.src = logoUrl(blueKey);
      blueLogo.alt = blueKey + ' logo';
    }
  }

  // Red Side
  const redName = document.getElementById('redName');
  const redFullName = document.getElementById('redFullName');
  const redLogo = document.getElementById('redLogo');

  if (state.redTeam) {
    const redKey = state.redTeam.toUpperCase();
    const info = TEAMS_INFO[redKey] || { acronym: redKey, fullName: redKey };
    if (redName) redName.textContent = info.acronym;
    if (redFullName) redFullName.textContent = info.fullName;
    if (redLogo) {
      redLogo.src = logoUrl(redKey);
      redLogo.alt = redKey + ' logo';
    }
  }

  // Series score dots
  renderSeriesDots('blueSeriesDots', state.blueScore || 0, state.format);
  renderSeriesDots('redSeriesDots', state.redScore || 0, state.format);
}

// Fallback: if a transparent logo fails to load, try the standard logos path
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.src.includes('logos-transparent')) {
    const teamId = e.target.alt.replace(' logo', '');
    e.target.src = `assets/logos/${teamId}.png`;
  }
}, true);

// SSE Live Sync
const events = new EventSource('/api/events');

events.addEventListener('state', (e) => {
  try {
    render(JSON.parse(e.data));
  } catch (err) {
    console.error('Failed to parse SSE state', err);
  }
});

events.onerror = () => {
  console.warn('SSE connection lost, browser will auto-reconnect');
};

// Initial fetch in case SSE connection is pending
fetch('/api/state')
  .then(r => r.json())
  .then(render)
  .catch((err) => console.error('Initial state fetch error', err));
