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

interface Group { center: Point; d50: number; n: number }

function buildGroup(points: Point[]): Group {
  const center = { lat: median(points.map(p => p.lat)), lng: median(points.map(p => p.lng)) };
  return { center, d50: median(points.map(p => distanceKm(center, p))), n: points.length };
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
  /** Mindestzahl Referenzvereine je Bezirk bzw. Landesverband */
  minBezirk?: number;
  minState?: number;
  /** Untergrenze des erlaubten Abstands zum Schwerpunkt (km) */
  minLimitBezirkKm?: number;
  minLimitStateKm?: number;
  /** Erlaubter Abstand als Vielfaches des typischen Abstands (Median) */
  factorBezirk?: number;
  factorState?: number;
}

export class RegionIndex {
  private bezirke = new Map<string, Group>();
  private states = new Map<string, Group>();
  private opt: Required<RegionOptions>;

  /**
   * @param clubs alle Vereine
   * @param isReference nur Vereine, deren Koordinate als verlässlich gilt, fließen in die Schwerpunkte ein
   */
  constructor(clubs: ClubEntry[], isReference: (c: ClubEntry) => boolean = () => true, options: RegionOptions = {}) {
    this.opt = {
      minBezirk: 4, minState: 6, minLimitBezirkKm: 40, minLimitStateKm: 100, factorBezirk: 4, factorState: 3,
      ...options
    };
    const byBezirk = new Map<string, Point[]>();
    const byState = new Map<string, Point[]>();
    for (const c of clubs) {
      if (c.lat == null || c.lng == null || !isReference(c)) continue;
      const st = stateOf(c.vereinsnummer);
      if (!st) continue;
      const p = { lat: c.lat, lng: c.lng };
      byState.set(st, [...(byState.get(st) ?? []), p]);
      const b = primaryBezirk(c);
      if (b) byBezirk.set(`${st}|${b}`, [...(byBezirk.get(`${st}|${b}`) ?? []), p]);
    }
    for (const [k, pts] of byBezirk) if (pts.length >= this.opt.minBezirk) this.bezirke.set(k, buildGroup(pts));
    for (const [k, pts] of byState) if (pts.length >= this.opt.minState) this.states.set(k, buildGroup(pts));
  }

  check(club: Pick<ClubEntry, 'vereinsnummer' | 'teams'>, coord: Point): RegionCheck {
    const st = stateOf(club.vereinsnummer);
    if (!st) return { ok: true, level: 'none', region: null, distanceKm: null, limitKm: null };

    const b = primaryBezirk(club);
    const bg = b ? this.bezirke.get(`${st}|${b}`) : undefined;
    if (bg) {
      const d = distanceKm(bg.center, coord);
      const limit = Math.max(this.opt.minLimitBezirkKm, this.opt.factorBezirk * bg.d50);
      return { ok: d <= limit, level: 'bezirk', region: `${stateName(st)} / ${b}`, distanceKm: Math.round(d), limitKm: Math.round(limit) };
    }
    const sg = this.states.get(st);
    if (sg) {
      const d = distanceKm(sg.center, coord);
      const limit = Math.max(this.opt.minLimitStateKm, this.opt.factorState * sg.d50);
      return { ok: d <= limit, level: 'state', region: stateName(st), distanceKm: Math.round(d), limitKm: Math.round(limit) };
    }
    return { ok: true, level: 'none', region: null, distanceKm: null, limitKm: null };
  }
}
