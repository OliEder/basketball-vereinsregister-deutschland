// tests/extractor.test.ts
import { extractClubs, extractCityFromName } from '../crawler/extractor';
import { BbbTableEntry } from '../crawler/types';

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
