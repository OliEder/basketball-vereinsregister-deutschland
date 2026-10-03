import { decide, findJunkClusters, groupName, isSuspect, RegeocodeResult, unifyGroups } from '../crawler/regeocode';

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
    expect(decide(low, true, false, false, true)).toBe('changed');   // bestätigt die alte Koordinate: nur der Ortsname wird ersetzt
  });
  it('keeps unsuspicious clubs unless there is a name hit', () => {
    expect(decide(low, false, false, false)).toBe('kept');
    expect(decide(high, false, false, false)).toBe('changed');
  });
  it('reports missing results', () => {
    expect(decide(null, true, true, false)).toBe('no-result');
  });
});

describe('groupName', () => {
  it('ignores legal form, numbers, case and generic basketball words', () => {
    expect(groupName('ALBA Berlin Basketballteam e.V.')).toBe('alba berlin');
    expect(groupName('Alba Berlin Basketballteam e.V.')).toBe('alba berlin');
    expect(groupName('ALBA Berlin')).toBe('alba berlin');
    expect(groupName('TV 1862 Langen')).toBe('tv langen');
  });
});

describe('unifyGroups', () => {
  const res = (clubId: number, name: string, lat: number, lng: number, extra: Partial<RegeocodeResult> = {}): RegeocodeResult => ({
    clubId, name, suspect: true, source: 'hall', confidence: 'high', nameHitRejected: false, group: null, groupAction: null, region: null, regionRejected: [],
    before: { lat: 1, lng: 1, geocodedFrom: 'e.V.' },
    after: { lat, lng, geocodedFrom: 'Berlin' },
    distanceKm: 100, action: 'changed', ...extra
  });
  const teams = (counts: Record<number, number>) => (id: number) => counts[id] ?? 0;

  it('gives all IDs of one club the coordinate of the ID with the most teams', () => {
    const a = res(1, 'ALBA Berlin Basketballteam e.V.', 52.546, 13.406);
    const b = res(2, 'ALBA Berlin', 52.581, 13.359, { source: 'name' });
    const c = res(3, 'Alba Berlin Basketballteam e.V.', 52.509, 13.396);
    unifyGroups([a, b, c], teams({ 1: 59, 2: 1, 3: 1 }));
    for (const r of [a, b, c]) {
      expect(r.groupAction).toBe('unified');
      expect(r.after).toMatchObject({ lat: 52.546, lng: 13.406 });
    }
  });

  it('keeps individual results when same-named clubs are far apart', () => {
    const a = res(1, 'TV Langen', 49.99, 8.67);
    const b = res(2, 'TV 1862 Langen', 53.6, 8.6);
    unifyGroups([a, b], teams({ 1: 3, 2: 2 }));
    expect(a.groupAction).toBe('conflict');
    expect(b.groupAction).toBe('conflict');
    expect(a.after).toMatchObject({ lat: 49.99 });
    expect(b.after).toMatchObject({ lat: 53.6 });
  });

  it('does not treat a shared hall as a reason to reject anything', () => {
    // Zwei Club-IDs desselben Vereins, gleiche Halle → beide behalten ihre Koordinate bzw. werden vereinheitlicht
    const a = res(1, 'Rostock Seawolves', 54.09, 12.10);
    const b = res(2, 'ROSTOCK SEAWOLVES', 54.09, 12.10);
    unifyGroups([a, b], teams({ 1: 5, 2: 1 }));
    expect(a.action === 'changed' || a.action === 'unchanged').toBe(true);
    expect(b.action === 'changed' || b.action === 'unchanged').toBe(true);
  });

  it('ignores single clubs and unsafe results', () => {
    const a = res(1, 'Einzelverein', 50, 8);
    const b = res(2, 'Foo', 50, 8, { confidence: 'low' });
    const c = res(3, 'Foo', 53, 10, { confidence: 'low' });
    unifyGroups([a, b, c], teams({}));
    expect(a.group).toBeNull();
    expect(b.groupAction).toBeNull();
    expect(c.after).toMatchObject({ lat: 53 });
  });
});
