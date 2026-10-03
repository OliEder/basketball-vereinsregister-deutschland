import { buildTeamIndex, tabelleEntries, toLigaDoc, LigaMeta } from '../crawler/live';

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
