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

app.get('/', function (req, res) {
  res.json({ status: 'Rezzz Audio API aktif', version: '1.2' });
});

app.post('/download', function (req, res) {
  var body = req.body || {};
  var url = body.url;

  console.log('DOWNLOAD REQUEST:', url);

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL wajib diisi' });
  }

  url = url.trim();

  var ok = url.indexOf('youtube.com') !== -1
    || url.indexOf('youtu.be') !== -1
    || url.indexOf('tiktok.com') !== -1
    || url.indexOf('soundcloud.com') !== -1
    || url.indexOf('instagram.com') !== -1
    || url.indexOf('twitter.com') !== -1
    || url.indexOf('x.com') !== -1;

  if (!ok) {
    return res.status(400).json({ error: 'Link tidak didukung' });
  }

  var id = uuidv4().slice(0, 8);
  var out = path.join(TEMP, 'rezzz-' + id + '.%(ext)s');

  var
