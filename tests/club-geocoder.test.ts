import { chooseHomeHall, geocodeClub, isPlausibleNameHit, isSaneCityLabel, searchName } from '../crawler/club-geocoder';
import { ClubEntry } from '../crawler/types';

const base = { clubId: 1, name: 'FC ANADOLU BAYERN e.V.', geocodedFrom: 'e.V.', lat: null, lng: null } as unknown as ClubEntry;
const hit = (lat: number, lng: number, displayName = 'FC Anadolu Bayern, München', city?: string) => ({ lat, lng, displayName, city });
const hall = (id: number, ort: string, extra: any = {}) => ({ id, dbbSpielfeldId: id, bezeichnung: `Halle ${id}`, strasse: 'Weg 1', plz: '80331', ort, ...extra });

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

describe('searchName / isSaneCityLabel', () => {
  it('strips the legal form', () => {
    expect(searchName('FC ANADOLU BAYERN e.V.')).toBe('FC ANADOLU BAYERN');
    expect(searchName('TB Sigmaringen e. V.')).toBe('TB Sigmaringen');
  });
  it('accepts places and rejects abbreviations, numbers and generic words', () => {
    for (const ok of ['Calw', 'Gießen-Kleinlinden', 'Neustadt a. d. Waldnaab']) expect(isSaneCityLabel(ok)).toBe(true);
    for (const bad of ['SG', 'TV', 'v.', '92', 'ATSV', 'Sportverein', 'Baskets', 'Turngemeinde', "'91", '', null]) {
      expect(isSaneCityLabel(bad as any)).toBe(false);
    }
  });
});

describe('chooseHomeHall', () => {
  it('uses the only place when all halls are in the same place', () => {
    const r = chooseHomeHall({ name: 'X', halls: [hall(1, 'Ludwigsburg'), hall(2, 'Ludwigsburg')] } as any);
    expect(r?.confidence).toBe('single');
    expect(r?.hall.ort).toBe('Ludwigsburg');
  });
  it('prefers the place that appears in the club name', () => {
    const r = chooseHomeHall({ name: 'TSV Laupheim 1862 e. V.', halls: [hall(1, 'Überlingen'), hall(2, 'Ulm-Söflingen'), hall(3, 'Laupheim')] } as any);
    expect(r).toMatchObject({ confidence: 'name' });
    expect(r?.hall.ort).toBe('Laupheim');
  });
  it('takes the majority, weighted by games, and returns null on a tie', () => {
    const halls = [hall(1, 'Aachen', { games: 12 }), hall(2, 'Bonn', { games: 3 }), hall(3, 'Bonn', { games: 4 })];
    expect(chooseHomeHall({ name: 'Foo', halls } as any)).toMatchObject({ confidence: 'majority' });
    expect(chooseHomeHall({ name: 'Foo', halls: [hall(1, 'Aachen'), hall(2, 'Bonn')] } as any)).toBeNull();
  });
  it('treats districts of one place as the same place', () => {
    const r = chooseHomeHall({ name: 'Foo', halls: [hall(1, 'Gießen'), hall(2, 'Gießen-Kleinlinden')] } as any);
    expect(r?.confidence).toBe('single');
  });
  it('returns null without halls', () => {
    expect(chooseHomeHall({ name: 'Foo', halls: [] } as any)).toBeNull();
  });
});

describe('geocodeClub', () => {
  it('prefers a plausible name hit and labels it with the place from the address', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(hit(1, 2, undefined, 'München'));
    const r = await geocodeClub({ ...base, halls: [hall(1, 'X')] }, geocode);
    expect(r).toEqual({ lat: 1, lng: 2, source: 'name', confidence: 'high', geocodedFrom: 'München' });
    expect(geocode).toHaveBeenCalledWith('FC ANADOLU BAYERN');
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('falls back to the home hall when the name hit is implausible', async () => {
    const geocode = jest.fn()
      .mockResolvedValueOnce(hit(9, 9, 'Burg, Irgendwo'))
      .mockResolvedValueOnce(hit(3, 4, 'München'));
    const r = await geocodeClub({ ...base, halls: [hall(1, 'München')] }, geocode);
    expect(r).toEqual({ lat: 3, lng: 4, source: 'hall', confidence: 'high', geocodedFrom: 'München' });
    expect(geocode).toHaveBeenLastCalledWith('Weg 1, 80331, München');
  });

  it('marks a majority decision as low confidence', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(hit(3, 4));
    const r = await geocodeClub({ ...base, name: 'Foo', halls: [hall(1, 'Aachen', { games: 9 }), hall(2, 'Bonn', { games: 1 })] } as any, geocode);
    expect(r).toMatchObject({ source: 'hall', confidence: 'low', geocodedFrom: 'Aachen' });
  });

  it('uses existing hall coordinates without another request', async () => {
    const geocode = jest.fn().mockResolvedValueOnce(null);
    const r = await geocodeClub({ ...base, halls: [hall(1, 'Ulm', { lat: 7, lng: 8 })] }, geocode);
    expect(r).toMatchObject({ lat: 7, lng: 8, source: 'hall' });
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('falls back to the repaired city from the name, but not to abbreviations', async () => {
    const g1 = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(hit(5, 6, 'Calw'));
    expect(await geocodeClub({ ...base, name: 'TSV Calw von 1846 e. V.', halls: [] } as any, g1))
      .toEqual({ lat: 5, lng: 6, source: 'city', confidence: 'low', geocodedFrom: 'Calw' });
    expect(g1).toHaveBeenLastCalledWith('Calw');

    const g2 = jest.fn().mockResolvedValue(null);
    expect(await geocodeClub({ ...base, name: 'Altrahlstedter MTV 1893 e. V', halls: [] } as any, g2)).toBeNull();
    expect(g2).toHaveBeenCalledTimes(1); // nur die Namenssuche, "MTV" wird nicht geocodet
  });

  it('returns null when nothing matches', async () => {
    expect(await geocodeClub({ ...base, halls: [] }, jest.fn().mockResolvedValue(null))).toBeNull();
  });
});
