// tests/search-engine.test.ts
import { SearchEngine } from '../api/search-engine';
import { MergedClub } from '../crawler/types';

const makeClub = (clubId: number, name: string, lat: number, lng: number): MergedClub => ({
  clubId,
  name,
  verbandId: 2,
  verbandName: 'Bayern',
  lat,
  lng,
  geocodedFrom: name.split(' ').pop() ?? null,
  logoUrl: null,
  lastCrawled: '2026-04-13T10:00:00Z'
});

const clubs: MergedClub[] = [
  makeClub(1, 'Fibalon Baskets Regensburg', 49.0134, 12.1016),
  makeClub(2, 'Bayern Baskets München', 48.1351, 11.5820),
  makeClub(3, 'Würzburg Baskets', 49.7944, 9.9294),
];

describe('SearchEngine.searchByName', () => {
  const engine = new SearchEngine(clubs);

  it('finds exact match', () => {
    const results = engine.searchByName('Regensburg');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
  });

  it('finds fuzzy match with typo', () => {
    const results = engine.searchByName('Regensbrug');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
  });

  it('returns empty for no match', () => {
    const results = engine.searchByName('xyzabcdef');
    expect(results).toHaveLength(0);
  });
});

describe('SearchEngine.searchByLocation', () => {
  const engine = new SearchEngine(clubs);

  it('finds clubs within radius', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 50);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
    expect(results[0].distanceKm).toBeCloseTo(0, 0);
  });

  it('excludes clubs outside radius', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 10);
    const clubIds = results.map(r => r.clubId);
    expect(clubIds).not.toContain(2);
  });

  it('sorts by distance ascending', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 500);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distanceKm!).toBeGreaterThanOrEqual(results[i - 1].distanceKm!);
    }
  });

  it('skips clubs without coordinates', () => {
    const clubsWithNull: MergedClub[] = [
      makeClub(1, 'Test Club', 49.0, 12.0),
      { ...makeClub(2, 'No Coords', 0, 0), lat: null, lng: null }
    ];
    const engine2 = new SearchEngine(clubsWithNull);
    const results = engine2.searchByLocation(49.0, 12.0, 100);
    expect(results.map(r => r.clubId)).not.toContain(2);
  });
});

describe('SearchEngine.searchCombined', () => {
  const engine = new SearchEngine(clubs);

  it('filters by location then by name', () => {
    // Regensburg ist nah, München ist ~100km entfernt
    const results = engine.searchCombined('Baskets', 49.0134, 12.1016, 50);
    const clubIds = results.map(r => r.clubId);
    expect(clubIds).toContain(1); // Fibalon Baskets Regensburg — nah + name match
    expect(clubIds).not.toContain(2); // Bayern Baskets München — zu weit
  });

  it('preserves distanceKm in combined results', () => {
    const results = engine.searchCombined('Regensburg', 49.0134, 12.1016, 50);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].distanceKm).toBeDefined();
    expect(results[0].distanceKm).toBeCloseTo(0, 0);
  });
});
