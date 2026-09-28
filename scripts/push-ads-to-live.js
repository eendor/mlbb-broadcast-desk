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

(async () => {
  try {
    const r = await fetch('http://127.0.0.1:3210/api/state');
    const s = await r.json();
    const nextBreaks = {
      ...s.breaks,
      ads: mlbbAds,
      rotation: { running: true, startAt: Date.now(), index: 0 }
    };
    const postRes = await fetch('http://127.0.0.1:3210/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ breaks: nextBreaks })
    });
    const updated = await postRes.json();
    console.log('Successfully committed to live server! Total ads:', updated.breaks.ads.length);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
