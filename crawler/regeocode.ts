// Berechnet die Koordinaten verdächtiger Vereine neu (Name → Heimhalle → Ort) und
// schreibt einen Vorher-Nachher-Bericht. clubs.json wird nur mit --apply geändert.
//
//   npm run regeocode [-- --scope=suspect|all] [-- --apply] [-- --out=regeocode-report.json]
//
// scope=suspect (Standard): Vereine, deren geocodedFrom eine Rechtsform ("e.V.") oder leer ist
//   oder deren Koordinate in einer "Müll-Gruppe" liegt (von mindestens 4 Vereinen mit
//   verschiedenen Ortsbezeichnungen geteilt, z. B. ein Standardpunkt).
// scope=all: alle Vereine. Hier werden bestehende Koordinaten nur durch einen plausiblen
//   Namenstreffer ersetzt.
//
// Übernommen wird ein Ergebnis, wenn es sicher ist (Namenstreffer, eindeutige Heimhalle) oder die
// alte Koordinate ohnehin unbrauchbar ist. Unsichere Ergebnisse bei brauchbarer alter Koordinate
// erscheinen im Bericht als "review" und werden nicht übernommen.

import fs from 'fs';
import { geocodeClub, GeocodeSource, Confidence } from './club-geocoder';
import { distanceKm } from './geo';
import { loadExistingClubs, writeClubs } from './writer';
import { ClubEntry } from './types';

export function isSuspect(club: Pick<ClubEntry, 'geocodedFrom'>): boolean {
  const g = (club.geocodedFrom ?? '').trim();
  return g === '' || /^(e\.?\s?V\.?|V\.?|eV)$/i.test(g);
}

const coordKey = (c: { lat: number | null; lng: number | null }) => `${c.lat},${c.lng}`;

/**
 * Koordinaten, die sich mindestens `minClubs` Vereine mit mindestens 3 verschiedenen
 * Ortsbezeichnungen teilen. Ein Stadtzentrum, an dem viele Vereine derselben Stadt hängen,
 * zählt nicht dazu.
 */
export function findJunkClusters(
  clubs: Array<Pick<ClubEntry, 'lat' | 'lng' | 'geocodedFrom'>>,
  minClubs = 4
): Set<string> {
  const groups = new Map<string, Array<string>>();
  for (const c of clubs) {
    if (c.lat == null || c.lng == null) continue;
    const k = coordKey(c);
    groups.set(k, [...(groups.get(k) ?? []), (c.geocodedFrom ?? '').toLowerCase()]);
  }
  const junk = new Set<string>();
  for (const [k, labels] of groups) {
    if (labels.length >= minClubs && new Set(labels).size >= 3) junk.add(k);
  }
  return junk;
}

export type RegeocodeAction = 'changed' | 'unchanged' | 'review' | 'kept' | 'no-result';

export interface RegeocodeResult {
  clubId: number;
  name: string;
  suspect: boolean;
  source: GeocodeSource | null;
  confidence: Confidence | null;
  nameHitRejected: boolean;
  before: { lat: number | null; lng: number | null; geocodedFrom: string | null };
  after: { lat: number; lng: number; geocodedFrom: string | null } | null;
  distanceKm: number | null;
  action: RegeocodeAction;
}

export function decide(
  hit: { source: GeocodeSource; confidence: Confidence } | null,
  suspect: boolean,
  oldUnusable: boolean,
  unchanged: boolean
): RegeocodeAction {
  if (!hit) return 'no-result';
  if (!suspect && hit.source !== 'name') return 'kept';
  if (hit.confidence === 'low' && !oldUnusable) return 'review';
  return unchanged ? 'unchanged' : 'changed';
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
  const junkClusters = findJunkClusters(Array.from(clubs.values()));
  const inJunkCluster = (c: ClubEntry) => c.lat != null && c.lng != null && junkClusters.has(coordKey(c));
  const suspectOf = (c: ClubEntry) => isSuspect(c) || inJunkCluster(c);
  const targets = Array.from(clubs.values()).filter(c => scope === 'all' || suspectOf(c));

  console.log(`${targets.length} von ${clubs.size} Vereinen (scope=${scope}${apply ? ', --apply' : ', nur Bericht'}; ${junkClusters.size} Müll-Gruppen).`);

  const results: RegeocodeResult[] = [];
  for (let i = 0; i < targets.length; i++) {
    const club = targets[i];
    const suspect = suspectOf(club);
    const oldUnusable = club.lat == null || club.lng == null || inJunkCluster(club);
    const before = { lat: club.lat, lng: club.lng, geocodedFrom: club.geocodedFrom };
    const hit = await geocodeClub(club);

    let after: RegeocodeResult['after'] = null;
    let dist: number | null = null;
    let unchanged = false;

    if (hit) {
      after = { lat: hit.lat, lng: hit.lng, geocodedFrom: hit.geocodedFrom };
      dist = club.lat != null && club.lng != null ? Math.round(distanceKm({ lat: club.lat, lng: club.lng }, hit) * 10) / 10 : null;
      unchanged = dist !== null && dist < 0.05 && after.geocodedFrom === club.geocodedFrom;
    }
    const action = decide(hit, suspect, oldUnusable, unchanged);

    results.push({ clubId: club.clubId, name: club.name, suspect, source: hit?.source ?? null, confidence: hit?.confidence ?? null, nameHitRejected: !!hit?.nameHitRejected, before, after, distanceKm: dist, action });

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
    `  geändert:    ${count('changed')} (Name: ${bySource('name')}, Halle: ${bySource('hall')}, Ort: ${bySource('city')})`,
    `  unverändert: ${count('unchanged')}`,
    `  Namenstreffer wegen Widerspruch zur Heimhalle verworfen: ${results.filter(r => r.nameHitRejected).length}`,
    `  zu prüfen:   ${count('review')} (unsicheres Ergebnis, alte Koordinate brauchbar)`,
    `  beibehalten: ${count('kept')} (unverdächtig, kein Namenstreffer)`,
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
