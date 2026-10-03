import { classify, distanceKm } from '../crawler/check-geocoding';

describe('check-geocoding', () => {
  it('computes distance between München and Berlin (~504 km)', () => {
    expect(distanceKm({ lat: 48.1351, lng: 11.582 }, { lat: 52.52, lng: 13.405 })).toBeGreaterThan(495);
    expect(distanceKm({ lat: 48.1351, lng: 11.582 }, { lat: 52.52, lng: 13.405 })).toBeLessThan(515);
  });

  it('classifies match, deviation, no-result and no-current', () => {
    const cur = { lat: 48.1, lng: 11.5 };
    expect(classify(cur, { lat: 48.11, lng: 11.51 }, 5).status).toBe('match');
    expect(classify(cur, { lat: 52.5, lng: 13.4 }, 5).status).toBe('deviation');
    expect(classify(cur, null, 5)).toEqual({ status: 'no-result', distanceKm: null });
    expect(classify({ lat: null, lng: null }, { lat: 1, lng: 2 }, 5).status).toBe('no-current');
  });
});
