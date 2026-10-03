// crawler/geocoder.ts
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100;

type FetchFn = (url: string, options?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface GeocodeHit {
  lat: number;
  lng: number;
  displayName?: string;
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
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=de`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' }
    });

    if (!response.ok) return null;

    const results = await response.json() as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!results || results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      displayName: results[0].display_name
    };
  } catch {
    return null;
  }
}
