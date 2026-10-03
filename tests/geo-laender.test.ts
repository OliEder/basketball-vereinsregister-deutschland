import { parseLaender, stateAt, inPolygon, buildLaenderFile, LAND_NAMES } from '../crawler/geo-laender';

// Zwei Quadrate: "Nord" (0–10 / 10–20) mit Loch, "Sued" daneben
const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (GEN: string, coordinates: any, type = 'Polygon') => ({ type: 'Feature', properties: { GEN, SN_L: '99' }, geometry: { type, coordinates } });
const raw = {
  features: [
    feature('Nord', [square(0, 10, 10, 20), square(4, 14, 6, 16)]),
    feature('Sued', [square(0, 0, 10, 9)]),
    feature('Inseln', [[square(20, 0, 22, 2)], [square(24, 0, 26, 2)]], 'MultiPolygon')
  ]
};

describe('stateAt', () => {
  const l = parseLaender(raw);

  it('findet das Land, in dem der Punkt liegt', () => {
    expect(stateAt(l, { lat: 12, lng: 2 })).toBe('Nord');
    expect(stateAt(l, { lat: 5, lng: 5 })).toBe('Sued');
  });

  it('beachtet Löcher, Inseln (MultiPolygon) und liefert null außerhalb', () => {
    expect(stateAt(l, { lat: 15, lng: 5 })).toBeNull();      // im Loch
    expect(stateAt(l, { lat: 1, lng: 25 })).toBe('Inseln');  // zweite Insel
    expect(stateAt(l, { lat: 9.5, lng: 5 })).toBeNull();     // Lücke zwischen den Ländern
    expect(stateAt(l, { lat: 50, lng: 50 })).toBeNull();
  });

  it('inPolygon prüft Außenring und Löcher', () => {
    const poly = [square(0, 0, 10, 10), square(4, 4, 6, 6)];
    expect(inPolygon(1, 1, poly)).toBe(true);
    expect(inPolygon(5, 5, poly)).toBe(false);
    expect(inPolygon(11, 1, poly)).toBe(false);
  });
});

describe('buildLaenderFile', () => {
  const full = {
    features: LAND_NAMES.map((n, i) => feature(n, [square(i, 0, i + 0.5, 1)]))
  };
  const meta = { attribution: '© Test', source: 'https://example.test/x.zip', fetched: '2026-10-03' };

  it('übernimmt Namen, Schlüssel, Quellenvermerk und Änderungshinweis', () => {
    const out = buildLaenderFile(full, meta);
    expect(out.features).toHaveLength(16);
    expect(out.features[0].properties).toEqual({ name: 'Baden-Württemberg', sn: '99' });
    expect(out.attribution).toBe('© Test');
    expect(out.license).toContain('dl-de/by-2-0');
    expect(out.modification).toMatch(/vereinfacht/);
    expect(parseLaender(out).attribution).toBe('© Test');
  });

  it('bricht ab, wenn Länder fehlen (falsche Ebene)', () => {
    expect(() => buildLaenderFile({ features: full.features.slice(0, 10) }, meta)).toThrow(/Länder fehlen/);
    expect(() => buildLaenderFile({ features: [] }, meta)).toThrow(/Länder fehlen/);
  });
});
