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

async function downloadYoutubeAd(rawUrl, adsDir) {
  const url = String(rawUrl || '').trim();
  if (!isValidYoutubeUrl(url)) {
    throw new Error('Please enter a valid YouTube video URL (e.g. https://www.youtube.com/watch?v=...)');
  }

  fs.mkdirSync(adsDir, { recursive: true });

  // 1. Fetch metadata first (id, duration, title)
  const metaRaw = await exec('yt-dlp', [
    '--no-warnings',
    '--no-playlist',
    '--extractor-args', 'youtube:player_client=android,web',
    '--print', '%(id)s\t%(duration)s\t%(title)s',
    url
  ]);

  const parts = metaRaw.split('\t');
  if (parts.length < 3) {
    throw new Error('Could not retrieve video information from YouTube.');
  }

  const id = parts[0].trim();
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
      '--extractor-args', 'youtube:player_client=android,web',
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', outputFile,
      url
    ]);
  }

  // 3. Verify codec / optimize with ffmpeg to ensure H.264 + AAC + faststart for OBS Studio browser source
  try {
    const probe = await exec('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      outputFile
    ]);

    if (probe !== 'h264') {
      const transcodeTmp = path.join(adsDir, `${id}_transcode.mp4`);
      await exec('ffmpeg', [
        '-y',
        '-i', outputFile,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        transcodeTmp
      ]);
      fs.renameSync(transcodeTmp, outputFile);
    }
  } catch (err) {
    console.warn('ffmpeg transcode/faststart check skipped or failed:', err.message);
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

module.exports = { isValidYoutubeUrl, downloadYoutubeAd };
