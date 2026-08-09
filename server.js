const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const TEMP = '/tmp';
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');

app.get('/', (req, res) => {
  res.json({
    status: 'Rezzz Audio API aktif',
    version: '2.1',
    cookies: fs.existsSync(COOKIES_PATH) ? 'ada' : 'tidak ada'
  });
});

function cleanYoutubeUrl(raw) {
  let url = (raw || '').trim();
  try {
    if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1].split(/[?&#]/)[0];
      return 'https://www.youtube.com/watch?v=' + id;
    }
    if (url.includes('youtube.com') || url.includes('youtube-nocookie.com')) {
      const u = new URL(url);
      const v = u.searchParams.get('v');
      if (v) return 'https://www.youtube.com/watch?v=' + v;
    }
  } catch (_) {}
  return url.split('&')[0];
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log('yt-dlp:', args.join(' '));
    execFile('yt-dlp', args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(error.message + (stderr ? '\n' + stderr : ''));
        err.stderr = stderr || '';
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function findOutput(id) {
  try {
    return fs.readdirSync(TEMP).filter(f => f.startsWith(`rezzz-${id}`));
  } catch (_) {
    return [];
  }
}

function buildStrategies(url, outputTemplate) {
  const base = [
    '-o', outputTemplate,
    '--no-playlist',
    '--no-warnings',
    '--retries', '10',
    '--fragment-retries', '10',
  ];

  if (fs.existsSync(COOKIES_PATH)) {
    base.push('--cookies', COOKIES_PATH);
  }

  return [
    [
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--extractor-args', 'youtube:player_client=android',
      ...base, url
    ],
    [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--extractor-args', 'youtube:player_client=android',
      ...base, url
    ],
    [
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--extractor-args', 'youtube:player_client=web',
      ...base, url
    ],
    [
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
      '--extractor-args', 'youtube:player_client=android,web',
      ...base, url
    ],
    [
      '-f', 'best',
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      ...base, url
    ],
    [
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--extractor-args', 'youtube:player_client=android',
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
      '--retries', '5',
      url
    ],
  ];
}

function convertToMp3IfNeeded(id) {
  return new Promise((resolve) => {
    const files = findOutput(id);
    if (!files.length) return resolve(null);

    const filePath = path.join(TEMP, files[0]);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.mp3') return resolve(filePath);

    const mp3Path = path.join(TEMP, `rezzz-${id}.mp3`);
    execFile(
      'ffmpeg',
      ['-y', '-i', filePath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', mp3Path],
      { timeout: 120000 },
      (err) => {
        try { fs.unlinkSync(filePath); } catch (_) {}
        if (err) {
          console.error('ffmpeg convert error:', err.message);
          return resolve(null);
        }
        resolve(mp3Path);
      }
    );
  });
}

app.post('/download', async (req, res) => {
  const body = req.body || {};
  let url = body.url;

  console.log('DOWNLOAD REQUEST:', url);

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL wajib diisi' });
  }

  url = cleanYoutubeUrl(url);

  const supported =
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('tiktok.com') ||
    url.includes('soundcloud.com') ||
    url.includes('instagram.com') ||
    url.includes('twitter.com') ||
    url.includes('x.com');

  if (!supported) {
    return res.status(400).json({ error: 'Link tidak didukung' });
  }

  const id = uuidv4().slice(0, 8);
  const outputTemplate = path.join(TEMP, `rezzz-${id}.%(ext)s`);
  const strategies = buildStrategies(url, outputTemplate);

  let lastError = null;

  for (let i = 0; i < strategies.length; i++) {
    findOutput(id).forEach(f => {
      try { fs.unlinkSync(path.join(TEMP, f)); } catch (_) {}
    });

    try {
      console.log(`Strategy ${i + 1}/${strategies.length}`);
      await runYtDlp(strategies[i]);

      let files = findOutput(id);
      if (!files.length) {
        throw new Error('File tidak ditemukan setelah download');
      }

      const finalPath = await convertToMp3IfNeeded(id);
      if (!finalPath || !fs.existsSync(finalPath)) {
        const fallback = path.join(TEMP, files[0]);
        return res.download(fallback, files[0], (err) => {
          fs.unlink(fallback, () => {});
          if (err) console.error('Download response error:', err.message);
        });
      }

      const outName = path.basename(finalPath);
      return res.download(finalPath, outName, (err) => {
        fs.unlink(finalPath, () => {});
        if (err) console.error('Download response error:', err.message);
      });
    } catch (e) {
      lastError = e;
      console.error(`Strategy ${i + 1} gagal:`, String(e.message).slice(0, 400));
    }
  }

  return res.status(500).json({
    error: 'Gagal download',
    detail: lastError ? lastError.message : 'Semua strategi gagal'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rezzz Audio API running on port ${PORT}`);
  console.log('Cookies status:', fs.existsSync(COOKIES_PATH) ? 'ADA' : 'TIDAK ADA');
});
