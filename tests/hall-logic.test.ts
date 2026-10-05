// eslint-disable-next-line @typescript-eslint/no-var-requires
const H = require('../portal/hall-logic.js');

describe('addressOf', () => {
  it('setzt Straße, PLZ und Ort zusammen und lässt Fehlendes weg', () => {
    expect(H.addressOf({ strasse: 'Weg 1', plz: '89073', ort: 'Ulm' })).toBe('Weg 1, 89073 Ulm');
    expect(H.addressOf({ ort: 'Ulm' })).toBe('Ulm');
    expect(H.addressOf({})).toBe('');
  });
});

describe('coordsOf', () => {
  it('nimmt die Koordinate der Halle, sonst die aus der Koordinatentabelle', () => {
    expect(H.coordsOf({ lat: 48.1, lng: 11.5, dbbSpielfeldId: 7 }, {})).toEqual({ lat: 48.1, lng: 11.5 });
    expect(H.coordsOf({ lat: null, lng: null, dbbSpielfeldId: 7 }, { '7': [49.2, 10.3] })).toEqual({ lat: 49.2, lng: 10.3 });
  });
  it('liefert null ohne Koordinate und bei kaputten Einträgen', () => {
    expect(H.coordsOf({ dbbSpielfeldId: 7 }, {})).toBeNull();
    expect(H.coordsOf({ dbbSpielfeldId: 7 }, null)).toBeNull();
    expect(H.coordsOf({ dbbSpielfeldId: 7 }, { '7': ['x', 1] })).toBeNull();
    expect(H.coordsOf({ dbbSpielfeldId: null }, { '7': [1, 2] })).toBeNull();
  });
});

describe('splitHalls', () => {
  it('trennt Hallen mit und ohne genaue Koordinate', () => {
    const halls = [
      { dbbSpielfeldId: 1, bezeichnung: 'A', lat: 48, lng: 11 },
      { dbbSpielfeldId: 2, bezeichnung: 'B' },
      { dbbSpielfeldId: 3, bezeichnung: 'C' }
    ];
    const s = H.splitHalls(halls, { '3': [50, 8] });
    expect(s.onMap.map((e: any) => [e.hall.bezeichnung, e.lat, e.lng])).toEqual([['A', 48, 11], ['C', 50, 8]]);
    expect(s.offMap.map((h: any) => h.bezeichnung)).toEqual(['B']);
  });
  it('kommt mit fehlender Hallenliste zurecht', () => {
    expect(H.splitHalls(undefined, null)).toEqual({ onMap: [], offMap: [] });
  });
});

describe('seatOf', () => {
  const full = { name: 'TV Ulm', address: { street: 'Weg 2', zip: '89073', city: 'Ulm', lat: 48.4, lng: 9.99 } };
  it('liefert den Sitz nur mit Straße, Ort und Koordinate', () => {
    expect(H.seatOf(full)).toEqual({ name: 'TV Ulm', address: 'Weg 2, 89073 Ulm', lat: 48.4, lng: 9.99 });
    expect(H.seatOf({ name: 'X' })).toBeNull();
    expect(H.seatOf({ name: 'X', address: { street: 'Weg 2', city: 'Ulm' } })).toBeNull();
    expect(H.seatOf({ name: 'X', address: { city: 'Ulm', lat: 1, lng: 2 } })).toBeNull();
    expect(H.seatOf({ name: 'X', address: { street: 'Weg 2', lat: 1, lng: 2 } })).toBeNull();
  });
});

describe('clubHallStats', () => {
  const t = (clubId: number) => ({ teamPermanentId: clubId * 10, clubId });
  const m = (matchId: number, home: number, guest: number, date: string, extra: any = {}) =>
    ({ matchId, kickoffDate: date, homeTeam: t(home), guestTeam: t(guest), result: null, ...extra });
  const doc = { venues: { '1': 500, '2': 500, '3': 500, '4': 600, '5': 500, '6': 500 }, matches: [
    m(1, 1, 9, '2026-10-10'),                                     // anstehend
    m(2, 9, 1, '2026-09-20', { result: '80:70' }),                // gespielt
    m(3, 1, 9, '2026-11-01', { abgesagt: true }),                 // zählt nicht
    m(4, 1, 9, '2026-10-12'),                                     // andere Halle
    m(5, 8, 9, '2026-10-13'),                                     // anderer Verein
    m(6, 1, 9, '2026-10-14', { verzicht: true })                  // zählt nicht
  ] };

  it('zählt je Halle nur die Spiele des Vereins, ohne abgesagte und Verzichte', () => {
    const s = H.clubHallStats([doc], 1, '2026-10-03');
    expect(s['500']).toEqual({ games: 2, upcoming: 1 });
    expect(s['600']).toEqual({ games: 1, upcoming: 1 });
    expect(s['700']).toBeUndefined();
  });
  it('zählt ein Spiel nur einmal, auch wenn es in mehreren Liga-Dokumenten steht', () => {
    const s = H.clubHallStats([doc, doc], 1, '2026-10-03');
    expect(s['500']).toEqual({ games: 2, upcoming: 1 });
  });
  it('kommt mit leeren Dokumenten zurecht', () => {
    expect(H.clubHallStats([{}], 1, '2026-10-03')).toEqual({});
    expect(H.clubHallStats(undefined, 1, '2026-10-03')).toEqual({});
  });
});

describe('gamesText', () => {
  it('formuliert die Spiele des Vereins in der Halle', () => {
    expect(H.gamesText({ games: 3, upcoming: 2 })).toBe('3 Spiele des Vereins hier, 2 anstehend');
    expect(H.gamesText({ games: 1, upcoming: 0 })).toBe('1 Spiel des Vereins hier');
    expect(H.gamesText({ games: 0, upcoming: 0 })).toBe('');
    expect(H.gamesText(undefined)).toBe('');
  });
});
