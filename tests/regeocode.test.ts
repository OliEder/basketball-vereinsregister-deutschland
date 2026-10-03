import { decide, findJunkClusters, isSuspect } from '../crawler/regeocode';

describe('isSuspect', () => {
  it('flags legal forms and empty values as geocodedFrom', () => {
    for (const g of ['e.V.', 'V.', 'eV', 'e. V.', '', null]) {
      expect(isSuspect({ geocodedFrom: g as any })).toBe(true);
    }
  });
  it('accepts real place names', () => {
    expect(isSuspect({ geocodedFrom: 'Calw' })).toBe(false);
    expect(isSuspect({ geocodedFrom: 'Neustadt a. d. Waldnaab' })).toBe(false);
  });
});

describe('findJunkClusters', () => {
  const c = (lat: number, lng: number, geocodedFrom: string) => ({ lat, lng, geocodedFrom });
  it('flags a point shared by 4+ clubs with different place names', () => {
    const clubs = [c(1, 1, 'A'), c(1, 1, 'B'), c(1, 1, 'C'), c(1, 1, 'D'), c(2, 2, 'X')];
    expect([...findJunkClusters(clubs)]).toEqual(['1,1']);
  });
  it('does not flag a city centre shared by clubs of the same city', () => {
    const clubs = [c(1, 1, 'Leipzig'), c(1, 1, 'Leipzig'), c(1, 1, 'leipzig'), c(1, 1, 'Leipzig'), c(1, 1, 'Leipzig')];
    expect(findJunkClusters(clubs).size).toBe(0);
  });
  it('ignores clubs without coordinates', () => {
    expect(findJunkClusters([c(null as any, null as any, 'A')]).size).toBe(0);
  });
});

describe('decide', () => {
  const high = { source: 'name' as const, confidence: 'high' as const };
  const low = { source: 'hall' as const, confidence: 'low' as const };
  it('applies safe results for suspect clubs', () => {
    expect(decide(high, true, false, false)).toBe('changed');
    expect(decide(high, true, false, true)).toBe('unchanged');
  });
  it('only applies low confidence results when the old coordinate is unusable', () => {
    expect(decide(low, true, true, false)).toBe('changed');
    expect(decide(low, true, false, false)).toBe('review');
  });
  it('keeps unsuspicious clubs unless there is a name hit', () => {
    expect(decide(low, false, false, false)).toBe('kept');
    expect(decide(high, false, false, false)).toBe('changed');
  });
  it('reports missing results', () => {
    expect(decide(null, true, true, false)).toBe('no-result');
  });
});
