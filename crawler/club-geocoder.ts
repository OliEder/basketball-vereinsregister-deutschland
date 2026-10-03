// crawler/club-geocoder.ts
// Ermittelt Vereinskoordinaten in Prioritätsreihenfolge:
//   1. Nominatim-Suche nach dem Vereinsnamen
//   2. Hallenadresse (Fallback)
//   3. Ortsname aus dem Vereinsnamen (geocodedFrom)
import { geocodeCity } from './geocoder';
import { ClubEntry } from './types';

type Coords = { lat: number; lng: number };
type GeocodeFn = (query: string) => Promise<Coords | null>;
export type GeocodeSource = 'name' | 'hall' | 'city';

export async function geocodeClub(
  club: ClubEntry,
  geocode: GeocodeFn = geocodeCity
): Promise<(Coords & { source: GeocodeSource }) | null> {
  const byName = await geocode(club.name.replace(/\be\.?\s?V\.?$/i, '').trim());
  if (byName) return { ...byName, source: 'name' };

  for (const hall of club.halls ?? []) {
    if (hall.lat != null && hall.lng != null) return { lat: hall.lat, lng: hall.lng, source: 'hall' };
    if (!hall.ort) continue;
    const query = [hall.strasse, hall.plz, hall.ort].filter(Boolean).join(', ');
    const byHall = await geocode(query);
    if (byHall) return { ...byHall, source: 'hall' };
  }

  if (club.geocodedFrom) {
    const byCity = await geocode(club.geocodedFrom);
    if (byCity) return { ...byCity, source: 'city' };
  }
  return null;
}
