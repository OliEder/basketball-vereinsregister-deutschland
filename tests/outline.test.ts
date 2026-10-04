import fs from 'fs';
import path from 'path';
import { landOutline, outlinesFor, unionOutline } from '../crawler/outline';
import { parseLaender } from '../crawler/geo-laender';

const square = (x: number, y: number, s: number): number[][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const feature = (polygons: number[][][][]) => ({ name: 'Test', sn: null, polygons, bbox: [0, 0, 1, 1] as [number, number, number, number] });

describe('landOutline', () => {
  it('ein Quadrat wird ein geschlossener Pfad im Feld bis 100', () => {
    const o = landOutline(feature([[square(0, 50, 1)]]))!;
    expect(o.path).toMatch(/^M[\d.,L]+Z$/);
    expect(Math.max(o.w, o.h)).toBe(100);
    expect(o.h / o.w).toBeCloseTo(1 / Math.cos((50.5 * Math.PI) / 180) / 1, 1);   // Länge wird mit cos(Breite) gestaucht → Quadrat in Grad ist höher als breit
  });

  it('kleine Inseln entfallen, große Teilflächen bleiben', () => {
    const o = landOutline(feature([[square(0, 50, 1)], [square(3, 50, 0.5)], [square(5, 50, 0.01)]]))!;
    expect((o.path.match(/M/g) ?? []).length).toBe(2);
  });

  it('Löcher werden ignoriert, leere Flächen ergeben keinen Umriss', () => {
    const o = landOutline(feature([[square(0, 50, 1), square(0.4, 50.4, 0.2)]]))!;
    expect((o.path.match(/M/g) ?? []).length).toBe(1);
    expect(landOutline(feature([]))).toBeNull();
  });

  it('dünnt Linien aus: gerade Strecken verlieren ihre Zwischenpunkte', () => {
    const ring: number[][] = [];
    for (let i = 0; i <= 100; i++) ring.push([i / 100, 50]);
    ring.push([1, 51], [0, 51], [0, 50]);
    const o = landOutline(feature([[ring]]))!;
    expect(o.path.split('L').length).toBeLessThan(12);
  });
});

describe('outlinesFor mit den BKG-Grenzen', () => {
  const file = path.join(__dirname, '..', 'data', 'geo', 'laender.geojson');
  const laender = parseLaender(JSON.parse(fs.readFileSync(file, 'utf-8')));
  const slug = (s: string): string => s.toLowerCase().replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/[^a-z]+/g, '-');
  const out = outlinesFor(laender, slug);

  it('alle 16 Länder haben einen Umriss, schlank genug für die Seite', () => {
    expect(Object.keys(out)).toHaveLength(16);
    for (const [name, o] of Object.entries(out)) {
      expect(o.path.length).toBeLessThan(12000);
      expect(Math.max(o.w, o.h)).toBeLessThanOrEqual(100);
      expect(name).toMatch(/^[a-z-]+$/);
    }
    expect(out['bayern'].path.length).toBeLessThan(5000);
  });

  it('Rügen bleibt bei Mecklenburg-Vorpommern, mehrere Flächen bei Bremen', () => {
    expect((out['mecklenburg-vorpommern'].path.match(/M/g) ?? []).length).toBeGreaterThan(1);
    expect((out['bremen'].path.match(/M/g) ?? []).length).toBe(2);
  });
});

describe('unionOutline', () => {
  const file = path.join(__dirname, '..', 'data', 'geo', 'laender.geojson');
  const laender = parseLaender(JSON.parse(fs.readFileSync(file, 'utf-8')));

  it('ein Land: wie landOutline; mehrere Länder: gemeinsames Feld, größer als jedes einzelne', () => {
    const one = unionOutline(laender, ['Bayern'])!;
    expect(one.path).toBe(landOutline(laender.features.find(f => f.name === 'Bayern')!)!.path);
    const two = unionOutline(laender, ['Bayern', 'Sachsen'])!;
    expect(Math.max(two.w, two.h)).toBe(100);
    expect((two.path.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2);                      // beide Länder als eigene Flächen
  });

  it('ganz Deutschland bleibt klein genug für die Seite; unbekannte Namen ergeben nichts', () => {
    const all = unionOutline(laender, laender.features.map(f => f.name))!;
    expect(all.path.length).toBeLessThan(40000);
    expect(unionOutline(laender, ['Atlantis'])).toBeNull();
    expect(all.h).toBeGreaterThan(all.w * 0.8);                                                 // Deutschland ist etwa so hoch wie breit
  });
});
