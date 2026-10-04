// Koordinaten der Hallen: geokodiert die Hallenadressen aus clubs.json und aus den Spielorten (matchInfo) schrittweise
// und legt sie im Branch "data-store" ab (hall-coords.json). Hallenseiten, Teaser und Kalender nutzen sie.
//
//   npx ts-node crawler/geocode-venues.ts --store=data-store [--clubs=data/clubs.json] [--budget-min=25] [--max=0]
//
// Vorgehen je Halle (Suchtexte siehe queriesFor): "Straße, PLZ Ort" und "Straße, PLZ" (Genauigkeit "adresse"), dann
// "PLZ Ort" und "PLZ" (Genauigkeit "ort", nur ungefähr). Die Suche nur mit PLZ ist nötig, wenn der Ort im Register ein Kürzel
// oder einen Ortsteil trägt ("HD-Boxberg", "Essen - Kupferdreh", "Kirchheim/Teck").
// Ein Treffer gilt nur, wenn er plausibel liegt: höchstens ANCHOR_KM von einem Verein entfernt, der die Halle meldet;
// ohne solchen Verein muss der von Nominatim gefundene Ort zum Hallenort passen. Fehlschläge werden nach RETRY_DAYS erneut
// versucht, geänderte Adressen sofort.
import fs from 'fs';
import path from 'path';
import { geocodeDetailed, GeocodeHit } from './geocoder';
import { distanceKm } from './geo';

export const ANCHOR_KM = 40;
export const RETRY_DAYS = 30;
/** Erhöhen, wenn die Suchtexte besser werden: Fehlschläge und ungefähre Treffer werden dann einmal neu versucht. */
export const QUERY_VERSION = 2;

export interface HallAddress { id: string; bezeichnung?: string; strasse?: string | null; plz?: string | null; ort?: string | null }
export type Precision = 'adresse' | 'ort';
export interface CoordEntry { lat: number; lng: number; precision: Precision; q: string; checked: string; v?: number }
export interface HallCoords { v: 1; coords: Record<string, CoordEntry>; failed: Record<string, { q: string; checked: string; v?: number }> }

export const emptyCoords = (): HallCoords => ({ v: 1, coords: {}, failed: {} });

/** "Kurfürstenstr. 25" → "Kurfürstenstraße 25"; Zusätze in Klammern entfallen (Nominatim findet sie nicht). */
export function normalizeStreet(s: string): string {
  return s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(\p{L})str\.(?=\s|$|\d)/giu, '$1straße')
    .replace(/\bStr\.(?=\s|$)/g, 'Straße')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Die Suchtexte einer Halle, genauester zuerst; leer, wenn die Adresse nicht reicht. */
export function queriesFor(h: HallAddress): Array<{ q: string; precision: Precision }> {
  const ort = (h.ort ?? '').replace(/\s+/g, ' ').trim();
  if (!ort) return [];
  const plz = (h.plz ?? '').trim();
  const place = [plz, ort].filter(Boolean).join(' ');
  const out: Array<{ q: string; precision: Precision }> = [];
  const add = (q: string, precision: Precision): void => { if (!out.some(x => x.q === q)) out.push({ q, precision }); };
  const street = h.strasse ? normalizeStreet(h.strasse) : '';
  if (street && /\p{L}/u.test(street)) {
    add(`${street}, ${place}`, 'adresse');
    if (plz) add(`${street}, ${plz}`, 'adresse');      // der Ort im Register trägt oft ein Kürzel oder einen Ortsteil
  }
  add(place, 'ort');
  if (plz) add(plz, 'ort');
  return out;
}

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();

/** Passt der Treffer? Mit Ankern (Vereine der Halle): nah genug an einem; ohne: Ort muss übereinstimmen. */
export function plausible(hit: { lat: number; lng: number; city?: string }, hallOrt: string | null | undefined, anchors: Array<{ lat: number; lng: number }>): boolean {
  if (anchors.length) return anchors.some(a => distanceKm(a, hit) <= ANCHOR_KM);
  if (!hit.city || !hallOrt) return false;
  const a = norm(hit.city), b = norm(hallOrt.split(/\s[-–¿]\s|\(/)[0]);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

const hasAddressQuery = (h: HallAddress): boolean => queriesFor(h).some(x => x.precision === 'adresse');

/** Welche Hallen sind dran: ohne Koordinate, mit geänderter Adresse oder mit altem Fehlschlag; Hallen mit mehr Vereinen zuerst. */
export function pending(halls: HallAddress[], store: HallCoords, today: string, weight: (id: string) => number = () => 0): HallAddress[] {
  return halls
    .filter(h => queriesFor(h).length > 0)
    .filter(h => {
      const qs = queriesFor(h).map(x => x.q);
      const done = store.coords[h.id];
      if (done) {
        if (!qs.includes(done.q)) return true;               // die Adresse hat sich geändert
        return done.precision === 'ort' && done.v !== QUERY_VERSION && hasAddressQuery(h);   // ungefähren Treffer einmal verbessern
      }
      const failed = store.failed[h.id];
      return !failed || failed.q !== qs[0] || failed.v !== QUERY_VERSION || daysBetween(failed.checked, today) >= RETRY_DAYS;
    })
    .sort((a, b) => weight(b.id) - weight(a.id) || Number(a.id) - Number(b.id));
}

export type GeocodeFn = (q: string) => Promise<GeocodeHit | null>;

export interface RunOptions {
  geocode: GeocodeFn;
  today: string;
  anchorsOf: (id: string) => Array<{ lat: number; lng: number }>;
  deadline?: number;     // ms seit Epoche, 0 = unbegrenzt
  max?: number;          // höchste Zahl Hallen, 0 = unbegrenzt
  now?: () => number;
}

export interface RunReport { tried: number; found: number; failed: number; improved: number; stoppedByBudget: boolean }

export async function geocodeHalls(todo: HallAddress[], store: HallCoords, o: RunOptions): Promise<RunReport> {
  const now = o.now ?? Date.now;
  const report: RunReport = { tried: 0, found: 0, failed: 0, improved: 0, stoppedByBudget: false };
  for (const h of todo) {
    if (o.max && report.tried >= o.max) break;
    if (o.deadline && now() >= o.deadline) { report.stoppedByBudget = true; break; }
    report.tried++;
    const all = queriesFor(h);
    const existing = store.coords[h.id];
    // ungefähre Koordinate vorhanden und Adresse unverändert: nur noch die Straßensuche versuchen, die Koordinate bleibt sonst
    const upgradeOnly = !!existing && existing.precision === 'ort' && all.some(x => x.q === existing.q);
    const queries = upgradeOnly ? all.filter(x => x.precision === 'adresse') : all;
    const anchors = o.anchorsOf(h.id);
    let hit: { lat: number; lng: number; precision: Precision; q: string } | null = null;
    for (const { q, precision } of queries) {
      const r = await o.geocode(q);
      if (r && plausible(r, h.ort, anchors)) { hit = { lat: r.lat, lng: r.lng, precision, q }; break; }
    }
    if (hit) {
      store.coords[h.id] = { lat: Math.round(hit.lat * 1e6) / 1e6, lng: Math.round(hit.lng * 1e6) / 1e6, precision: hit.precision, q: hit.q, checked: o.today, v: QUERY_VERSION };
      delete store.failed[h.id];
      if (upgradeOnly) report.improved++; else report.found++;
    } else if (upgradeOnly) {
      existing!.v = QUERY_VERSION;                            // bleibt ungefähr, wird nicht erneut versucht
    } else {
      store.failed[h.id] = { q: all[0].q, checked: o.today, v: QUERY_VERSION };
      report.failed++;
    }
  }
  return report;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

/** Hallen aus clubs.json (mit Vereinen als Anker) und aus dem Speicher der Spielorte. */
export function collectAddresses(clubs: any[], storeHalls: Record<string, any>): { halls: HallAddress[]; anchors: Map<string, Array<{ lat: number; lng: number }>> } {
  const byId = new Map<string, HallAddress>();
  const anchors = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const c of clubs) {
    for (const h of c.halls ?? []) {
      if (!h.dbbSpielfeldId) continue;
      const id = String(h.dbbSpielfeldId);
      if (!byId.has(id)) byId.set(id, { id, bezeichnung: h.bezeichnung, strasse: h.strasse, plz: h.plz, ort: h.ort });
      if (typeof c.lat === 'number' && typeof c.lng === 'number') anchors.set(id, [...(anchors.get(id) ?? []), { lat: c.lat, lng: c.lng }]);
    }
  }
  for (const [id, h] of Object.entries(storeHalls)) {
    if (!byId.has(id) && h?.ort) byId.set(id, { id, bezeichnung: h.bezeichnung, strasse: h.strasse, plz: h.plz, ort: h.ort });
  }
  return { halls: [...byId.values()], anchors };
}

async function main(): Promise<void> {
  const storeDir = arg('store', 'data-store');
  const clubsFile = arg('clubs', 'data/clubs.json');
  const budgetMin = Number(arg('budget-min', '25'));
  const max = Number(arg('max', '0'));
  const file = path.join(storeDir, 'hall-coords.json');

  const store = readJson<HallCoords>(file, emptyCoords());
  const { halls, anchors } = collectAddresses(readJson<any[]>(clubsFile, []), readJson<Record<string, any>>(path.join(storeDir, 'halls.json'), {}));
  const today = new Date().toISOString().slice(0, 10);
  const todo = pending(halls, store, today, id => anchors.get(id)?.length ?? 0);
  console.log(`${halls.length} Hallen, ${Object.keys(store.coords).length} mit Koordinaten, ${todo.length} offen.`);

  const report = await geocodeHalls(todo, store, {
    geocode: q => geocodeDetailed(q),
    today, max,
    anchorsOf: id => anchors.get(id) ?? [],
    deadline: budgetMin > 0 ? Date.now() + budgetMin * 60000 : 0
  });

  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store) + '\n', 'utf-8');
  const msg = `Geokodiert: ${report.found} gefunden, ${report.improved} ungefähre verbessert, ${report.failed} ohne Treffer von ${report.tried} versuchten Hallen${report.stoppedByBudget ? ' (Zeitbudget erreicht)' : ''}. Gesamt ${Object.keys(store.coords).length}/${halls.length}.`;
  console.log(msg);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${report.tried > 0}\n`);
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
