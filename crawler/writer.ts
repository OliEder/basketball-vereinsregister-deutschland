import fs from 'fs';
import path from 'path';
import { ClubEntry } from './types';

const DATA_PATH = path.join(__dirname, '..', 'data', 'clubs.json');

export function loadExistingClubs(): Map<number, ClubEntry> {
  if (!fs.existsSync(DATA_PATH)) return new Map();
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const clubs: ClubEntry[] = JSON.parse(raw);
  return new Map(clubs.map(c => [c.clubId, c]));
}

export function mergeAndWrite(newClubs: ClubEntry[]): void {
  const existing = loadExistingClubs();

  for (const club of newClubs) {
    existing.set(club.clubId, {
      ...(existing.get(club.clubId) ?? {}),
      ...club
    });
  }

  const sorted = Array.from(existing.values()).sort((a, b) => a.clubId - b.clubId);
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`clubs.json: ${sorted.length} Vereine gespeichert.`);
}
