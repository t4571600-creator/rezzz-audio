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
    version: '1.9',
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

  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', outputTemplate,
    '--no-playlist',
    '--js-runtimes', 'node',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=ios,web,mweb,android',
    '--retries', '10',
    '--fragment-retries', '10'
  ];

  if (fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
    console.log('Menggunakan cookies.txt');
  } else {
    console.log('cookies.txt TIDAK DITEMUKAN');
  }

  args.push(url);

  execFile('yt-dlp', args, { timeout: 180000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp error:', error.message);
      console.error(stderr);
      return res.status(500).json({
        error: 'Gagal download',
        detail: error.message + (stderr ? '\n' + stderr : '')
      });
    }

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
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rezzz Audio API running on port ${PORT}`);
  console.log('Cookies status:', fs.existsSync(COOKIES_PATH) ? 'ADA' : 'TIDAK ADA');
});
