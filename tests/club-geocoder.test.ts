import { geocodeClub } from '../crawler/club-geocoder';
import { ClubEntry } from '../crawler/types';

const base = { clubId: 1, name: 'FC ANADOLU BAYERN e.V.', geocodedFrom: 'Bayern', lat: null, lng: null } as unknown as ClubEntry;

describe('geocodeClub', () => {
  it('prefers the name search', async () => {
    const geocode = jest.fn().mockResolvedValueOnce({ lat: 1, lng: 2 });
    const r = await geocodeClub({ ...base, halls: [{ id: 1, ort: 'X' } as any] }, geocode);
    expect(r).toEqual({ lat: 1, lng: 2, source: 'name' });
    expect(geocode).toHaveBeenCalledWith('FC ANADOLU BAYERN');
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('falls back to hall address, then city', async () => {
    const geocode = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: 3, lng: 4 });
    const r = await geocodeClub({ ...base, halls: [{ id: 1, strasse: 'A 1', plz: '80331', ort: 'München' } as any] }, geocode);
    expect(r).toEqual({ lat: 3, lng: 4, source: 'hall' });
    expect(geocode).toHaveBeenLastCalledWith('A 1, 80331, München');

    const g2 = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ lat: 5, lng: 6 });
    expect(await geocodeClub({ ...base, halls: [] }, g2)).toEqual({ lat: 5, lng: 6, source: 'city' });
  });

  it('uses existing hall coordinates without another request', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(null);
    const r = await geocodeClub({ ...base, halls: [{ id: 1, lat: 7, lng: 8 } as any] }, geocode);
    expect(r).toEqual({ lat: 7, lng: 8, source: 'hall' });
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing matches', async () => {
    expect(await geocodeClub({ ...base, halls: [] }, jest.fn().mockResolvedValue(null))).toBeNull();
  });
});
