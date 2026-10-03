// Kontrolliert die Koordinaten ALLER Vereine über die Namenssuche (Nominatim).
// Es werden keine Daten in clubs.json verändert; das Ergebnis ist ein Bericht.
//
//   npm run check-geocoding [-- --out=geocoding-check.json] [-- --threshold=5]
//
// threshold = Abweichung in km, ab der ein Verein als "deviation" gilt (Standard 5).

import fs from 'fs';
import { geocodeDetailed } from './geocoder';
import { loadExistingClubs } from './writer';

export type CheckStatus = 'match' | 'deviation' | 'no-result' | 'no-current';

export interface CheckResult {
  clubId: number;
  name: string;
  verbandName?: string;
  current: { lat: number | null; lng: number | null; geocodedFrom: string | null };
  byName: { lat: number; lng: number; displayName?: string } | null;
  distanceKm: number | null;
  status: CheckStatus;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function classify(
  current: { lat: number | null; lng: number | null },
  byName: { lat: number; lng: number } | null,
  thresholdKm: number
): { status: CheckStatus; distanceKm: number | null } {
  if (!byName) return { status: 'no-result', distanceKm: null };
  if (current.lat == null || current.lng == null) return { status: 'no-current', distanceKm: null };
  const d = distanceKm({ lat: current.lat, lng: current.lng }, byName);
  return { status: d > thresholdKm ? 'deviation' : 'match', distanceKm: Math.round(d * 10) / 10 };
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function check(): Promise<void> {
  const out = arg('out', 'geocoding-check.json');
  const threshold = parseFloat(arg('threshold', '5'));
  const clubs = Array.from(loadExistingClubs().values());
  const results: CheckResult[] = [];

  console.log(`${clubs.length} Vereine werden per Namenssuche kontrolliert (Schwelle ${threshold} km)...`);

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    const hit = await geocodeDetailed(club.name.replace(/\be\.?\s?V\.?$/i, '').trim());
    const { status, distanceKm: dist } = classify(club, hit, threshold);
    results.push({
      clubId: club.clubId,
      name: club.name,
      verbandName: club.verbandName,
      current: { lat: club.lat, lng: club.lng, geocodedFrom: club.geocodedFrom },
      byName: hit,
      distanceKm: dist,
      status
    });
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${clubs.length} kontrolliert...`);
      fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf-8');
    }
  }

  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf-8');

  const count = (s: CheckStatus) => results.filter(r => r.status === s).length;
  const summary = [
    `Kontrolle abgeschlossen: ${results.length} Vereine`,
    `  match      (<= ${threshold} km): ${count('match')}`,
    `  deviation  (> ${threshold} km):  ${count('deviation')}`,
    `  no-result  (Name nicht gefunden): ${count('no-result')}`,
    `  no-current (bisher ohne Koordinaten, Name gefunden): ${count('no-current')}`,
    `Bericht: ${out}`
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + summary + '\n```\n');
  }
}

if (require.main === module) {
  check().catch(err => {
    console.error('Kontrolle fehlgeschlagen:', err);
    process.exit(1);
  });
}
