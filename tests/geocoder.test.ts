// tests/geocoder.test.ts
import { geocodeCity } from '../crawler/geocoder';

describe('geocodeCity', () => {
  it('returns coordinates for known city', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ lat: '49.0134', lon: '12.1016' }])
    });

    const result = await geocodeCity('Regensburg', mockFetch as any);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(49.0134, 2);
    expect(result!.lng).toBeCloseTo(12.1016, 2);
  });

  it('returns null for unknown city', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([])
    });

    const result = await geocodeCity('Hinterdupfing', mockFetch as any);
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await geocodeCity('Regensburg', mockFetch as any);
    expect(result).toBeNull();
  });
});
