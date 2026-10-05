// Baut aus portal/ und den Testdaten ein Pages-ähnliches Verzeichnis und liefert es statisch aus.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const site = path.join(root, '_a11y-site');
const PORT = Number(process.env.A11Y_PORT || 4173);

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(path.join(site, 'data'), { recursive: true });
// portal/data ist lokal ein Symlink auf ../data (Dev-Server); der Testserver legt site/data selbst an
const portalData = path.join(root, 'portal', 'data');
fs.cpSync(path.join(root, 'portal'), site, { recursive: true, filter: src => src !== portalData });
fs.copyFileSync(path.join(__dirname, 'fixtures', 'clubs.json'), path.join(site, 'data', 'clubs.json'));
fs.cpSync(path.join(__dirname, 'fixtures', 'live'), path.join(site, 'data', 'live'), { recursive: true });

// Statische Vereins- und Regionsseiten wie im Pages-Build (crawler/seo.ts)
require('child_process').execFileSync(
  path.join(root, 'node_modules', '.bin', 'tsx'),
  ['crawler/seo.ts', `--site=${site}`, `--clubs=${path.join(__dirname, 'fixtures', 'clubs.json')}`],
  { cwd: root, stdio: 'inherit' }
);

require('child_process').execFileSync(
  path.join(root, 'node_modules', '.bin', 'tsx'),
  ['crawler/ics.ts', `--live=${path.join(site, 'data', 'live')}`, `--out=${path.join(site, 'ics')}`, `--team-urls=${path.join(site, 'data', 'team-url-map.json')}`],
  { cwd: root, stdio: 'inherit' }
);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ics': 'text/calendar; charset=utf-8', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let file = path.join(site, decodeURIComponent(req.url.split('?')[0]));
  if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
  if (!file.startsWith(site)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`a11y-Testseite auf http://localhost:${PORT}`));
