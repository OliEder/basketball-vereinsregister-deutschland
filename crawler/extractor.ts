// crawler/extractor.ts
import { BbbTableEntry, ClubEntry, TeamEntry } from './types';

export function extractCityFromName(name: string): string {
  // Rechtsform, Gründungsjahr und Teamnummern am Ende entfernen, bis nichts mehr passt:
  // "TSV Calw von 1846 e. V." → "TSV Calw", "Bonn 2. Mannschaft" → "Bonn", "Berlin (1)" → "Berlin"
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
  const parts = (cleaned || name.trim()).split(/\s+/);
  const last = parts[parts.length - 1];
  // Schrägstrich-Orte: "Marburg/Keltern" → "Marburg"
  return last.split('/')[0];
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


export function extractTeams(
  entries: BbbTableEntry[],
  altersklasse: string,
  geschlecht: string,
  liga?: { ligaId: number; liganame: string }
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
        ...(liga ? { ligaId: liga.ligaId, liganame: liga.liganame, rang: entry.rang } : {}),
        training: []
      });
    }
  }

  return result;
}
