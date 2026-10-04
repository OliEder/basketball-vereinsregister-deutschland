// Schlanker Hallenindex für die Team-Seiten: je Club-ID die Heimhalle (siehe chooseHomeHall).
// Die Team-Seite zeigt damit Ort und Karte des nächsten Spiels, ohne die große clubs.json zu laden.
//
//   npx ts-node crawler/hall-index.ts [--out=_site/data/live/hall-index.json]
import fs from 'fs';
import path from 'path';
import { chooseHomeHall } from './club-geocoder';
import { loadExistingClubs } from './writer';
import { ClubEntry } from './types';

export interface HallIndexEntry {
  id: number | null;           // Spielfeld-ID, für den Link auf die Hallenseite
  bezeichnung: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number | null;
  lng: number | null;
}

export function buildHallIndex(clubs: ClubEntry[]): Record<string, HallIndexEntry> {
  const index: Record<string, HallIndexEntry> = {};
  for (const club of clubs) {
    const home = chooseHomeHall(club);
    if (!home) continue;
    const h = home.hall;
    index[String(club.clubId)] = {
      id: h.dbbSpielfeldId ?? null,
      bezeichnung: h.bezeichnung,
      strasse: h.strasse ?? null,
      plz: h.plz ?? null,
      ort: h.ort ?? null,
      lat: typeof h.lat === 'number' ? h.lat : null,
      lng: typeof h.lng === 'number' ? h.lng : null
    };
  }
  return index;
}

function main(): void {
  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? '_site/data/live/hall-index.json';
  const index = buildHallIndex(Array.from(loadExistingClubs().values()));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(index), 'utf-8');
  console.log(`Hallenindex: ${Object.keys(index).length} Vereine → ${out}`);
}

if (require.main === module) main();
