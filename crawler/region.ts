// crawler/region.ts
// Ortsvalidierung: Liegt eine Koordinate dort, wo der Verein spielt?
//
// Grundlage sind zwei Angaben, die schon in clubs.json stehen:
//  - die ersten zwei Ziffern der Vereinsnummer (01–16 = Landesverband),
//  - Bezirk und Kreis der Ligen, in denen die Teams spielen (ligaData der BBB-API).
// Aus den Vereinen mit verlässlicher Koordinate wird je Bezirk (und je Landesverband) ein
// Schwerpunkt (Median) samt typischer Streuung berechnet. Eine Koordinate, die weit außerhalb
// liegt, passt nicht zum Verein. Es braucht also keine Tabelle "Bezirk → Ort".
import { distanceKm } from './geo';
import { ClubEntry } from './types';

type Point = { lat: number; lng: number };

const STATES: Record<string, string> = {
  '01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Berlin', '04': 'Bremen', '05': 'Hamburg',
  '06': 'Hessen', '07': 'Niedersachsen', '08': 'Rheinland-Pfalz', '09': 'Saarland', '10': 'Schleswig-Holstein',
  '11': 'Nordrhein-Westfalen', '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen-Anhalt', '14': 'Brandenburg',
  '15': 'Sachsen', '16': 'Thüringen'
};

/**
 * Grober Mittelpunkt und größte Ausdehnung (km) je Bundesland. Fest hinterlegt, damit die Prüfung auch dann
 * greift, wenn die Koordinaten der Vergleichsvereine selbst noch fehlerhaft sind. Die Radien sind großzügig
 * (Randgebiete wie Sylt, Passau oder Bremerhaven müssen hineinpassen).
 */
const STATE_GEO: Record<string, { lat: number; lng: number; radiusKm: number }> = {
  '01': { lat: 48.66, lng: 9.35, radiusKm: 190 },   // Baden-Württemberg
  '02': { lat: 48.95, lng: 11.40, radiusKm: 290 },  // Bayern
  '03': { lat: 52.52, lng: 13.40, radiusKm: 55 },   // Berlin
  '04': { lat: 53.30, lng: 8.80, radiusKm: 75 },    // Bremen (mit Bremerhaven)
  '05': { lat: 53.55, lng: 9.99, radiusKm: 50 },    // Hamburg
  '06': { lat: 50.60, lng: 9.00, radiusKm: 150 },   // Hessen
  '07': { lat: 52.80, lng: 9.40, radiusKm: 250 },   // Niedersachsen
  '08': { lat: 49.90, lng: 7.50, radiusKm: 150 },   // Rheinland-Pfalz
  '09': { lat: 49.38, lng: 6.98, radiusKm: 55 },    // Saarland
  '10': { lat: 54.20, lng: 9.80, radiusKm: 170 },   // Schleswig-Holstein (mit Sylt)
  '11': { lat: 51.45, lng: 7.55, radiusKm: 170 },   // Nordrhein-Westfalen
  '12': { lat: 53.75, lng: 12.60, radiusKm: 190 },  // Mecklenburg-Vorpommern (mit Rügen)
  '13': { lat: 51.90, lng: 11.70, radiusKm: 150 },  // Sachsen-Anhalt
  '14': { lat: 52.40, lng: 13.20, radiusKm: 150 },  // Brandenburg
  '15': { lat: 51.05, lng: 13.40, radiusKm: 150 },  // Sachsen
  '16': { lat: 50.90, lng: 11.00, radiusKm: 110 }   // Thüringen
};

/** Landesverband aus der Vereinsnummer (nur 01–16; höhere Nummern sind Bundesliga, Regionalliga, Rollstuhl). */
export function stateOf(vereinsnummer?: string | null): string | null {
  const code = (vereinsnummer ?? '').slice(0, 2);
  return STATES[code] ? code : null;
}

export function stateName(code: string): string {
  return STATES[code] ?? code;
}

/** Häufigster Bezirk aus den Bezirks- und Kreisligen der Teams, sonst null. */
export function primaryBezirk(club: Pick<ClubEntry, 'teams'>): string | null {
  const count = new Map<string, number>();
  for (const t of club.teams ?? []) {
    if ((t.ebene === 'Bezirk' || t.ebene === 'Kreis') && t.bezirk) count.set(t.bezirk, (count.get(t.bezirk) ?? 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Group { center: Point; d50: number; d90: number; n: number }

function buildGroup(points: Point[]): Group {
  const center = { lat: median(points.map(p => p.lat)), lng: median(points.map(p => p.lng)) };
  const dists = points.map(p => distanceKm(center, p)).sort((a, b) => a - b);
  return { center, d50: median(dists), d90: dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.9))], n: points.length };
}

export interface RegionCheck {
  /** false nur, wenn die Region bekannt ist und die Koordinate deutlich außerhalb liegt */
  ok: boolean;
  level: 'bezirk' | 'state' | 'none';
  region: string | null;
  distanceKm: number | null;
  limitKm: number | null;
}

export interface RegionOptions {
  /** Mindestzahl Referenzvereine je Bezirk */
  minBezirk?: number;
  /** Untergrenze des erlaubten Abstands zum Schwerpunkt des Bezirks (km) */
  minLimitBezirkKm?: number;
  /** Erlaubter Abstand als Vielfaches des Median-Abstands bzw. des 90-%-Abstands; der größere Wert gilt */
  factorMedian?: number;
  factorP90?: number;
}

export class RegionIndex {
  private bezirke = new Map<string, Group>();
  private opt: Required<RegionOptions>;

  /**
   * @param clubs alle Vereine
   * @param isReference nur Vereine, deren Koordinate als verlässlich gilt, fließen in die Schwerpunkte ein
   */
  constructor(clubs: ClubEntry[], isReference: (c: ClubEntry) => boolean = () => true, options: RegionOptions = {}) {
    this.opt = {
      minBezirk: 4, minLimitBezirkKm: 40, factorMedian: 4, factorP90: 1.5,
      ...options
    };
    const byBezirk = new Map<string, Point[]>();
    for (const c of clubs) {
      if (c.lat == null || c.lng == null || !isReference(c)) continue;
      const st = stateOf(c.vereinsnummer);
      if (!st) continue;
      const p = { lat: c.lat, lng: c.lng };
      const b = primaryBezirk(c);
      if (b) byBezirk.set(`${st}|${b}`, [...(byBezirk.get(`${st}|${b}`) ?? []), p]);
    }
    for (const [k, pts] of byBezirk) if (pts.length >= this.opt.minBezirk) this.bezirke.set(k, buildGroup(pts));
  }

  check(club: Pick<ClubEntry, 'vereinsnummer' | 'teams'>, coord: Point): RegionCheck {
    const st = stateOf(club.vereinsnummer);
    if (!st) return { ok: true, level: 'none', region: null, distanceKm: null, limitKm: null };

    // 1. Bundesland: fester Mittelpunkt und Radius, unabhängig von der Datenqualität
    const geo = STATE_GEO[st];
    const dState = distanceKm(geo, coord);
    if (dState > geo.radiusKm) {
      return { ok: false, level: 'state', region: stateName(st), distanceKm: Math.round(dState), limitKm: geo.radiusKm };
    }

    // 2. Bezirk: Schwerpunkt der Vereine mit verlässlicher Koordinate; die Grenze folgt der tatsächlichen Streuung
    const b = primaryBezirk(club);
    const bg = b ? this.bezirke.get(`${st}|${b}`) : undefined;
    if (bg) {
      const d = distanceKm(bg.center, coord);
      const limit = Math.max(this.opt.minLimitBezirkKm, this.opt.factorMedian * bg.d50, this.opt.factorP90 * bg.d90);
      return { ok: d <= limit, level: 'bezirk', region: `${stateName(st)} / ${b}`, distanceKm: Math.round(d), limitKm: Math.round(limit) };
    }
    return { ok: true, level: 'state', region: stateName(st), distanceKm: Math.round(dState), limitKm: geo.radiusKm };
  }
}
