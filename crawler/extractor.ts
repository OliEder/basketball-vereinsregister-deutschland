// crawler/extractor.ts
import { BbbTableEntry, ClubEntry } from './types';

export function extractCityFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
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
