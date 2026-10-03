import { geocodeClub, isPlausibleNameHit, searchName } from '../crawler/club-geocoder';
import { ClubEntry } from '../crawler/types';

const base = { clubId: 1, name: 'FC ANADOLU BAYERN e.V.', geocodedFrom: 'e.V.', lat: null, lng: null } as unknown as ClubEntry;
const hit = (lat: number, lng: number, displayName = 'FC Anadolu Bayern, München') => ({ lat, lng, displayName });

describe('isPlausibleNameHit', () => {
  it('accepts hits containing the distinctive name words', () => {
    expect(isPlausibleNameHit('SV Eidelstedt e.V.', 'SV Eidelstedt von 1880 eV, Redingskamp, Hamburg')).toBe(true);
  });
  it('rejects unrelated hits', () => {
    expect(isPlausibleNameHit('BG Bodensee', 'Burg, Blättla, Ellhofen, Landkreis Lindau')).toBe(false);
    expect(isPlausibleNameHit('TV Altenstadt 1873 e.V.', 'TV Klein, Marktplatz, Vohenstrauß')).toBe(false);
  });
  it('rejects missing display name or names without distinctive words', () => {
    expect(isPlausibleNameHit('SV Eidelstedt', undefined)).toBe(false);
    expect(isPlausibleNameHit('TV 1881', 'TV 1881 Altdorf')).toBe(false);
  });
});

describe('searchName', () => {
  it('strips the legal form', () => {
    expect(searchName('FC ANADOLU BAYERN e.V.')).toBe('FC ANADOLU BAYERN');
    expect(searchName('TB Sigmaringen e. V.')).toBe('TB Sigmaringen');
  });
});

describe('geocodeClub', () => {
  it('prefers a plausible name hit', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(hit(1, 2));
    const r = await geocodeClub({ ...base, halls: [{ id: 1, ort: 'X' } as any] }, geocode);
    expect(r).toEqual({ lat: 1, lng: 2, source: 'name' });
    expect(geocode).toHaveBeenCalledWith('FC ANADOLU BAYERN');
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('ignores an implausible name hit and falls back to the hall address', async () => {
    const geocode = jest.fn()
      .mockResolvedValueOnce(hit(9, 9, 'Burg, Irgendwo'))
      .mockResolvedValueOnce(hit(3, 4, 'München'));
    const r = await geocodeClub({ ...base, halls: [{ id: 1, strasse: 'A 1', plz: '80331', ort: 'München' } as any] }, geocode);
    expect(r).toEqual({ lat: 3, lng: 4, source: 'hall' });
    expect(geocode).toHaveBeenLastCalledWith('A 1, 80331, München');
  });

  it('falls back to the repaired city from the club name, not geocodedFrom', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(hit(5, 6, 'Bayern'));
    const r = await geocodeClub({ ...base, halls: [] }, geocode);
    expect(r).toEqual({ lat: 5, lng: 6, source: 'city', geocodedFrom: 'BAYERN' });
    expect(geocode).toHaveBeenLastCalledWith('BAYERN');
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
