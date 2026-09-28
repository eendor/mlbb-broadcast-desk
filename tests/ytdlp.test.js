const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidYoutubeUrl, isValidFacebookReelUrl, isValidVideoUrl } = require('../lib/ytdlp-ads');

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

test('Facebook Reel links are accepted without allowing arbitrary Facebook URLs', () => {
  assert.equal(isValidFacebookReelUrl('https://www.facebook.com/reel/1132907696359284'), true);
  assert.equal(isValidVideoUrl('https://www.facebook.com/reel/1132907696359284'), true);
  assert.equal(isValidFacebookReelUrl('https://m.facebook.com/reel/1132907696359284/'), true);
  assert.equal(isValidFacebookReelUrl('https://facebook.com/watch/?v=123'), false);
  assert.equal(isValidFacebookReelUrl('https://facebook.com.example.org/reel/1132907696359284'), false);
  assert.equal(isValidFacebookReelUrl('http://www.facebook.com/reel/1132907696359284'), false);
});
