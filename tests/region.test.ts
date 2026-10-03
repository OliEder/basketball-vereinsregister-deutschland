import { RegionIndex, stateOf, primaryBezirk } from '../crawler/region';
import { geocodeClub } from '../crawler/club-geocoder';
import { ClubEntry } from '../crawler/types';

const club = (id: number, lat: number | null, lng: number | null, extra: Partial<ClubEntry> = {}, bezirk = 'Oberpfalz', nr = '0200001'): ClubEntry => ({
  clubId: id, name: `Verein ${id}`, vereinsnummer: nr, verbandId: 2, verbandName: 'Bayern', lat, lng, geocodedFrom: 'Regensburg',
  logoUrl: null, lastCrawled: '', halls: [],
  teams: [{ teamPermanentId: id, ebene: 'Bezirk', bezirk, training: [] }],
  ...extra
});

// Oberpfalz: fünf Vereine um Regensburg
const oberpfalz = [
  club(1, 49.01, 12.10), club(2, 49.03, 12.08), club(3, 48.99, 12.12), club(4, 49.10, 12.20), club(5, 49.00, 12.00)
];

describe('stateOf / primaryBezirk', () => {
  it('liest den Landesverband aus der Vereinsnummer (nur 01–16)', () => {
    expect(stateOf('0200123')).toBe('02');
    expect(stateOf('1150711')).toBe('11');
    expect(stateOf('2202001')).toBeNull(); // Bundesliga/Kooperation
    expect(stateOf('4012029')).toBeNull(); // Rollstuhl
    expect(stateOf(undefined)).toBeNull();
  });

  it('nimmt den häufigsten Bezirk der Bezirks- und Kreisligen, Verbandsligen zählen nicht', () => {
    const c = club(9, 49, 12, {
      teams: [
        { teamPermanentId: 1, ebene: 'Verband', bezirk: 'Oberbayern', training: [] },
        { teamPermanentId: 2, ebene: 'Bezirk', bezirk: 'Oberpfalz', training: [] },
        { teamPermanentId: 3, ebene: 'Kreis', bezirk: 'Oberpfalz', training: [] },
        { teamPermanentId: 4, ebene: 'Bezirk', bezirk: 'Schwaben', training: [] }
      ]
    });
    expect(primaryBezirk(c)).toBe('Oberpfalz');
    expect(primaryBezirk({ teams: [] })).toBeNull();
  });
});

describe('RegionIndex', () => {
  const index = new RegionIndex(oberpfalz);

  it('akzeptiert Koordinaten im Bezirk', () => {
    const r = index.check(oberpfalz[0], { lat: 49.2, lng: 12.4 });
    expect(r.ok).toBe(true);
    expect(r.level).toBe('bezirk');
    expect(r.region).toBe('Bayern / Oberpfalz');
  });

  it('lehnt Koordinaten weit außerhalb ab (z. B. Freiburg für einen Verein aus der Oberpfalz)', () => {
    const r = index.check(oberpfalz[0], { lat: 47.99, lng: 7.85 });
    expect(r.ok).toBe(false);
    expect(r.distanceKm).toBeGreaterThan(300);
  });

  it('prüft nichts, wenn die Region unbekannt ist (Bundesliga, zu wenig Vergleichsvereine)', () => {
    const bl = club(50, null, null, {}, 'Oberpfalz', '2202001');
    expect(index.check(bl, { lat: 47.99, lng: 7.85 })).toMatchObject({ ok: true, level: 'none' });
    const small = new RegionIndex(oberpfalz.slice(0, 2));
    expect(small.check(oberpfalz[0], { lat: 47.99, lng: 7.85 }).ok).toBe(true);
  });

  it('prüft das Bundesland mit festem Radius, auch wenn der Bezirk unbekannt oder zu klein ist', () => {
    const noBezirk = club(20, null, null, { teams: [] });
    expect(index.check(noBezirk, { lat: 49.0, lng: 12.1 })).toMatchObject({ ok: true, level: 'state' });
    expect(index.check(noBezirk, { lat: 47.7, lng: 13.0 }).ok).toBe(true);  // Berchtesgaden/Passau-Rand
    const hh = index.check(noBezirk, { lat: 53.55, lng: 9.99 });            // Hamburg für einen bayerischen Verein
    expect(hh.ok).toBe(false);
    expect(hh.level).toBe('state');
    const hamburgClub = club(21, null, null, { teams: [] }, 'x', '0500005');
    expect(index.check(hamburgClub, { lat: 53.7, lng: 10.0 }).ok).toBe(true);  // Norderstedt-Nähe
    expect(index.check(hamburgClub, { lat: 52.5, lng: 13.4 }).ok).toBe(false); // Berlin
  });

  it('lässt Randlagen eines großen Bezirks zu (Grenze folgt der Streuung, nicht nur dem Median)', () => {
    // viele Vereine nah am Zentrum, einige weit draußen: d50 klein, d90 groß
    const core = Array.from({ length: 10 }, (_, i) => club(100 + i, 49.0 + i * 0.005, 12.1));
    const edge = [club(120, 49.0, 13.0), club(121, 49.0, 13.1)];   // etwa 65 km östlich
    const idx = new RegionIndex([...core, ...edge]);
    expect(idx.check(core[0], { lat: 49.0, lng: 13.0 }).ok).toBe(true);
  });

  it('ignoriert Vereine, die nicht als Referenz gelten', () => {
    const junk = [club(30, 47.99, 7.85), club(31, 47.99, 7.85), club(32, 47.99, 7.85), club(33, 47.99, 7.85)];
    const idx = new RegionIndex([...oberpfalz, ...junk], c => c.clubId < 30);
    expect(idx.check(oberpfalz[0], { lat: 49.0, lng: 12.1 }).ok).toBe(true);
    expect(idx.check(oberpfalz[0], { lat: 47.99, lng: 7.85 }).ok).toBe(false);
  });
});

describe('geocodeClub mit Plausibilitätsprüfung', () => {
  const freiburg = { lat: 47.99, lng: 7.85, displayName: 'Basketball Club, Freiburg', city: 'Freiburg' };
  const regensburg = { lat: 49.01, lng: 12.1, displayName: 'x', city: 'Regensburg' };
  const c = club(40, null, null, { name: 'Basketball Club Test', halls: [{ id: 1, dbbSpielfeldId: 1, bezeichnung: 'Halle', strasse: 'A 1', plz: '93047', ort: 'Regensburg' }] });
  const geocode = async (q: string) => (q.includes('Basketball Club Test') ? freiburg : q.includes('Regensburg') ? regensburg : null);
  const inBayern = (p: { lat: number }) => p.lat > 48.5;

  it('verwirft einen Namenstreffer außerhalb der Region und nimmt die Halle', async () => {
    const r = await geocodeClub(c, geocode as any, p => inBayern(p));
    expect(r).toMatchObject({ source: 'hall', geocodedFrom: 'Regensburg' });
  });

  it('ohne Prüfung bleibt es beim Namenstreffer (Verhalten unverändert)', async () => {
    const r = await geocodeClub(c, geocode as any);
    expect(r?.source).toBe('hall'); // Widerspruch zur Heimhalle wie bisher
  });

  it('liefert kein Ergebnis, wenn alle Quellen abgelehnt werden', async () => {
    expect(await geocodeClub(c, geocode as any, () => false)).toBeNull();
  });
});

import { decide, loadManualLocations, manualHit } from '../crawler/regeocode';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('manuelle Orte', () => {
  const tmp = (content: unknown) => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'manual-')), 'm.json');
    fs.writeFileSync(f, JSON.stringify(content));
    return f;
  };

  it('lädt Einträge mit PLZ und Ort oder mit Koordinaten', () => {
    const m = loadManualLocations(tmp([{ clubId: 1, zip: '93047', city: 'Regensburg' }, { clubId: 2, lat: 49, lng: 12 }]));
    expect(m.size).toBe(2);
    expect(m.get(1)?.city).toBe('Regensburg');
  });

  it('weist unvollständige Einträge ab', () => {
    expect(() => loadManualLocations(tmp([{ clubId: 1, zip: '93047' }]))).toThrow(/zip und city/);
    expect(() => loadManualLocations(tmp([{ zip: '1', city: 'x' }]))).toThrow(/clubId/);
    expect(() => loadManualLocations(tmp({}))).toThrow(/Array/);
  });

  it('eine fehlende Datei ergibt keine Einträge', () => {
    expect(loadManualLocations('/nicht/vorhanden.json').size).toBe(0);
  });

  it('manualHit nutzt Koordinaten direkt, sonst PLZ und Ort', async () => {
    expect(await manualHit({ clubId: 1, lat: 1, lng: 2, city: 'X' })).toMatchObject({ source: 'manual', lat: 1, lng: 2, geocodedFrom: 'X' });
    const r = await manualHit({ clubId: 1, zip: '93047', city: 'Regensburg' }, async q => (q === '93047 Regensburg' ? { lat: 49, lng: 12 } : null));
    expect(r).toMatchObject({ source: 'manual', confidence: 'high', lat: 49 });
    expect(await manualHit({ clubId: 1, zip: '1', city: 'Nirgends' }, async () => null)).toBeNull();
  });

  it('ein manueller Ort wird auch bei unverdächtigen Vereinen übernommen', () => {
    expect(decide({ source: 'manual', confidence: 'high' }, false, false, false)).toBe('changed');
    expect(decide({ source: 'hall', confidence: 'high' }, false, false, false)).toBe('kept');
  });
});
