// crawler/club-geocoder.ts
// Ermittelt Vereinskoordinaten in Prioritätsreihenfolge:
//   1. Nominatim-Suche nach dem Vereinsnamen (nur plausible Treffer)
//   2. Hallenadresse (Fallback)
//   3. Ortsname aus dem Vereinsnamen (geocodedFrom)
import { geocodeDetailed, GeocodeHit } from './geocoder';
import { extractCityFromName } from './extractor';
import { ClubEntry } from './types';

type Coords = { lat: number; lng: number };
type GeocodeFn = (query: string) => Promise<GeocodeHit | null>;
export type GeocodeSource = 'name' | 'hall' | 'city';

/** Vereinsname ohne Rechtsform ("e.V."), wie er für die Namenssuche verwendet wird. */
export function searchName(name: string): string {
  return name.replace(/\s*\be\.?\s?V\.?$/i, '').trim();
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\be\.?\s?v\.?(?=\s|$)/g, ' ')
    .replace(/\d{4}/g, ' ')
    .replace(/[^a-zäöüß ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && w !== 'von');
}

/**
 * Ein Namenstreffer gilt als plausibel, wenn mindestens die Hälfte der markanten Wörter
 * des Vereinsnamens im gefundenen Eintrag vorkommt (verhindert z. B. "Burg, Adelebsen").
 */
export function isPlausibleNameHit(clubName: string, displayName?: string): boolean {
  if (!displayName) return false;
  const tokens = nameTokens(clubName);
  if (tokens.length === 0) return false;
  const d = displayName.toLowerCase();
  return tokens.filter(t => d.includes(t)).length >= Math.ceil(tokens.length / 2);
}

export async function geocodeClub(
  club: ClubEntry,
  geocode: GeocodeFn = geocodeDetailed
): Promise<(Coords & { source: GeocodeSource; geocodedFrom?: string }) | null> {
  const byName = await geocode(searchName(club.name));
  if (byName && isPlausibleNameHit(club.name, byName.displayName)) {
    return { lat: byName.lat, lng: byName.lng, source: 'name' };
  }

  for (const hall of club.halls ?? []) {
    if (hall.lat != null && hall.lng != null) return { lat: hall.lat, lng: hall.lng, source: 'hall' };
    if (!hall.ort) continue;
    const query = [hall.strasse, hall.plz, hall.ort].filter(Boolean).join(', ');
    const byHall = await geocode(query);
    if (byHall) return { lat: byHall.lat, lng: byHall.lng, source: 'hall' };
  }

  const city = extractCityFromName(club.name);
  if (city) {
    const byCity = await geocode(city);
    if (byCity) return { lat: byCity.lat, lng: byCity.lng, source: 'city', geocodedFrom: city };
  }
  return null;
}
