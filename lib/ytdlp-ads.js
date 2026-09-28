const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function isValidYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(url.trim());
}

function isValidFacebookReelUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  try {
    const value=rawUrl.trim();
    const url = new URL(/^https:\/\//i.test(value) ? value : 'https://' + value);
    return ['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname.toLowerCase())
      && /^\/reel\/\d+\/?$/.test(url.pathname);
  } catch { return false; }
}

function isValidVideoUrl(url) {
  return isValidYoutubeUrl(url) || isValidFacebookReelUrl(url);
}

async function downloadYoutubeAd(rawUrl, adsDir) {
  const url = String(rawUrl || '').trim();
  const youtube=isValidYoutubeUrl(url);
  if (!youtube && !isValidFacebookReelUrl(url)) {
    throw new Error('Enter a valid YouTube video or Facebook Reel URL.');
  }

  fs.mkdirSync(adsDir, { recursive: true });
  const extractorArgs=youtube?['--extractor-args','youtube:player_client=android,web']:[];

  // 1. Fetch metadata first (id, duration, title)
  const metaRaw = await exec('yt-dlp', [
    '--no-warnings',
    '--no-playlist',
    ...extractorArgs,
    '--print', '%(id)s\t%(duration)s\t%(title)s',
    url
  ]);

  const parts = metaRaw.split('\t');
  if (parts.length < 3) {
    throw new Error('Could not retrieve video information from YouTube.');
  }

  const id = (youtube?'yt':'fb')+'_'+parts[0].trim().replace(/[^a-zA-Z0-9_-]/g,'_');
  const rawDuration = parseFloat(parts[1]) || 30;
  let title = parts.slice(2).join('\t').trim();
  if (title.length > 95) title = title.slice(0, 92) + '...';

  const outputFile = path.join(adsDir, `${id}.mp4`);
  const relativeSrc = `/assets/commercials/${id}.mp4`;

  // 2. Download 1080p MP4 if not already present
  if (!fs.existsSync(outputFile)) {
    await exec('yt-dlp', [
      '--no-warnings',
      '--no-playlist',
      ...extractorArgs,
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', outputFile,
      url
    ]);
  }

  // 3. Put MP4 metadata at the front so OBS can start playback without downloading the entire clip.
  try {
    const probe = await exec('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      outputFile
    ]);
    const transcodeTmp = path.join(adsDir, id + '_faststart.mp4');
    const videoArgs = probe === 'h264'
      ? ['-c:v', 'copy', '-c:a', 'copy']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k'];
    await exec('ffmpeg', [
      '-y', '-i', outputFile, ...videoArgs,
      '-movflags', '+faststart', transcodeTmp
    ]);
    fs.renameSync(transcodeTmp, outputFile);
  } catch (err) {
    console.warn('ffmpeg MP4 faststart optimization skipped or failed:', err.message);
  }

  const duration = Math.min(3600, Math.max(2, Math.round(rawDuration)));

  return {
    name: title,
    src: relativeSrc,
    type: 'video',
    duration,
    fit: 'fill',
    muted: true
  };
}

module.exports = { isValidYoutubeUrl, isValidFacebookReelUrl, isValidVideoUrl, downloadYoutubeAd };
