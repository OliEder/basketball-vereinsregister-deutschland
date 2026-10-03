// crawler/extractor.ts
import { BbbLigaData, BbbTableEntry, ClubEntry, TeamEntry } from './types';

export const GENERIC_WORDS = new Set([
  'verein', 'turnverein', 'turngemeinde', 'turngemeine', 'sportverein', 'sportclub', 'sport-club', 'sports', 'club',
  'basketball', 'basketballteam', 'basketballclub', 'baskets', 'united', 'akademie', 'eagles', 'falcons', 'towers',
  'dragons', 'tigers', 'titans', 'giants', 'lakers', 'löwen', 'helden', 'keiler', 'scorpions', 'romans', 'bears',
  'bats', 'squirrels', 'sportgemeinschaft', 'sportgemeinde', 'turnerbund', 'turnerschaft', 'turnvereinigung'
]);

/** Übliche Vereinskürzel (zusätzlich zu allen Wörtern aus 2–6 Großbuchstaben wie SV, TSV, DJK, MTV). */
const CLUB_ABBREVIATIONS = new Set([
  'tus', 'tuspo', 'vfl', 'vfb', 'vfr', 'tsg', 'spvgg', 'spvg', 'sf', 'fsv', 'bsg', 'djk', 'post', 'polizei',
  'tura', 'turo', 'tb', 'tg', 'tv', 'sv', 'sc', 'sg', 'bg', 'bc', 'fc', 'bk', 'bv', 'ev'
]);

function isClubWord(word: string): boolean {
  const w = word.toLowerCase().replace(/[.,]/g, '');
  return w.length === 0 || w === 'von' || /^\d+$/.test(w) || w.startsWith('basketball') || w === 'baskets' || CLUB_ABBREVIATIONS.has(w) || GENERIC_WORDS.has(w) || /^[\p{Lu}]{2,6}$/u.test(word.replace(/[.,]/g, ''));
}

/** Entfernt Rechtsform, Gründungsjahr und Teamnummern am Ende ("TSV Calw von 1846 e. V." → "TSV Calw"). */
function stripSuffixes(name: string): string {
  let cleaned = name.trim();
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned
      .replace(/\s*\be\.?\s?V\.?(?:\s+\d{4})?$/i, '')
      .replace(/\s+von\s*\d{4}$/i, '')
      .replace(/\s+\d{4}$/, '')
      .replace(/\s+[\d]+\.?\s*(Mannschaft)?$/i, '')
      .replace(/\s*\([\d]+\)$/, '')
      .trim();
  } while (cleaned !== previous && cleaned.length > 0);
  return cleaned;
}

/** Ortszusätze wie "a.Rh." oder "a.d.Donau" gehören zum Ortsnamen und werden ausgeschrieben. */
const PLACE_QUALIFIERS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/^a\.\s?Rh\.?$/i, 'am Rhein'],
  [/^a\.\s?M\.?$/i, 'am Main'],
  [/^a\.\s?N\.?$/i, 'am Neckar'],
  [/^i\.\s?d\.\s?Opf\.?$/i, 'in der Oberpfalz'],
  [/^i\.\s?Br\.?$/i, 'im Breisgau'],
  [/^o\.\s?d\.\s?T\.?$/i, 'ob der Tauber'],
  [/^a\.\s?d\.\s?([A-ZÄÖÜ][\wäöüß]+)\.?$/i, m => `an der ${m[1]}`],
  [/^b\.\s?([A-ZÄÖÜ][\wäöüß]+)\.?$/i, m => `bei ${m[1]}`]
];

/** "Wörth a.Rh." → "Wörth_am_Rhein" (ein Token), damit Ort und Zusatz zusammenbleiben. */
function bindQualifiers(name: string): string {
  const words = name.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    // Zusatz kann in einem oder zwei Wörtern stehen ("a.d. Donau", "i. Br.")
    const tries = [words[i], words.slice(i, i + 2).join(' ')];
    let bound = false;
    for (let t = tries.length - 1; t >= 0 && !bound; t--) {
      for (const [re, rep] of PLACE_QUALIFIERS) {
        const m = tries[t].match(re);
        if (m && out.length > 0) {
          const full = typeof rep === 'string' ? rep : rep(m);
          out[out.length - 1] = `${out[out.length - 1]}_${full.replace(/ /g, '_')}`;
          i += t;
          bound = true;
          break;
        }
      }
    }
    if (!bound) out.push(words[i]);
  }
  return out.join(' ');
}

/**
 * Mögliche Ortsangaben aus dem Vereinsnamen, wahrscheinlichste zuerst.
 * Vereinskürzel (SV, TSV, DJK, MTV, TuS …), Rechtsformen und Allerweltswörter fallen weg; von hinten nach vorn
 * bleiben die übrigen Wörter. Bei Adjektivformen ("Eckernförder", "Barmstedter") folgen die Grundformen
 * ("Eckernförde", "Barmstedt"), die Nominatim eher kennt.
 */
export function cityCandidates(name: string): string[] {
  const cleaned = bindQualifiers(stripSuffixes(name));
  const words = cleaned.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (/\./.test(w)) continue; // Abkürzungen wie "a.Rh."
    const parts = w.split('-').filter(Boolean);
    // Vorangestellte Kürzel in Bindestrich-Wörtern fallen weg: "DJK-Köln-Ost" → "Köln-Ost"
    let i = 0;
    while (i < parts.length && isClubWord(parts[i])) i++;
    if (i < parts.length) kept.push(parts.slice(i).join('-'));
  }
  const out: string[] = [];
  const add = (w: string) => { const c = w.split('/')[0]; if (c.length >= 3 && !out.includes(c)) out.push(c); };
  for (const w of kept.slice().reverse()) {
    if (w.includes('_')) { add(w.replace(/_/g, ' ')); add(w.split('_')[0]); continue; } // "Wörth am Rhein", dann "Wörth"
    add(w);
    if (/er$/i.test(w) && w.length >= 6) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  }
  return out;
}

export function extractCityFromName(name: string): string {
  // Erste Ortsangabe ohne Kürzel; bleibt nichts übrig, gilt wie bisher das letzte Wort
  const first = cityCandidates(name)[0];
  if (first) return first;
  const words = stripSuffixes(name).split(/\s+/);
  return (words[words.length - 1] || name.trim()).split('/')[0];
}

export function extractClubs(
  entries: BbbTableEntry[],
  verbandId: number,
  verbandName: string
): ClubEntry[] {
  const seen = new Map<number, ClubEntry>();

  for (const entry of entries) {
    const { clubId, teamname, teamPermanentId } = entry.team;
    if (clubId === null || clubId === undefined) continue;  // Cup-Platzhalter ("Sieger X/Y")
    if (seen.has(clubId)) continue;

    seen.set(clubId, {
      clubId,
      name: teamname,
      verbandId,
      verbandName,
      lat: null,
      lng: null,
      geocodedFrom: extractCityFromName(teamname),
      logoUrl: `https://www.basketball-bund.net/media/team/${teamPermanentId}/logo`,
      lastCrawled: new Date().toISOString(),
      halls: [],
      teams: []
    });
  }

  return Array.from(seen.values());
}


/** Gebietsangaben der Liga; leere Werte und Platzhalter entfallen. */
export function regionFields(ligaData?: BbbLigaData | null): Pick<TeamEntry, 'ebene' | 'bezirk' | 'kreis'> {
  const clean = (v?: string | null) => {
    const t = v?.trim();
    return t ? t : undefined;
  };
  const out: Pick<TeamEntry, 'ebene' | 'bezirk' | 'kreis'> = {};
  const ebene = clean(ligaData?.skEbeneName);
  const bezirk = clean(ligaData?.bezirkName);
  const kreis = clean(ligaData?.kreisname);
  if (ebene) out.ebene = ebene;
  if (bezirk) out.bezirk = bezirk;
  if (kreis) out.kreis = kreis;
  return out;
}

export function extractTeams(
  entries: BbbTableEntry[],
  altersklasse: string,
  geschlecht: string,
  liga?: { ligaId: number; liganame: string; ligaData?: BbbLigaData | null }
): Map<number, TeamEntry[]> {
  const result = new Map<number, TeamEntry[]>();

  for (const entry of entries) {
    const { clubId, teamPermanentId } = entry.team;
    if (clubId === null || clubId === undefined) continue;

    if (!result.has(clubId)) result.set(clubId, []);
    const teams = result.get(clubId)!;

    if (!teams.some(t => t.teamPermanentId === teamPermanentId)) {
      teams.push({
        teamPermanentId,
        altersklasse,
        geschlecht,
        ...(liga ? { ligaId: liga.ligaId, liganame: liga.liganame, rang: entry.rang, ...regionFields(liga.ligaData) } : {}),
        training: []
      });
    }
  }

  return result;
}
