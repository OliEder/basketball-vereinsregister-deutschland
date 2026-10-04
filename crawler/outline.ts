// Länderumrisse als SVG-Pfad für die Karten der Startseite, aus den BKG-Grenzen (data/geo/laender.geojson).
//
// Aus den Landesflächen wird je Land ein vereinfachter Umriss: Außenringe, ohne Löcher, kleine Inseln entfallen,
// die Linie wird mit Douglas-Peucker ausgedünnt (rund 350 Punkte für Bayern). Die Projektion streckt die Länge mit
// cos(Breite), damit die Länder nicht verzerrt wirken. Der Pfad liegt in einem Feld von höchstens 100 × 100.
//
// Quellenvermerk und Veränderungshinweis (dl-de/by-2-0, "vereinfacht") gehören auf die Seite, siehe seo.ts.
import { LandFeature, Laender } from './geo-laender';

export interface Outline { path: string; w: number; h: number }

type Pt = [number, number];

/** Ramer-Douglas-Peucker für einen offenen Linienzug. */
function simplify(p: Pt[], eps: number): Pt[] {
  if (p.length < 3) return p;
  const [x1, y1] = p[0], [x2, y2] = p[p.length - 1];
  const dx = x2 - x1, dy = y2 - y1, n = Math.hypot(dx, dy) || 1e-12;
  let idx = 0, dm = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x2 * y1 - y2 * x1) / n;
    if (d > dm) { idx = i; dm = d; }
  }
  if (dm <= eps) return [p[0], p[p.length - 1]];
  return [...simplify(p.slice(0, idx + 1), eps).slice(0, -1), ...simplify(p.slice(idx), eps)];
}

/** Geschlossener Ring: am weitesten vom ersten Punkt entfernt teilen, beide Hälften vereinfachen. */
function simplifyRing(ring: Pt[], eps: number): Pt[] {
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (open.length < 4) return open;
  let far = 0, best = 0;
  open.forEach((q, i) => { const d = Math.hypot(q[0] - open[0][0], q[1] - open[0][1]); if (d > best) { best = d; far = i; } });
  return [...simplify(open.slice(0, far + 1), eps).slice(0, -1), ...simplify([...open.slice(far), open[0]], eps).slice(0, -1)];
}

const bboxArea = (r: Pt[]): number => {
  const xs = r.map(q => q[0]), ys = r.map(q => q[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

/** Umriss eines Landes; kleine Flächen (unter `minShare` der größten) entfallen, Rügen und Fehmarn bleiben. */
export function landOutline(f: LandFeature, eps = 0.012, minShare = 0.004): Outline | null {
  const rings = f.polygons.map(p => p[0]).filter(r => r && r.length >= 4);
  if (!rings.length) return null;
  const lat0 = rings.flat().reduce((s, q) => s + q[1], 0) / rings.flat().length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const proj = rings.map(r => r.map(([x, y]): Pt => [x * k, -y]));
  const biggest = Math.max(...proj.map(bboxArea));
  const kept = proj.filter(r => bboxArea(r) >= biggest * minShare).map(r => simplifyRing(r, eps)).filter(r => r.length >= 3);
  const all = kept.flat();
  const minX = Math.min(...all.map(q => q[0])), maxX = Math.max(...all.map(q => q[0]));
  const minY = Math.min(...all.map(q => q[1])), maxY = Math.max(...all.map(q => q[1]));
  const scale = 100 / (Math.max(maxX - minX, maxY - minY) || 1);
  const path = kept.map(r => 'M' + r.map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((y - minY) * scale).toFixed(1)}`).join('L') + 'Z').join('');
  return { path, w: Math.round((maxX - minX) * scale * 10) / 10, h: Math.round((maxY - minY) * scale * 10) / 10 };
}

/** Umrisse aller Länder, nach Pfadnamen (bayern, baden-wuerttemberg …); `slug` macht aus dem Landesnamen den Pfadnamen. */
export function outlinesFor(l: Laender, slug: (name: string) => string): Record<string, Outline> {
  const out: Record<string, Outline> = {};
  for (const f of l.features) {
    const o = landOutline(f);
    if (o) out[slug(f.name)] = o;
  }
  return out;
}
