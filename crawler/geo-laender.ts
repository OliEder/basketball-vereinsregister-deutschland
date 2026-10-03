// crawler/geo-laender.ts
// Länderpolygone (BKG, VG250) für die Regionsprüfung: Liegt ein Punkt im richtigen Bundesland?
//
// Die Datei data/geo/laender.geojson erzeugt der Workflow "Länderpolygone (BKG)" aus dem Datensatz
// "Verwaltungsgebiete 1:250 000" des Bundesamts für Kartographie und Geodäsie. Sie ist vereinfacht und nach
// WGS84 umgerechnet (siehe Felder attribution, license und modification in der Datei).
//
//   npm run geo-laender -- --in=<roh.geojson> --out=data/geo/laender.geojson --attribution="…" --source=<URL>
import fs from 'fs';
import path from 'path';

type Ring = number[][];           // [lng, lat]
type Polygon = Ring[];            // Außenring, dann Löcher
export interface LandFeature { name: string; sn: string | null; polygons: Polygon[]; bbox: [number, number, number, number] }
export interface Laender { attribution: string; features: LandFeature[] }

/** Erwartete Landesnamen wie in der VG250 (GEN); stimmen mit den Namen aus region.ts überein. */
export const LAND_NAMES = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern',
  'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
  'Schleswig-Holstein', 'Thüringen'
];

function polygonsOf(geometry: any): Polygon[] {
  if (geometry?.type === 'Polygon') return [geometry.coordinates as Polygon];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates as Polygon[];
  return [];
}

function bboxOf(polygons: Polygon[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function parseLaender(geojson: any): Laender {
  const features: LandFeature[] = [];
  for (const f of geojson?.features ?? []) {
    const name = f?.properties?.name ?? f?.properties?.GEN;
    const polygons = polygonsOf(f?.geometry);
    if (!name || polygons.length === 0) continue;
    features.push({ name, sn: f.properties?.sn ?? f.properties?.SN_L ?? null, polygons, bbox: bboxOf(polygons) });
  }
  return { attribution: String(geojson?.attribution ?? ''), features };
}

export function loadLaender(file: string): Laender | null {
  try {
    const l = parseLaender(JSON.parse(fs.readFileSync(file, 'utf-8')));
    return l.features.length > 0 ? l : null;
  } catch {
    return null;
  }
}

/** Ray-Casting für einen Ring; Punkte genau auf dem Rand sind für unsere Zwecke gleichgültig. */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(x: number, y: number, poly: Polygon): boolean {
  if (!inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

/** Name des Bundeslandes, in dem der Punkt liegt, sonst null (z. B. Ausland oder Meer). */
export function stateAt(laender: Laender, point: { lat: number; lng: number }): string | null {
  const { lat: y, lng: x } = point;
  for (const f of laender.features) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (f.polygons.some(p => inPolygon(x, y, p))) return f.name;
  }
  return null;
}

/** Abstand eines Punktes zum nächsten Eckpunkt des Landes in km (grob; für "knapp daneben"-Toleranz). */
export function nearestVertexKm(land: LandFeature, point: { lat: number; lng: number }, distance: (a: any, b: any) => number): number {
  let best = Infinity;
  for (const poly of land.polygons) for (const [x, y] of poly[0]) {
    const d = distance(point, { lat: y, lng: x });
    if (d < best) best = d;
  }
  return best;
}

// ---- Aufbereitung der Rohdatei (Ausgabe von ogr2ogr) -----------------------------------------------

export interface BuildMeta { attribution: string; source: string; fetched: string }

/** Macht aus der ogr2ogr-Ausgabe die endgültige Datei; bricht ab, wenn nicht alle 16 Länder da sind. */
export function buildLaenderFile(raw: any, meta: BuildMeta): any {
  const parsed = parseLaender(raw);
  const names = new Set(parsed.features.map(f => f.name));
  const missing = LAND_NAMES.filter(n => !names.has(n));
  if (missing.length > 0) {
    throw new Error(`Länder fehlen in der Rohdatei: ${missing.join(', ')} (gefunden: ${[...names].join(', ') || 'keine'})`);
  }
  return {
    type: 'FeatureCollection',
    attribution: meta.attribution,
    license: 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0), https://www.govdata.de/dl-de/by-2-0',
    source: meta.source,
    fetched: meta.fetched,
    modification: 'Nur Landflächen (GF=4), Geometrie vereinfacht, nach WGS84 (EPSG:4326) umgerechnet, auf Name und Schlüssel des Landes reduziert.',
    features: raw.features
      .filter((f: any) => polygonsOf(f.geometry).length > 0)
      .map((f: any) => ({
        type: 'Feature',
        properties: { name: f.properties?.GEN ?? f.properties?.name, sn: f.properties?.SN_L ?? f.properties?.sn ?? null },
        geometry: f.geometry
      }))
  };
}

function arg(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function main(): void {
  const input = arg('in');
  const out = arg('out') ?? 'data/geo/laender.geojson';
  const attribution = arg('attribution');
  const source = arg('source') ?? '';
  if (!input || !attribution) throw new Error('Aufruf: --in=<roh.geojson> --attribution="…" [--out=…] [--source=<URL>]');
  const file = buildLaenderFile(JSON.parse(fs.readFileSync(input, 'utf-8')), { attribution, source, fetched: new Date().toISOString().slice(0, 10) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file), 'utf-8');
  console.log(`${file.features.length} Länder → ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(String(err)); process.exit(1); }
}
