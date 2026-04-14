import fs from 'fs';
import path from 'path';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { ClubEntry, ClubEnriched, Hall, TeamEntry } from './types';

const DATA_PATH = path.join(__dirname, '..', 'data', 'clubs.json');
const ENRICHED_SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schemas', 'club-enriched.schema.json');
const CLUBS_SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schemas', 'clubs.schema.json');
const CLUB_SCHEMA_PATH = path.join(__dirname, '..', 'data', 'schemas', 'club.schema.json');

const ajv = new Ajv({ strict: false, allowUnionTypes: true });
addFormats(ajv);

function loadSchema(schemaPath: string) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
}

// Pre-load club schema so clubs.schema.json $ref resolves
const clubSchema = loadSchema(CLUB_SCHEMA_PATH);
ajv.addSchema(clubSchema);

const validateEnrichedSchema = ajv.compile(loadSchema(ENRICHED_SCHEMA_PATH));
const validateClubsSchema = ajv.compile(loadSchema(CLUBS_SCHEMA_PATH));

export function validateEnriched(entry: unknown): boolean {
  return validateEnrichedSchema(entry) as boolean;
}

export function validateClubs(clubs: unknown): boolean {
  return validateClubsSchema(clubs) as boolean;
}

export function mergeHalls(base: Hall[], enriched: Hall[]): Hall[] {
  const map = new Map<number | string, Hall>(base.map(h => [h.id, h]));
  for (const hall of enriched) {
    map.set(hall.id, { ...(map.get(hall.id) ?? {}), ...hall });
  }
  return Array.from(map.values());
}

export function mergeTeams(
  base: TeamEntry[],
  enriched: Array<{ teamPermanentId: number; training: TeamEntry['training'] }>
): TeamEntry[] {
  const enrichedMap = new Map(enriched.map(t => [t.teamPermanentId, t]));
  return base.map(team => {
    const e = enrichedMap.get(team.teamPermanentId);
    if (!e) return team;
    return { ...team, training: e.training };
  });
}

export function loadExistingClubs(): Map<number, ClubEntry> {
  if (!fs.existsSync(DATA_PATH)) return new Map();
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const clubs: ClubEntry[] = JSON.parse(raw);
  return new Map(clubs.map(c => [c.clubId, c]));
}

export function mergeAndWrite(newClubs: ClubEntry[]): void {
  const existing = loadExistingClubs();

  for (const club of newClubs) {
    const prev = existing.get(club.clubId);
    existing.set(club.clubId, {
      ...(prev ?? {}),
      ...club,
      halls: mergeHalls(prev?.halls ?? [], club.halls ?? []),
      teams: mergeTeams(prev?.teams ?? [], club.teams ?? [])
    });
  }

  const sorted = Array.from(existing.values()).sort((a, b) => a.clubId - b.clubId);
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`clubs.json: ${sorted.length} Vereine gespeichert.`);
}

export function loadAndValidateEnriched(enrichedPath: string): ClubEnriched[] {
  if (!fs.existsSync(enrichedPath)) return [];
  const raw: unknown[] = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
  const valid: ClubEnriched[] = [];
  for (const entry of raw) {
    if (validateEnriched(entry)) {
      valid.push(entry as ClubEnriched);
    } else {
      console.warn(`clubs-enriched.json: Ungültiger Eintrag übersprungen:`, validateEnrichedSchema.errors);
    }
  }
  return valid;
}
