const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TEMP_DIR = '/tmp';

// Bersihkan file lama setiap 10 menit
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
      if (file.startsWith('rezzz-')) {
        const filePath = path.join(TEMP_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 10 * 60 * 1000) {
          fs.unlinkSync(filePath);
        }
      }
    });
  } catch (e) {}
}, 10 * 60 * 1000);

app.get('/', (req, res) => {
  res.json({ status: 'Rezzz Audio API aktif', version: '1.0' });
});

app.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL wajib diisi' });
  }

  // Validasi sederhana
  const allowed = ['youtube.com', 'youtu.be', 'tiktok.com', 'soundcloud.com', 'spotify.com'];
  const isAllowed = allowed.some(domain => url.includes(domain));
  if (!isAllowed) {
    return res.status(400).json({ error: 'Link tidak didukung. Gunakan YouTube, TikTok, atau SoundCloud.' });
  }

  const id = uuidv4().slice(0, 8);
  const outputTemplate = path.join(TEMP_DIR, `rezzz-${id}.%(ext)s`);

  const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "\( {outputTemplate}" --no-playlist --max-filesize 15M " \){url}"`;

  exec(cmd, { timeout: 90000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr);
      return res.status(500).json({ 
        error: 'Gagal mengambil audio. Coba link lain atau coba lagi nanti.',
        detail: stderr.slice(0, 200)
      });
    }

    // Cari file hasil download
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(`rezzz-${id}`));
    if (files.length === 0) {
      return res.status(500).json({ error: 'File audio tidak ditemukan' });
    }

    const filePath = path.join(TEMP_DIR, files[0]);
    const fileName = files[0];

    res.download(filePath, fileName, (err) => {
      // Hapus file setelah dikirim
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }, 5000);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Rezzz Audio API running on port ${PORT}`);
});
