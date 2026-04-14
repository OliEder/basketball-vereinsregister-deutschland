// crawler/extractor.ts
import { BbbTableEntry, ClubEntry } from './types';

export function extractCityFromName(name: string): string {
  // Teamnummern und Klammern am Ende entfernen: "Bonn 2", "Berlin (1)", "Bonn 2. Mannschaft"
  const cleaned = name.trim().replace(/\s+[\d]+\.?\s*(Mannschaft)?$/i, '').replace(/\s*\([\d]+\)$/, '').trim();
  const parts = cleaned.split(/\s+/);
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
      lastCrawled: new Date().toISOString()
    });
  }

  return Array.from(seen.values());
}
