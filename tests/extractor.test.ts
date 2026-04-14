// tests/extractor.test.ts
import { extractClubs, extractCityFromName, extractTeams } from '../crawler/extractor';
import { BbbTableEntry, TeamEntry } from '../crawler/types';

const makeEntry = (clubId: number, teamname: string, teamPermanentId: number): BbbTableEntry => ({
  rang: 1,
  team: { seasonTeamId: 1, teamPermanentId, teamname, teamnameSmall: '', clubId }
});

describe('extractCityFromName', () => {
  it('returns last word as city', () => {
    expect(extractCityFromName('Fibalon Baskets Regensburg')).toBe('Regensburg');
  });

  it('handles single word', () => {
    expect(extractCityFromName('München')).toBe('München');
  });
});

describe('extractClubs', () => {
  it('deduplicates by clubId', () => {
    const entries = [
      makeEntry(428, 'Fibalon Baskets Regensburg', 1001),
      makeEntry(428, 'Fibalon Baskets Regensburg U16', 1002),
      makeEntry(999, 'Bayern Baskets München', 2001),
    ];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs).toHaveLength(2);
    expect(clubs.map(c => c.clubId)).toContain(428);
    expect(clubs.map(c => c.clubId)).toContain(999);
  });

  it('sets logoUrl from teamPermanentId', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].logoUrl).toBe('https://www.basketball-bund.net/media/team/1001/logo');
  });

  it('sets verbandId and verbandName', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].verbandId).toBe(2);
    expect(clubs[0].verbandName).toBe('Bayern');
  });

  it('sets geocodedFrom to extracted city', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].geocodedFrom).toBe('Regensburg');
  });
});


describe('extractTeams', () => {
  it('groups teamPermanentIds by clubId with altersklasse + geschlecht', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'Bonn 1', teamnameSmall: 'Bonn', clubId: 10 } },
      { rang: 2, team: { seasonTeamId: 2, teamPermanentId: 200, teamname: 'Berlin 1', teamnameSmall: 'Berlin', clubId: 20 } },
      { rang: 3, team: { seasonTeamId: 3, teamPermanentId: 101, teamname: 'Bonn 2', teamnameSmall: 'Bonn', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.get(10)).toEqual([
      { teamPermanentId: 100, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
      { teamPermanentId: 101, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
    ]);
    expect(result.get(20)).toEqual([
      { teamPermanentId: 200, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
    ]);
  });

  it('skips entries with null clubId', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 999, teamname: 'Sieger A/B', teamnameSmall: 'Sieger', clubId: null as any } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.size).toBe(0);
  });

  it('deduplicates teams with same teamPermanentId within a club', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'Bonn 1', teamnameSmall: 'Bonn', clubId: 10 } },
      { rang: 2, team: { seasonTeamId: 2, teamPermanentId: 100, teamname: 'Bonn 1 (duplicate)', teamnameSmall: 'Bonn', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.get(10)).toHaveLength(1);
    expect(result.get(10)![0].teamPermanentId).toBe(100);
  });
});
