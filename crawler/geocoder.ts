// crawler/geocoder.ts
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100;

type FetchFn = (url: string, options?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName?: string;
  /** Ort/Gemeinde laut Nominatim-Adresse (addressdetails), falls vorhanden */
  city?: string;
}

type NominatimAddress = Record<string, string | undefined>;

function cityOf(address?: NominatimAddress): string | undefined {
  if (!address) return undefined;
  return address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? address.suburb;
}

export async function geocodeCity(
  city: string,
  fetchFn: FetchFn = globalThis.fetch
): Promise<{ lat: number; lng: number } | null> {
  const hit = await geocodeDetailed(city, fetchFn);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** Wie geocodeCity, liefert zusätzlich den von Nominatim gefundenen Namen (zur Kontrolle). */
export async function geocodeDetailed(
  city: string,
  fetchFn: FetchFn = globalThis.fetch
): Promise<GeocodeHit | null> {
  await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=de&addressdetails=1`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' }
    });

    if (!response.ok) return null;

    const results = await response.json() as Array<{ lat: string; lon: string; display_name?: string; address?: NominatimAddress }>;
    if (!results || results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      displayName: results[0].display_name,
      city: cityOf(results[0].address)
    };
  } catch {
    return null;
  }
}
