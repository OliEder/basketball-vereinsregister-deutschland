// crawler/club-geocoder.ts
// Ermittelt Vereinskoordinaten in Prioritätsreihenfolge:
//   1. Nominatim-Suche nach dem Vereinsnamen (nur plausible Treffer)
//   2. Heimhalle (Hallen-Algorithmus, siehe chooseHomeHall)
//   3. Ort aus dem Vereinsnamen
import { geocodeDetailed, GeocodeHit } from './geocoder';
import { extractCityFromName } from './extractor';
import { ClubEntry, Hall } from './types';

type Coords = { lat: number; lng: number };
type GeocodeFn = (query: string) => Promise<GeocodeHit | null>;
export type GeocodeSource = 'name' | 'hall' | 'city';
/** high: Name-Treffer oder eindeutige Heimhalle; low: Mehrheitsentscheidung oder reiner Ortsname */
export type Confidence = 'high' | 'low';

export interface ClubGeocode extends Coords {
  source: GeocodeSource;
  confidence: Confidence;
  /** Ortsbezeichnung für die Anzeige; null, wenn nichts Brauchbares gefunden wurde */
  geocodedFrom: string | null;
}

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

const GENERIC_WORDS = new Set([
  'verein', 'turnverein', 'turngemeinde', 'turngemeine', 'sportverein', 'sportclub', 'sport-club', 'sports', 'club',
  'basketball', 'basketballteam', 'basketballclub', 'baskets', 'united', 'akademie', 'eagles', 'falcons', 'towers',
  'dragons', 'tigers', 'titans', 'giants', 'lakers', 'löwen', 'helden', 'keiler', 'scorpions', 'romans', 'bears',
  'bats', 'squirrels', 'sportgemeinschaft', 'sportgemeinde', 'turnerbund', 'turnerschaft', 'turnvereinigung'
]);

/** Taugt ein Wort als Ortsbezeichnung? (nicht: Kürzel, Zahlen, Rechtsformen, Allerweltswörter) */
export function isSaneCityLabel(label?: string | null): boolean {
  if (!label) return false;
  const l = label.trim();
  if (l.length < 4) return false;
  if (/\d/.test(l)) return false;
  if (/^[\p{Lu}]{2,6}$/u.test(l)) return false; // Kürzel wie ATSV, BISSV
  if (/^[`'"„“]/.test(l) || /["'`“”]$/.test(l)) return false;
  if (/^v\.?$/i.test(l)) return false;
  return !GENERIC_WORDS.has(l.toLowerCase());
}

/** Erster Bestandteil des Hallenorts, z. B. "Gießen-Kleinlinden" → "gießen". */
function baseOrt(ort: string): string {
  return ort.toLowerCase().split(/[\s\-/(]/)[0];
}

export type HomeHallConfidence = 'single' | 'name' | 'majority';

/**
 * Bestimmt die Heimhalle eines Vereins:
 *  1. Alle Hallen im selben Ort → diese.
 *  2. Der Vereinsname enthält einen Hallenort → Hallen dieses Ortes (bei mehreren: der mit dem meisten Gewicht).
 *  3. Sonst der Ort mit dem größten Gewicht (Anzahl Heimspiele `games`, ersatzweise 1 je Halle);
 *     bei Gleichstand: unklar → null.
 */
export function chooseHomeHall(club: Pick<ClubEntry, 'name' | 'halls'>): { hall: Hall; confidence: HomeHallConfidence } | null {
  const halls = (club.halls ?? []).filter(h => h.ort);
  if (halls.length === 0) return null;

  const weight = (h: Hall) => (typeof (h as any).games === 'number' ? (h as any).games : 1);
  const groups = new Map<string, Hall[]>();
  for (const h of halls) {
    const key = baseOrt(h.ort!);
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const best = (hs: Hall[]) => hs.slice().sort((a, b) => weight(b) - weight(a) || Number(!!b.strasse) - Number(!!a.strasse))[0];
  const total = (hs: Hall[]) => hs.reduce((sum, h) => sum + weight(h), 0);

  if (groups.size === 1) return { hall: best(halls), confidence: 'single' };

  const nameLower = club.name.toLowerCase();
  const named = [...groups.entries()].filter(([key]) => key.length >= 4 && nameLower.includes(key));
  if (named.length > 0) {
    named.sort((a, b) => total(b[1]) - total(a[1]));
    return { hall: best(named[0][1]), confidence: 'name' };
  }

  const ranked = [...groups.values()].sort((a, b) => total(b) - total(a));
  if (total(ranked[0]) > total(ranked[1])) return { hall: best(ranked[0]), confidence: 'majority' };
  return null;
}

export async function geocodeClub(
  club: ClubEntry,
  geocode: GeocodeFn = geocodeDetailed
): Promise<ClubGeocode | null> {
  const home = chooseHomeHall(club);
  const extracted = extractCityFromName(club.name);
  const fallbackLabel = home?.hall.ort ?? (isSaneCityLabel(extracted) ? extracted : null);

  // 1. Namenssuche (OpenStreetMap)
  const byName = await geocode(searchName(club.name));
  if (byName && isPlausibleNameHit(club.name, byName.displayName)) {
    return { lat: byName.lat, lng: byName.lng, source: 'name', confidence: 'high', geocodedFrom: byName.city ?? fallbackLabel };
  }

  // 2. Heimhalle
  if (home) {
    const hall = home.hall;
    let coords: Coords | null = hall.lat != null && hall.lng != null ? { lat: hall.lat, lng: hall.lng } : null;
    if (!coords) {
      const query = [hall.strasse, hall.plz, hall.ort].filter(Boolean).join(', ');
      const byHall = await geocode(query);
      if (byHall) coords = { lat: byHall.lat, lng: byHall.lng };
    }
    if (coords) {
      return { ...coords, source: 'hall', confidence: home.confidence === 'majority' ? 'low' : 'high', geocodedFrom: hall.ort ?? null };
    }
  }

  // 3. Ort aus dem Namen (nur wenn er als Ort taugt)
  if (isSaneCityLabel(extracted)) {
    const byCity = await geocode(extracted);
    if (byCity) return { lat: byCity.lat, lng: byCity.lng, source: 'city', confidence: 'low', geocodedFrom: extracted };
  }
  return null;
}
