// Berechnet die Koordinaten verdächtiger Vereine neu (Name → Halle → Ort) und
// schreibt einen Vorher-Nachher-Bericht. clubs.json wird nur mit --apply geändert.
//
//   npm run regeocode [-- --scope=suspect|all] [-- --apply] [-- --out=regeocode-report.json]
//
// scope=suspect (Standard): Vereine, deren geocodedFrom eine Rechtsform ("e.V.") oder leer ist
//   (Folge eines früheren Fehlers in extractCityFromName).
// scope=all: alle Vereine. Hier werden bestehende Koordinaten nur durch einen plausiblen
//   Namenstreffer ersetzt; Hallen-/Ort-Treffer nur bei verdächtigen Vereinen.

import fs from 'fs';
import { geocodeClub, GeocodeSource } from './club-geocoder';
import { distanceKm } from './check-geocoding';
import { extractCityFromName } from './extractor';
import { loadExistingClubs, writeClubs } from './writer';
import { ClubEntry } from './types';

export function isSuspect(club: Pick<ClubEntry, 'geocodedFrom'>): boolean {
  const g = (club.geocodedFrom ?? '').trim();
  return g === '' || /^(e\.?\s?V\.?|V\.?|eV)$/i.test(g);
}

export type RegeocodeAction = 'changed' | 'unchanged' | 'no-result' | 'kept';

export interface RegeocodeResult {
  clubId: number;
  name: string;
  suspect: boolean;
  source: GeocodeSource | null;
  before: { lat: number | null; lng: number | null; geocodedFrom: string | null };
  after: { lat: number; lng: number; geocodedFrom: string | null } | null;
  distanceKm: number | null;
  action: RegeocodeAction;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function regeocode(): Promise<void> {
  const scope = arg('scope', 'suspect');
  const apply = process.argv.includes('--apply');
  const out = arg('out', 'regeocode-report.json');
  const clubs = loadExistingClubs();
  const targets = Array.from(clubs.values()).filter(c => scope === 'all' || isSuspect(c));

  console.log(`${targets.length} von ${clubs.size} Vereinen (scope=${scope}${apply ? ', --apply' : ', nur Bericht'}).`);

  const results: RegeocodeResult[] = [];
  for (let i = 0; i < targets.length; i++) {
    const club = targets[i];
    const suspect = isSuspect(club);
    const before = { lat: club.lat, lng: club.lng, geocodedFrom: club.geocodedFrom };
    const hit = await geocodeClub(club);

    let action: RegeocodeAction = 'no-result';
    let after: RegeocodeResult['after'] = null;
    let dist: number | null = null;

    if (hit) {
      // Bei unverdächtigen Vereinen nur plausible Namenstreffer übernehmen.
      const accept = suspect || hit.source === 'name';
      const newFrom = hit.geocodedFrom ?? (suspect ? extractCityFromName(club.name) : club.geocodedFrom);
      after = { lat: hit.lat, lng: hit.lng, geocodedFrom: newFrom };
      dist = club.lat != null && club.lng != null ? Math.round(distanceKm({ lat: club.lat, lng: club.lng }, hit) * 10) / 10 : null;
      action = !accept ? 'kept' : dist !== null && dist < 0.05 && newFrom === club.geocodedFrom ? 'unchanged' : 'changed';
    }

    results.push({ clubId: club.clubId, name: club.name, suspect, source: hit?.source ?? null, before, after, distanceKm: dist, action });

    if (apply && action === 'changed' && after) {
      club.lat = after.lat;
      club.lng = after.lng;
      club.geocodedFrom = after.geocodedFrom;
    }
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${targets.length} verarbeitet...`);
      fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf-8');
    }
  }

  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf-8');

  const count = (a: RegeocodeAction) => results.filter(r => r.action === a).length;
  const bySource = (s: GeocodeSource) => results.filter(r => r.action === 'changed' && r.source === s).length;
  const summary = [
    `Fertig: ${results.length} Vereine geprüft`,
    `  geändert:   ${count('changed')} (Name: ${bySource('name')}, Halle: ${bySource('hall')}, Ort: ${bySource('city')})`,
    `  unverändert: ${count('unchanged')}`,
    `  beibehalten (unverdächtig, kein Namenstreffer): ${count('kept')}`,
    `  ohne Ergebnis: ${count('no-result')}`,
    apply ? 'clubs.json wurde aktualisiert.' : 'Nur Bericht — clubs.json unverändert (--apply setzen zum Übernehmen).',
    `Bericht: ${out}`
  ].join('\n');
  console.log(summary);

  const biggest = results
    .filter(r => r.action === 'changed' && r.distanceKm !== null)
    .sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))
    .slice(0, 25);
  console.log('\nGrößte Änderungen (Verein | Quelle | alt → neu | km):');
  for (const r of biggest) {
    console.log(`  ${r.name} | ${r.source} | ${r.before.geocodedFrom ?? '-'} → ${r.after?.geocodedFrom ?? '-'} | ${r.distanceKm}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + summary + '\n```\n');

  if (apply) writeClubs(clubs);
}

if (require.main === module) {
  regeocode().catch(err => {
    console.error('Regeocode fehlgeschlagen:', err);
    process.exit(1);
  });
}
