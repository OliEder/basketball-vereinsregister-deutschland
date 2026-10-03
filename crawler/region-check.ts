// Prüft die vorhandenen Koordinaten gegen Bezirk bzw. Landesverband. Arbeitet offline, ändert nichts.
//
//   npm run region-check [-- --out=region-check.json]
//
// Gemeldet werden Vereine, deren Koordinate weit außerhalb ihrer Region liegt.
import fs from 'fs';
import { loadExistingClubs } from './writer';
import { RegionIndex } from './region';
import { findJunkClusters, isSuspect } from './regeocode';

function main(): void {
  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'region-check.json';
  const clubs = Array.from(loadExistingClubs().values());
  const junk = findJunkClusters(clubs);
  const suspect = (c: (typeof clubs)[number]) => isSuspect(c) || (c.lat != null && c.lng != null && junk.has(`${c.lat},${c.lng}`));
  const index = new RegionIndex(clubs, c => !suspect(c));

  const rows = [];
  let checked = 0;
  for (const c of clubs) {
    if (c.lat == null || c.lng == null) continue;
    const r = index.check(c, { lat: c.lat, lng: c.lng });
    if (r.level === 'none') continue;
    checked++;
    if (!r.ok) rows.push({ clubId: c.clubId, name: c.name, geocodedFrom: c.geocodedFrom, suspect: suspect(c), ...r });
  }
  rows.sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0));
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), 'utf-8');

  const trusted = rows.filter(r => !r.suspect);
  console.log(`${checked} Vereine mit bekannter Region geprüft, ${rows.length} außerhalb (davon ${trusted.length} mit bisher unverdächtiger Koordinate).`);
  console.log('Bericht:', out);
  for (const r of trusted.slice(0, 25)) console.log(`  ${r.name} | ${r.geocodedFrom} | ${r.region} | ${r.distanceKm} km (Limit ${r.limitKm})`);
}

if (require.main === module) main();
