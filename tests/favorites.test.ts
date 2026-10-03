const F = require('../portal/favorites.js');
const R = require('../portal/report.js');

describe('Favorites', () => {
  it('parse: kaputte oder fremde Daten ergeben eine leere Liste', () => {
    expect(F.parse('kein json')).toEqual({ v: 1, teams: [], clubs: [] });
    expect(F.parse(null)).toEqual({ v: 1, teams: [], clubs: [] });
    expect(F.parse('{"teams":"x","clubs":5}')).toEqual({ v: 1, teams: [], clubs: [] });
  });

  it('parse: bereinigt Einträge, Doppelte und zu lange Namen', () => {
    const raw = JSON.stringify({ teams: [{ id: 1, name: 'A', clubId: 7 }, { id: '1', name: 'A2' }, { id: 2 }, null, { id: 3, name: 'x'.repeat(300) }], clubs: [] });
    const s = F.parse(raw);
    expect(s.teams.map((t: any) => t.id)).toEqual(['1', '3']);
    expect(s.teams[0]).toEqual({ id: '1', name: 'A', clubId: '7' });
    expect(s.teams[1].name).toHaveLength(120);
  });

  it('toggle fügt hinzu und entfernt wieder, IDs gelten als Text', () => {
    let l = F.toggle([], { id: 5, name: 'A' });
    expect(F.has(l, '5')).toBe(true);
    l = F.toggle(l, { id: '5', name: 'A' });
    expect(l).toEqual([]);
  });

  it('begrenzt die Liste auf MAX Einträge', () => {
    let l: any[] = [];
    for (let i = 0; i < F.MAX + 10; i++) l = F.toggle(l, { id: i, name: 'T' + i });
    expect(l).toHaveLength(F.MAX);
  });
});

describe('Report', () => {
  it('baut die Adresse mit Vorlage, Titel, Seite und Objekt', () => {
    const u = new URL(R.url({ kind: 'club', id: 1235, name: 'TSV Nördlingen', page: 'https://x.test/bayern/a/b/' }));
    expect(u.origin + u.pathname).toBe('https://github.com/OliEder/basketball-vereinsregister-deutschland/issues/new');
    expect(u.searchParams.get('template')).toBe('datenfehler.yml');
    expect(u.searchParams.get('title')).toBe('Datenfehler: Verein TSV Nördlingen');
    expect(u.searchParams.get('page')).toBe('https://x.test/bayern/a/b/');
    expect(u.searchParams.get('objekt')).toBe('Verein 1235 – TSV Nördlingen');
  });

  it('maskiert Sonderzeichen und kürzt lange Namen', () => {
    const u = new URL(R.url({ kind: 'team', id: 1, name: 'A&B=C #1 ' + 'x'.repeat(200), page: 'p' }));
    expect(u.searchParams.get('title')!.startsWith('Datenfehler: Team A&B=C #1 ')).toBe(true);
    expect(u.searchParams.get('title')!.length).toBeLessThan(110);
  });
});
