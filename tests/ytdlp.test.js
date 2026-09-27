const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidYoutubeUrl } = require('../lib/ytdlp-ads');

test('isValidYoutubeUrl accepts valid YouTube video formats', () => {
  assert.equal(isValidYoutubeUrl('https://www.youtube.com/watch?v=CS2fHNqF7nc'), true);
  assert.equal(isValidYoutubeUrl('http://www.youtube.com/watch?v=2rbWDw76_oU&t=10s'), true);
  assert.equal(isValidYoutubeUrl('https://youtu.be/5dtjMhqNLBs'), true);
  assert.equal(isValidYoutubeUrl('https://www.youtube.com/shorts/dgp0CpSnMrU'), true);
});

test('isValidYoutubeUrl rejects invalid URLs and non-strings', () => {
  assert.equal(isValidYoutubeUrl(''), false);
  assert.equal(isValidYoutubeUrl(null), false);
  assert.equal(isValidYoutubeUrl('https://example.com/video.mp4'), false);
  assert.equal(isValidYoutubeUrl('javascript:alert(1)'), false);
});
