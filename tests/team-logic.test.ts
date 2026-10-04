// eslint-disable-next-line @typescript-eslint/no-var-requires
const L = require('../portal/team-logic.js');

const t = (id: number, name = `T${id}`, clubId = id * 10) => ({ teamPermanentId: id, teamname: name, clubId });
const m = (over: any) => ({ matchId: 1, kickoffDate: '2026-09-26', kickoffTime: '18:30', homeTeam: t(1), guestTeam: t(2), result: null, ergebnisbestaetigt: false, verzicht: false, abgesagt: false, ...over });

describe('parseResult', () => {
  it('parses "74:89" and rejects everything else', () => {
    expect(L.parseResult('74:89')).toEqual({ home: 74, guest: 89 });
    expect(L.parseResult(null)).toBeNull();
    expect(L.parseResult('')).toBeNull();
    expect(L.parseResult('abgesagt')).toBeNull();
  });
});

describe('describeMatch', () => {
  it('is from the point of view of the given team', () => {
    const d = L.describeMatch(m({ result: '74:89', ergebnisbestaetigt: true }), 2);
    expect(d).toMatchObject({ isHome: false, own: 89, opp: 74, outcome: 'S', status: 'confirmed', played: true });
    expect(d.opponent.teamPermanentId).toBe(1);
  });
  it('marks unconfirmed results as provisional', () => {
    expect(L.describeMatch(m({ result: '106:93' }), 1).status).toBe('provisional');
  });
  it('handles open, cancelled and forfeited matches', () => {
    expect(L.describeMatch(m({}), 1)).toMatchObject({ status: 'open', played: false, outcome: null });
    expect(L.describeMatch(m({ abgesagt: true, result: '1:0' }), 1)).toMatchObject({ status: 'cancelled', played: false, outcome: null });
    expect(L.describeMatch(m({ verzicht: true }), 1).status).toBe('forfeit');
  });
});

describe('teamMatches / nextMatch / form / record', () => {
  const matches = [
    m({ matchId: 3, kickoffDate: '2026-10-10', homeTeam: t(2), guestTeam: t(1) }),
    m({ matchId: 1, kickoffDate: '2026-09-26', result: '74:89', ergebnisbestaetigt: true }),
    m({ matchId: 2, kickoffDate: '2026-10-02', homeTeam: t(3), guestTeam: t(1), result: '60:70', ergebnisbestaetigt: true }),
    m({ matchId: 9, homeTeam: t(5), guestTeam: t(6) })
  ];
  const list = L.teamMatches(matches, 1);

  it('filters to the team and sorts chronologically', () => {
    expect(list.map((d: any) => d.match.matchId)).toEqual([1, 2, 3]);
  });
  it('finds the next open match from today on', () => {
    expect(L.nextMatch(list, '2026-10-03').match.matchId).toBe(3);
    expect(L.nextMatch(list, '2027-01-01')).toBeNull();
  });
  it('builds form and record', () => {
    expect(L.form(list, 5)).toEqual(['N', 'S']);
    expect(L.record(list)).toEqual({ played: 2, wins: 1, losses: 1, pointsFor: 144, pointsAgainst: 149 });
  });
});

describe('liga helpers', () => {
  const docA = { ligaId: 1, tabelle: [], matches: [m({})] };
  const docB = { ligaId: 2, tabelle: [{ rang: 3, team: t(1, 'Eins', 77) }], matches: [] };

  it('finds standings, name and club', () => {
    expect(L.standingFor(docB.tabelle, 1).rang).toBe(3);
    expect(L.standingFor(docB.tabelle, 9)).toBeNull();
    expect(L.teamName(docB, 1)).toBe('Eins');
    expect(L.teamName(docA, 2)).toBe('T2');
    expect(L.clubIdOf(docB, 1)).toBe(77);
  });
  it('prefers the liga with a table', () => {
    expect(L.pickPrimaryLiga([docA, docB], 1).ligaId).toBe(2);
    expect(L.pickPrimaryLiga([docA], 1).ligaId).toBe(1);
    expect(L.pickPrimaryLiga([], 1)).toBeNull();
  });
  it('formats kickoff with weekday', () => {
    expect(L.formatKickoff('2026-09-26', '18:30')).toBe('Sa, 26.09.2026 · 18:30');
    expect(L.formatKickoff(null, '18:30')).toBe('18:30');
  });
});

describe('venueFor', () => {
  const halls = { '10': { bezeichnung: 'Heimhalle', ort: 'Bonn' }, '20': { bezeichnung: 'Gasthalle', ort: 'Köln' } };

  it('nimmt bei einem Heimspiel die Halle des eigenen Vereins', () => {
    const d = L.describeMatch(m({ homeTeam: t(1, 'A', 10), guestTeam: t(2, 'B', 20) }), 1);
    expect(L.venueFor(d, 10, halls).bezeichnung).toBe('Heimhalle');
  });

  it('nimmt bei einem Auswärtsspiel die Halle des Heimteams (Gegner)', () => {
    const d = L.describeMatch(m({ homeTeam: t(2, 'B', 20), guestTeam: t(1, 'A', 10) }), 1);
    expect(L.venueFor(d, 10, halls).bezeichnung).toBe('Gasthalle');
  });

  it('liefert null ohne Index, ohne Eintrag oder ohne Verein', () => {
    const d = L.describeMatch(m({ homeTeam: t(2, 'B', 99), guestTeam: t(1, 'A', 10) }), 1);
    expect(L.venueFor(d, 10, halls)).toBeNull();
    expect(L.venueFor(d, 10, null)).toBeNull();
    expect(L.venueFor(null, 10, halls)).toBeNull();
    expect(L.venueFor(L.describeMatch(m({ homeTeam: t(1, 'A', 10) }), 1), null, halls)).toBeNull();
  });
});

describe('initials', () => {
  it('bildet Kürzel ohne Rechtsform', () => {
    expect(L.initials('TSV 1861 Nördlingen e.V.')).toBe('TN');
    expect(L.initials('Telekom Baskets Bonn')).toBe('TBB');
    expect(L.initials('')).toBe('·');
  });
});

describe('venueForMatch', () => {
  const halls = { '10': { bezeichnung: 'Heimhalle (geschätzt)', ort: 'Bonn' } };
  const d = L.describeMatch(m({ matchId: 77, homeTeam: t(1, 'A', 10), guestTeam: t(2, 'B', 20) }), 1);

  it('bevorzugt die gemeldete Halle aus den Live-Daten', () => {
    const doc = { venues: { '77': 5 }, halls: { '5': { bezeichnung: 'Echte Halle', ort: 'Köln', lat: 50.9, lng: 6.9 } } };
    const r = L.venueForMatch(doc, d, 10, halls);
    expect(r.confirmed).toBe(true);
    expect(r.venue.bezeichnung).toBe('Echte Halle');
  });

  it('fällt auf die voraussichtliche Heimhalle zurück', () => {
    expect(L.venueForMatch({}, d, 10, halls)).toEqual({ venue: halls['10'], confirmed: false });
    expect(L.venueForMatch({ venues: { '77': 9 }, halls: {} }, d, 10, halls).confirmed).toBe(false);
  });

  it('liefert null, wenn weder noch bekannt ist', () => {
    expect(L.venueForMatch({}, d, 10, null)).toBeNull();
    expect(L.venueForMatch({}, null, 10, halls)).toBeNull();
  });
});

describe('teamHref', () => {
  it('nimmt die statische Seite, sonst die Query-Adresse', () => {
    expect(L.teamHref({ '5': 'bayern/ulm/tv/herren/' }, 5)).toBe('bayern/ulm/tv/herren/');
    expect(L.teamHref({ '5': 'bayern/ulm/tv/herren/' }, 5, 9)).toBe('bayern/ulm/tv/herren/?liga=9');
    expect(L.teamHref(null, 5, 9)).toBe('team.html?id=5&liga=9');
    expect(L.teamHref({}, 5)).toBe('team.html?id=5');
  });
});

describe('summary', () => {
  const doc = {
    tabelle: [{ rang: 2, team: t(1) }, { rang: 1, team: t(2) }],
    matches: [
      m({ matchId: 1, kickoffDate: '2026-09-20', homeTeam: t(1), guestTeam: t(2), result: '80:70' }),
      m({ matchId: 2, kickoffDate: '2026-09-27', homeTeam: t(2), guestTeam: t(1), result: '75:60' }),
      m({ matchId: 3, kickoffDate: '2026-10-04', homeTeam: t(1), guestTeam: t(2), result: '95:85' }),
      m({ matchId: 4, kickoffDate: '2026-10-11', homeTeam: t(2), guestTeam: t(1) })
    ]
  };

  it('Platz, Bilanz, Korbdifferenz und Form aus Tabelle und Spielen', () => {
    expect(L.summary(doc, 1)).toEqual({ rang: 2, played: 3, wins: 2, losses: 1, diff: 5, form: ['S', 'N', 'S'] });
    expect(L.summary(doc, 2)).toEqual({ rang: 1, played: 3, wins: 1, losses: 2, diff: -5, form: ['N', 'S', 'N'] });
  });

  it('Form zeigt höchstens die letzten fünf Spiele', () => {
    const many = { tabelle: [], matches: Array.from({ length: 7 }, (_, i) => m({ matchId: i, kickoffDate: `2026-09-${String(10 + i)}`, result: i % 2 ? '60:70' : '70:60' })) };
    expect(L.summary(many, 1).form).toEqual(['S', 'N', 'S', 'N', 'S']);
  });

  it('ohne Spiele und Tabelle: leere Kennzahlen statt Fehler', () => {
    expect(L.summary({ tabelle: [], matches: [] }, 1)).toEqual({ rang: null, played: 0, wins: 0, losses: 0, diff: null, form: [] });
    expect(L.summary(null, 1).rang).toBeNull();
  });
});

describe('clubSummary', () => {
  const a1 = { teamPermanentId: 1, teamname: 'A1', clubId: 10 };
  const a2 = { teamPermanentId: 2, teamname: 'A2', clubId: 10 };
  const b = { teamPermanentId: 3, teamname: 'B', clubId: 20 };
  const c = { teamPermanentId: 4, teamname: 'C', clubId: 30 };
  const ligaA = { tabelle: [{ team: a1 }, { team: b }], matches: [
    m({ matchId: 1, homeTeam: a1, guestTeam: b, result: '80:70' }),
    m({ matchId: 2, homeTeam: b, guestTeam: a1 }),
    m({ matchId: 3, homeTeam: b, guestTeam: a1, abgesagt: true }),
    m({ matchId: 4, homeTeam: b, guestTeam: c, result: '60:50' })
  ] };
  const ligaB = { tabelle: [{ team: a2 }, { team: c }], matches: [
    m({ matchId: 5, homeTeam: a2, guestTeam: c, result: '55:50' }),
    m({ matchId: 6, homeTeam: a2, guestTeam: a1, result: '70:65' })     // Derby zweier Teams des Vereins
  ] };

  it('zählt gespielte und alle Spiele des Vereins, ohne Abgesagte und ohne fremde Spiele', () => {
    expect(L.clubSummary([ligaA, ligaB], 10)).toEqual({ total: 4, played: 3, ligen: 2 });
  });

  it('Derby und doppelt gelieferte Spiele zählen einmal', () => {
    expect(L.clubSummary([ligaB, ligaB], 10)).toEqual({ total: 2, played: 2, ligen: 2 });
  });

  it('Verein ohne Spiele und Ligen: Nullen statt Fehler', () => {
    expect(L.clubSummary([ligaA], 99)).toEqual({ total: 0, played: 0, ligen: 0 });
    expect(L.clubSummary(null, 10)).toEqual({ total: 0, played: 0, ligen: 0 });
  });
});
