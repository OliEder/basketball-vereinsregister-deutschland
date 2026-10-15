import { buildTeamIndex, tabelleEntries, toLigaDoc, definedOnly, crawlLiga, LigaMeta, LigaDoc } from '../crawler/live';

const meta: LigaMeta = { ligaId: 7, liganame: 'Bezirksliga', verbandName: 'Bayern' };
const team = (id: number) => ({ teamPermanentId: id, teamname: `T${id}`, clubId: id * 10 });

describe('tabelleEntries', () => {
  it('accepts an array or an object with entries', () => {
    expect(tabelleEntries([{ rang: 1 }])).toEqual([{ rang: 1 }]);
    expect(tabelleEntries({ entries: [{ rang: 2 }] })).toEqual([{ rang: 2 }]);
    expect(tabelleEntries(null)).toEqual([]);
    expect(tabelleEntries({})).toEqual([]);
  });
});

describe('toLigaDoc', () => {
  const data = {
    tabelle: { entries: [{ rang: 1, team: team(1) }] },
    matches: [{ matchId: 1, kickoffDate: '2026-10-10', homeTeam: team(1), guestTeam: team(2), ligaData: { ligaId: 7 } }]
  };

  it('drops the repeated ligaData from matches and keeps the table', () => {
    const doc = toLigaDoc(meta, data, '2026-10-03T00:00:00Z');
    expect(doc.matches[0]).not.toHaveProperty('ligaData');
    expect(doc.matches[0].matchId).toBe(1);
    expect(doc.tabelle).toHaveLength(1);
    expect(doc.ligaId).toBe(7);
  });

  it('uses the fallback table when the response has none', () => {
    const doc = toLigaDoc(meta, { matches: [] }, 'x', [{ rang: 3, team: team(3) }]);
    expect(doc.tabelle).toEqual([{ rang: 3, team: team(3) }]);
  });

  it('copes with a missing response', () => {
    const doc = toLigaDoc(meta, undefined, 'x');
    expect(doc.matches).toEqual([]);
    expect(doc.tabelle).toEqual([]);
  });
});

describe('buildTeamIndex', () => {
  it('maps teams to all ligen they appear in (table and matches)', () => {
    const a = toLigaDoc({ ...meta, ligaId: 1 }, { tabelle: [{ team: team(1) }], matches: [{ homeTeam: team(1), guestTeam: team(2) }] }, 'x');
    const b = toLigaDoc({ ...meta, ligaId: 2 }, { tabelle: [], matches: [{ homeTeam: team(1), guestTeam: team(3) }] }, 'x');
    expect(buildTeamIndex([b, a])).toEqual({ '1': [1, 2], '2': [1], '3': [2] });
  });
});

describe('definedOnly', () => {
  it('entfernt nur undefined-Felder', () => {
    expect(definedOnly({ a: 1, b: undefined, c: null, d: '' })).toEqual({ a: 1, c: null, d: '' });
  });
});

describe('crawlLiga', () => {
  const BASE = 'https://www.basketball-bund.net/rest';
  const sleep = async () => {};
  const mk = (routes: Record<string, any>, loadPrev?: (id: number) => LigaDoc | undefined) => {
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url.replace(BASE, ''));
      const hit = routes[url.replace(BASE, '')];
      if (hit instanceof Error) throw hit;
      if (hit === undefined) throw new Error(`HTTP 404 ${url}`);
      return hit;
    };
    return { calls, deps: { fetchJson, sleep, delay: 0, now: () => 'NOW', loadPrev } };
  };
  const match = (id: number, home: number, guest: number, ligaId = 7) =>
    ({ matchId: id, kickoffDate: '2026-10-10', homeTeam: team(home), guestTeam: team(guest), ligaData: { ligaId } });

  it('Normalfall: Spielplan der Liga, Quelle spielplan', async () => {
    const { deps, calls } = mk({ '/competition/spielplan/id/7': { data: { tabelle: { entries: [{ rang: 1, team: team(1) }] }, matches: [match(1, 1, 2)] } } });
    const r = await crawlLiga(meta, deps);
    expect(r.quelle).toBe('spielplan');
    expect(r.tabelleNachgeladen).toBe(false);
    expect(r.doc.matches).toHaveLength(1);
    expect(calls).toEqual(['/competition/spielplan/id/7']);
  });

  it('leere Tabelle bei vorhandenen Spielen wird nachgeladen und so ausgewiesen', async () => {
    const { deps } = mk({
      '/competition/spielplan/id/7': { data: { matches: [match(1, 1, 2)] } },
      '/competition/table/id/7': { data: { tabelle: { entries: [{ rang: 1, team: team(1) }] } } }
    });
    const r = await crawlLiga(meta, deps);
    expect(r.tabelleNachgeladen).toBe(true);
    expect(r.doc.tabelle).toHaveLength(1);
  });

  it('Spielplan HTTP 500: Spiele über die Teams der Tabelle, nur dieser Liga, ohne Doppelte', async () => {
    const { deps } = mk({
      '/competition/spielplan/id/7': new Error('HTTP 500 .../spielplan/id/7'),
      '/competition/table/id/7': { data: { tabelle: { entries: [{ rang: 1, team: team(1) }, { rang: 2, team: team(2) }, { rang: 3, team: team(3) }] } } },
      '/team/id/1/matches': { data: { matches: [match(1, 1, 2), match(9, 1, 5, 99)] } },
      '/team/id/2/matches': { data: { matches: [match(1, 1, 2), match(2, 2, 3)] } },
      '/team/id/3/matches': new Error('HTTP 500')
    });
    const r = await crawlLiga(meta, deps);
    expect(r.quelle).toBe('team-matches');
    expect(r.doc.matches.map(m => m.matchId).sort()).toEqual([1, 2]);
    expect(r.doc.matches[0]).not.toHaveProperty('ligaData');
    expect(r.doc.tabelle).toHaveLength(3);
    expect(r).toMatchObject({ teams: 3, teamFehler: 1, teamsOhneSpiele: 0 });
    expect(r.grund).toContain('HTTP 500');
  });

  it('alles schlägt fehl: Dokument des letzten Laufs bleibt erhalten', async () => {
    const prev: LigaDoc = { ...meta, fetchedAt: 'GESTERN', tabelle: [], matches: [{ matchId: 5 }] };
    const { deps } = mk({ '/competition/spielplan/id/7': new Error('HTTP 500') }, id => (id === 7 ? prev : undefined));
    const r = await crawlLiga(meta, deps);
    expect(r.quelle).toBe('cache');
    expect(r.doc.fetchedAt).toBe('GESTERN');
    expect(r.grund).toContain('HTTP 500');
  });

  it('alles schlägt fehl und kein Cache: wirft mit Grund', async () => {
    const { deps } = mk({ '/competition/spielplan/id/7': new Error('HTTP 500') });
    await expect(crawlLiga(meta, deps)).rejects.toThrow(/HTTP 500.*Rückfall/);
  });

  it('kein Team liefert Spiele: kein leeres Dokument, sondern Cache bzw. Fehler', async () => {
    const { deps } = mk({
      '/competition/spielplan/id/7': new Error('HTTP 500'),
      '/competition/table/id/7': { data: { tabelle: { entries: [{ rang: 1, team: team(1) }] } } },
      '/team/id/1/matches': new Error('HTTP 500')
    });
    await expect(crawlLiga(meta, deps)).rejects.toThrow(/kein Team lieferte Spiele/);
  });
});
