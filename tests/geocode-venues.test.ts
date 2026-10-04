import { QUERY_VERSION, normalizeStreet, queriesFor, plausible, pending, geocodeHalls, collectAddresses, emptyCoords, HallCoords, HallAddress, GeocodeFn } from '../crawler/geocode-venues';

const hall = (id: string, over: Partial<HallAddress> = {}): HallAddress => ({ id, bezeichnung: 'Halle', strasse: 'Kurfürstenstr. 25', plz: '71636', ort: 'Ludwigsburg', ...over });
const near = { lat: 48.9, lng: 9.19 };

describe('Suchtexte', () => {
  it('normalizeStreet schreibt Straße aus und entfernt Zusätze in Klammern', () => {
    expect(normalizeStreet('Kurfürstenstr. 25')).toBe('Kurfürstenstraße 25');
    expect(normalizeStreet('Str. des 17. Juni 3')).toBe('Straße des 17. Juni 3');
    expect(normalizeStreet('Am Ring 5 (Eingang Nord)')).toBe('Am Ring 5');
    expect(normalizeStreet('An der Kotsche 39/41')).toBe('An der Kotsche 39/41');
  });

  it('queriesFor: Straße mit Ort, Straße nur mit PLZ, dann Ort, dann nur PLZ; ohne Ort keine Suche', () => {
    expect(queriesFor(hall('1'))).toEqual([
      { q: 'Kurfürstenstraße 25, 71636 Ludwigsburg', precision: 'adresse' },
      { q: 'Kurfürstenstraße 25, 71636', precision: 'adresse' },
      { q: '71636 Ludwigsburg', precision: 'ort' },
      { q: '71636', precision: 'ort' }
    ]);
    expect(queriesFor(hall('1', { ort: null }))).toEqual([]);
    expect(queriesFor(hall('1', { strasse: null }))).toEqual([{ q: '71636 Ludwigsburg', precision: 'ort' }, { q: '71636', precision: 'ort' }]);
    expect(queriesFor(hall('1', { strasse: '  ', plz: null }))).toEqual([{ q: 'Ludwigsburg', precision: 'ort' }]);
  });

  it('Ortsteil oder Kürzel im Ort: die Suche nur mit PLZ steht dabei', () => {
    const qs = queriesFor(hall('1', { strasse: 'Am Waldrand 21', plz: '69126', ort: 'HD-Boxberg' })).map(x => x.q);
    expect(qs).toContain('Am Waldrand 21, 69126');
    expect(qs).toContain('69126');
  });
});

describe('plausible', () => {
  it('mit Vereinen als Anker: höchstens 40 km von einem entfernt', () => {
    expect(plausible({ lat: 48.95, lng: 9.2 }, 'Ludwigsburg', [near])).toBe(true);
    expect(plausible({ lat: 52.5, lng: 13.4 }, 'Ludwigsburg', [near])).toBe(false);
    expect(plausible({ lat: 52.5, lng: 13.4 }, 'Ludwigsburg', [{ lat: 52.51, lng: 13.41 }, near])).toBe(true);
  });
  it('ohne Anker muss der gefundene Ort zum Hallenort passen', () => {
    expect(plausible({ lat: 1, lng: 1, city: 'Ludwigsburg' }, 'Ludwigsburg', [])).toBe(true);
    expect(plausible({ lat: 1, lng: 1, city: 'Köln' }, 'Köln - Porz', [])).toBe(true);
    expect(plausible({ lat: 1, lng: 1, city: 'Freiburg im Breisgau' }, 'Freiburg', [])).toBe(true);
    expect(plausible({ lat: 1, lng: 1, city: 'Hamburg' }, 'Ludwigsburg', [])).toBe(false);
    expect(plausible({ lat: 1, lng: 1 }, 'Ludwigsburg', [])).toBe(false);
  });
});

describe('pending', () => {
  const today = '2026-10-04';
  it('nimmt Hallen ohne Koordinate, überspringt fertige und frische Fehlschläge, wiederholt alte und geänderte', () => {
    const store: HallCoords = {
      v: 1,
      coords: { '1': { lat: 1, lng: 1, precision: 'adresse', q: 'Kurfürstenstraße 25, 71636 Ludwigsburg', checked: '2026-09-01' }, '5': { lat: 1, lng: 1, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-09-01', v: QUERY_VERSION } },
      failed: { '2': { q: 'Kurfürstenstraße 25, 71636 Ludwigsburg', checked: '2026-09-30', v: QUERY_VERSION }, '3': { q: 'Kurfürstenstraße 25, 71636 Ludwigsburg', checked: '2026-08-01', v: QUERY_VERSION }, '4': { q: 'alte Adresse', checked: '2026-10-01', v: QUERY_VERSION } }
    };
    const todo = pending([hall('1'), hall('2'), hall('3'), hall('4'), hall('5'), hall('6'), hall('7', { ort: null })], store, today);
    expect(todo.map(h => h.id)).toEqual(['3', '4', '6']);
  });

  it('Hallen mit mehr Vereinen zuerst', () => {
    const w: Record<string, number> = { '10': 1, '11': 3, '12': 0 };
    expect(pending([hall('10'), hall('11'), hall('12')], emptyCoords(), today, id => w[id]).map(h => h.id)).toEqual(['11', '10', '12']);
  });
});

describe('geocodeHalls', () => {
  const base = { today: '2026-10-04', anchorsOf: () => [near] };

  it('nimmt den Straßentreffer, fällt sonst auf den Ort zurück und merkt sich Fehlschläge', async () => {
    const store = emptyCoords();
    const calls: string[] = [];
    const geocode: GeocodeFn = async q => {
      calls.push(q);
      if (q.startsWith('Kurfürstenstraße')) return { lat: 48.9001, lng: 9.1901 };
      if (q === '71636 Ludwigsburg') return { lat: 48.89, lng: 9.19 };
      return null;
    };
    const r = await geocodeHalls([hall('1'), hall('2', { strasse: 'Nirgends 1' }), hall('3', { strasse: 'Geisterweg 9', ort: 'Unbekannt', plz: '00000' })], store, { ...base, geocode });
    expect(r).toMatchObject({ tried: 3, found: 2, failed: 1 });
    expect(store.coords['1']).toMatchObject({ precision: 'adresse', lat: 48.9001, lng: 9.1901 });
    expect(store.coords['2']).toMatchObject({ precision: 'ort', q: '71636 Ludwigsburg' });
    expect(store.failed['3']).toEqual({ q: 'Geisterweg 9, 00000 Unbekannt', checked: '2026-10-04', v: QUERY_VERSION });
    expect(calls[0]).toBe('Kurfürstenstraße 25, 71636 Ludwigsburg');
  });

  it('verwirft Treffer weit entfernt von den Vereinen der Halle', async () => {
    const store = emptyCoords();
    const r = await geocodeHalls([hall('1')], store, { ...base, geocode: async () => ({ lat: 52.5, lng: 13.4 }) });
    expect(r.failed).toBe(1);
    expect(store.coords['1']).toBeUndefined();
  });

  it('ein späterer Treffer löscht den Fehlschlag; Zeitbudget und Höchstzahl beenden den Lauf', async () => {
    const store: HallCoords = { v: 1, coords: {}, failed: { '1': { q: 'x', checked: '2026-01-01' } } };
    await geocodeHalls([hall('1')], store, { ...base, geocode: async () => near });
    expect(store.failed['1']).toBeUndefined();

    const s2 = emptyCoords();
    const r = await geocodeHalls([hall('1'), hall('2'), hall('3')], s2, { ...base, geocode: async () => near, max: 2 });
    expect(r.tried).toBe(2);
    let t = 0;
    const r2 = await geocodeHalls([hall('1'), hall('2'), hall('3')], emptyCoords(), { ...base, geocode: async () => near, deadline: 2, now: () => t++ });
    expect(r2.stoppedByBudget).toBe(true);
    expect(r2.tried).toBe(2);
  });
});

describe('Verbesserte Suchtexte (QUERY_VERSION)', () => {
  const today = '2026-10-04';

  it('alte Fehlschläge und ungefähre Treffer ohne Version werden einmal neu versucht, danach nicht mehr', () => {
    const store: HallCoords = {
      v: 1,
      coords: { '1': { lat: 1, lng: 1, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-10-01' }, '2': { lat: 1, lng: 1, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-10-01', v: QUERY_VERSION } },
      failed: { '3': { q: 'Kurfürstenstraße 25, 71636 Ludwigsburg', checked: '2026-10-03' } }
    };
    expect(pending([hall('1'), hall('2'), hall('3')], store, today).map(h => h.id)).toEqual(['1', '3']);
  });

  it('ungefähre Halle ohne Straße wird nicht neu versucht (es gäbe nichts Besseres)', () => {
    const store: HallCoords = { v: 1, coords: { '1': { lat: 1, lng: 1, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-10-01' } }, failed: {} };
    expect(pending([hall('1', { strasse: null })], store, today)).toEqual([]);
  });

  it('Verbesserung: Straßentreffer ersetzt die ungefähre Koordinate; ohne Treffer bleibt sie und wird markiert', async () => {
    const store: HallCoords = {
      v: 1,
      coords: {
        '1': { lat: 48.89, lng: 9.19, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-10-01' },
        '2': { lat: 48.89, lng: 9.19, precision: 'ort', q: '71636 Ludwigsburg', checked: '2026-10-01' }
      },
      failed: {}
    };
    const calls: string[] = [];
    const geocode: GeocodeFn = async q => { calls.push(q); return q.startsWith('Kurfürstenstraße') && calls.length === 1 ? { lat: 48.9001, lng: 9.1901 } : null; };
    const r = await geocodeHalls([hall('1'), hall('2')], store, { today, anchorsOf: () => [near], geocode });
    expect(r).toMatchObject({ improved: 1, found: 0, failed: 0 });
    expect(store.coords['1']).toMatchObject({ precision: 'adresse', lat: 48.9001, v: QUERY_VERSION });
    expect(store.coords['2']).toMatchObject({ precision: 'ort', lat: 48.89, v: QUERY_VERSION });
    expect(calls.every(q => q.startsWith('Kurfürstenstraße'))).toBe(true);        // nur Straßensuchen, keine Ortssuche
  });

  it('PLZ-Suche rettet Hallen, deren Ort ein Kürzel oder einen Ortsteil trägt', async () => {
    const store = emptyCoords();
    const h = hall('1044', { strasse: 'Am Waldrand 21', plz: '69126', ort: 'HD-Boxberg' });
    const geocode: GeocodeFn = async q => (q === '69126' ? { lat: 49.38, lng: 8.67 } : null);
    const r = await geocodeHalls([h], store, { today, anchorsOf: () => [{ lat: 49.4, lng: 8.69 }], geocode });
    expect(r.found).toBe(1);
    expect(store.coords['1044']).toMatchObject({ precision: 'ort', q: '69126' });
  });
});

describe('collectAddresses', () => {
  it('führt clubs.json und matchInfo-Hallen zusammen und sammelt die Vereinskoordinaten als Anker', () => {
    const clubs = [
      { clubId: 1, lat: 48.9, lng: 9.19, halls: [{ dbbSpielfeldId: 10, bezeichnung: 'A', strasse: 'X 1', plz: '71636', ort: 'Ludwigsburg' }] },
      { clubId: 2, lat: 48.8, lng: 9.2, halls: [{ dbbSpielfeldId: 10, bezeichnung: 'A', ort: 'Ludwigsburg' }, { dbbSpielfeldId: 11, bezeichnung: 'B', ort: 'Stuttgart' }] }
    ];
    const r = collectAddresses(clubs, { '10': { bezeichnung: 'ignoriert', ort: 'Ulm' }, '12': { bezeichnung: 'C', ort: 'Ulm' }, '13': { bezeichnung: 'ohne Ort' } });
    expect(r.halls.map(h => h.id).sort()).toEqual(['10', '11', '12']);
    expect(r.halls.find(h => h.id === '10')!.bezeichnung).toBe('A');
    expect(r.anchors.get('10')).toHaveLength(2);
    expect(r.anchors.get('12')).toBeUndefined();
  });
});
