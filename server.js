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
    version: '2.0',
    cookies: fs.existsSync(COOKIES_PATH) ? 'ada' : 'tidak ada'
  });
});

app.post('/download', (req, res) => {
  const body = req.body || {};
  let url = body.url;

  console.log('DOWNLOAD REQUEST:', url);

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL wajib diisi' });
  }

  url = url.trim();

  // Bersihkan parameter tracking YouTube (si=...)
  try {
    if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1].split(/[?&#]/)[0];
      url = 'https://www.youtube.com/watch?v=' + id;
    } else if (url.includes('youtube.com') || url.includes('youtube-nocookie.com')) {
      const u = new URL(url);
      const v = u.searchParams.get('v');
      if (v) url = 'https://www.youtube.com/watch?v=' + v;
    }
  } catch (_) {}

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

  // Args yang lebih stabil (hindari "format not available" + bot check)
  const args = [
    '-f', 'ba/bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', outputTemplate,
    '--no-playlist',
    '--no-warnings',
    '--retries', '10',
    '--fragment-retries', '10',
    // android + web lebih stabil daripada ios/mweb
    '--extractor-args', 'youtube:player_client=android,web',
  ];

  // js-runtimes opsional — hanya jika node tersedia
  try {
    require('child_process').execSync('node -v', { stdio: 'ignore' });
    args.push('--js-runtimes', 'node');
  } catch (_) {}

  if (fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
    console.log('Menggunakan cookies.txt');
  } else {
    console.log('cookies.txt TIDAK DITEMUKAN');
  }

  args.push(url);

  console.log('yt-dlp args:', args.join(' '));

  execFile('yt-dlp', args, { timeout: 180000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp error:', error.message);
      console.error(stderr);

      // Fallback 1x: coba tanpa -f (biarkan yt-dlp pilih sendiri)
      const fallbackArgs = args.filter((a, i) => {
        // buang -f dan value-nya
        if (a === '-f') return false;
        if (args[i - 1] === '-f') return false;
        return true;
      });

      console.log('Retry fallback args:', fallbackArgs.join(' '));

      return execFile('yt-dlp', fallbackArgs, { timeout: 180000 }, (err2, stdout2, stderr2) => {
        if (err2) {
          console.error('yt-dlp fallback error:', err2.message);
          console.error(stderr2);
          return res.status(500).json({
            error: 'Gagal download',
            detail: err2.message + (stderr2 ? '\n' + stderr2 : '')
          });
        }
        sendFile(res, id);
      });
    }

    sendFile(res, id);
  });
});

function sendFile(res, id) {
  const files = fs.readdirSync(TEMP).filter(f => f.startsWith(`rezzz-${id}`));

  if (files.length === 0) {
    return res.status(500).json({ error: 'File tidak ditemukan setelah download' });
  }

  const filePath = path.join(TEMP, files[0]);
  const fileName = files[0];

  res.download(filePath, fileName, (err) => {
    fs.unlink(filePath, () => {});
    if (err) {
      console.error('Download response error:', err.message);
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rezzz Audio API running on port ${PORT}`);
  console.log('Cookies status:', fs.existsSync(COOKIES_PATH) ? 'ADA' : 'TIDAK ADA');
});
