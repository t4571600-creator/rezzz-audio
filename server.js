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
    version: '1.8',
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
    '--audio-quality', '
