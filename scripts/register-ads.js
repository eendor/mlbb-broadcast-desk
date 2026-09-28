const fs = require('fs');
const Breaks = require('../public/breaks-shared');

const stateFile = 'data/state.json';
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

const mlbbAds = [
  {
    name: 'Sun "Celestial Rebel" | Mecha Suit Skin',
    src: '/assets/ads/2rbWDw76_oU.mp4',
    type: 'video',
    duration: 59,
    fit: 'contain',
    muted: true
  },
  {
    name: 'Chou "Starforger\'s Glory" | 10th Anniversary Skin',
    src: '/assets/ads/5dtjMhqNLBs.mp4',
    type: 'video',
    duration: 64,
    fit: 'contain',
    muted: true
  },
  {
    name: 'Celestial Rising | Official Cinematic',
    src: '/assets/ads/CS2fHNqF7nc.mp4',
    type: 'video',
    duration: 46,
    fit: 'contain',
    muted: true
  },
  {
    name: 'The Aspirants Skins | Angela & Ruby',
    src: '/assets/ads/dgp0CpSnMrU.mp4',
    type: 'video',
    duration: 64,
    fit: 'contain',
    muted: true
  },
  {
    name: 'TheMLabel | Brand Theme Cinematic Trailer',
    src: '/assets/ads/TVD7KbcRvWI.mp4',
    type: 'video',
    duration: 69,
    fit: 'contain',
    muted: true
  }
];

state.breaks = state.breaks || Breaks.defaults();
state.breaks.ads = mlbbAds;
state.breaks.rotation = { running: true, startAt: Date.now(), index: 0 };
Breaks.validate(state.breaks);

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('Successfully registered', mlbbAds.length, 'MLBB ads into state.json');
