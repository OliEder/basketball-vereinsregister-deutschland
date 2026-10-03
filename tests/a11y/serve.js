// Baut aus portal/ und den Testdaten ein Pages-ähnliches Verzeichnis und liefert es statisch aus.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const site = path.join(root, '_a11y-site');
const PORT = Number(process.env.A11Y_PORT || 4173);

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(path.join(site, 'data'), { recursive: true });
fs.cpSync(path.join(root, 'portal'), site, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'fixtures', 'clubs.json'), path.join(site, 'data', 'clubs.json'));
fs.cpSync(path.join(__dirname, 'fixtures', 'live'), path.join(site, 'data', 'live'), { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const file = path.join(site, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(site)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`a11y-Testseite auf http://localhost:${PORT}`));
