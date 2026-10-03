// Legt die echten Spielorte (aus dem Branch data-store) an die Spiele der Live-Daten.
//
//   npm run apply-venues -- --dir=_site/data/live --store=data-store [--clubs=data/clubs.json]
//
// Für jede liga/<id>.json entstehen zwei Felder:
//   venues  { "<matchId>": <hallId> }          nur Spiele mit bekannter Halle
//   halls   { "<hallId>": { bezeichnung, strasse, plz, ort, lat, lng } }  nur die dort vorkommenden Hallen
// Koordinaten stammen aus clubs.json (gleiche Spielfeld-ID wie in matchInfo); fehlen sie, entfällt nur die Karte.
import fs from 'fs';
import path from 'path';
import { HallMap, VenueStore, readJson } from './venues';

export interface HallWithCoords { bezeichnung: string; strasse: string | null; plz: string | null; ort: string | null; lat: number | null; lng: number | null }

/** Spielfeld-ID → Koordinaten aus den Hallen der Vereine. */
export function coordsByHallId(clubs: Array<{ halls?: Array<{ dbbSpielfeldId?: number | null; lat?: number | null; lng?: number | null }> }>): Map<number, { lat: number; lng: number }> {
  const map = new Map<number, { lat: number; lng: number }>();
  for (const c of clubs) {
    for (const h of c.halls ?? []) {
      if (h.dbbSpielfeldId && typeof h.lat === 'number' && typeof h.lng === 'number') map.set(h.dbbSpielfeldId, { lat: h.lat, lng: h.lng });
    }
  }
  return map;
}

/** Ergänzt ein Liga-Dokument um venues und halls; gibt die Zahl der Spiele mit Halle zurück. */
export function applyVenuesToDoc(doc: any, store: VenueStore, halls: HallMap, coords: Map<number, { lat: number; lng: number }>): number {
  const venues: Record<string, number> = {};
  const used: Record<string, HallWithCoords> = {};
  for (const m of doc.matches ?? []) {
    const entry = store.matches[String(m?.matchId)];
    if (!entry || entry[0] <= 0) continue;
    const hall = halls[String(entry[0])];
    if (!hall) continue;
    venues[String(m.matchId)] = entry[0];
    if (!used[String(entry[0])]) {
      const c = coords.get(entry[0]);
      used[String(entry[0])] = { ...hall, lat: c?.lat ?? null, lng: c?.lng ?? null };
    }
  }
  if (Object.keys(venues).length > 0) {
    doc.venues = venues;
    doc.halls = used;
  } else {
    delete doc.venues;
    delete doc.halls;
  }
  return Object.keys(venues).length;
}

function arg(name: string, fallback: string): string {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}

function main(): void {
  const dir = arg('dir', '_site/data/live');
  const storeDir = arg('store', 'data-store');
  const clubsFile = arg('clubs', 'data/clubs.json');

  const store = readJson<VenueStore | null>(path.join(storeDir, 'venues.json'), null);
  const halls = readJson<HallMap>(path.join(storeDir, 'halls.json'), {});
  if (!store) { console.log(`Kein Speicher in ${storeDir} — Live-Daten bleiben ohne Spielorte.`); return; }

  const coords = coordsByHallId(readJson<any[]>(clubsFile, []));
  const ligaDir = path.join(dir, 'liga');
  let docs = 0, matches = 0;
  for (const f of fs.existsSync(ligaDir) ? fs.readdirSync(ligaDir) : []) {
    if (!f.endsWith('.json')) continue;
    const file = path.join(ligaDir, f);
    const doc = readJson<any>(file, null);
    if (!doc) continue;
    const n = applyVenuesToDoc(doc, store, halls, coords);
    fs.writeFileSync(file, JSON.stringify(doc), 'utf-8');
    if (n > 0) docs++;
    matches += n;
  }
  console.log(`Spielorte angelegt: ${matches} Spiele in ${docs} Ligen (${coords.size} Hallen mit Koordinaten).`);
}

if (require.main === module) main();
