# Vereinsregister Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue ein Monorepo mit Crawler, Express-API und Vanilla-Portal, das Basketballvereine aus der BBB-API harvested, als `clubs.json` speichert und per Namens- und Umkreissuche findbar macht.

**Architecture:** Der Crawler erntet Vereinsdaten indirekt aus Liga-Tabellen (BBB-API → `competition/table`), dedupliziert nach `clubId`, geocodiert via Nominatim und schreibt `data/clubs.json`. Die Express-API lädt beim Start `clubs.json` + `clubs-enriched.json`, mergt beide und bedient Such-Requests. Das Portal ist eine einzelne HTML-Seite mit Vanilla JS.

**Tech Stack:** Node.js 22, TypeScript, Express 4, node-fetch, Fuse.js (Fuzzy-Suche), Jest (Tests)

---

## File Map

| Datei | Verantwortung |
|---|---|
| `package.json` | Monorepo-Scripts, alle Dependencies |
| `tsconfig.json` | TypeScript-Konfiguration |
| `data/clubs.json` | Auto-generierte Vereinsdaten (Crawler-Output) |
| `data/clubs-enriched.json` | Manuell gepflegte Anreicherungen |
| `crawler/types.ts` | Shared TypeScript-Interfaces |
| `crawler/bbb-client.ts` | HTTP-Calls gegen BBB-API mit Rate-Limiting |
| `crawler/extractor.ts` | Vereinsdaten aus API-Responses extrahieren |
| `crawler/geocoder.ts` | Ortsname → lat/lng via Nominatim |
| `crawler/writer.ts` | clubs.json lesen/schreiben/mergen |
| `crawler/index.ts` | Orchestrierung des gesamten Crawl-Prozesses |
| `api/types.ts` | API-spezifische TypeScript-Interfaces |
| `api/search-engine.ts` | Fuzzy-Suche (Fuse.js) + Haversine-Umkreis |
| `api/routes/search.ts` | Express-Router für /search und /clubs/:id |
| `api/server.ts` | Express-App setup + /health Endpunkt |
| `portal/index.html` | Einzelne HTML-Seite |
| `portal/style.css` | Mobile-first CSS |
| `portal/app.js` | Fetch-Logik, UI-Rendering via DOM-API |
| `tests/extractor.test.ts` | Unit-Tests für Extractor |
| `tests/search-engine.test.ts` | Unit-Tests für Such-Engine |
| `tests/geocoder.test.ts` | Unit-Tests für Geocoder |

---

## Task 1: Projekt-Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `data/clubs-enriched.json`
- Create: `.gitignore`

- [ ] **Schritt 1: package.json anlegen**

```json
{
  "name": "vereinsregister",
  "version": "1.0.0",
  "scripts": {
    "crawl": "npx ts-node crawler/index.ts",
    "api": "npx ts-node api/server.ts",
    "test": "npx jest --runInBand",
    "test:watch": "npx jest --watch"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^3.3.2",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.3",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.ts"]
  }
}
```

- [ ] **Schritt 2: tsconfig.json anlegen**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./",
    "skipLibCheck": true
  },
  "include": ["crawler/**/*", "api/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "portal"]
}
```

- [ ] **Schritt 3: Leere clubs-enriched.json anlegen**

```json
[]
```

- [ ] **Schritt 4: .gitignore anlegen**

```
node_modules/
dist/
data/clubs.json
```

Hinweis: `clubs.json` wird nicht committed — sie ist Crawler-Output. `clubs-enriched.json` wird committed.

- [ ] **Schritt 5: Dependencies installieren**

```bash
cd /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/03-Vereinsregister
npm install
```

Expected: `node_modules/` erstellt, kein Fehler.

- [ ] **Schritt 6: Commit**

```bash
git init
git add package.json tsconfig.json data/clubs-enriched.json .gitignore
git commit -m "chore: project setup with dependencies"
```

---

## Task 2: Shared Types

**Files:**
- Create: `crawler/types.ts`

- [ ] **Schritt 1: Types definieren**

```typescript
// crawler/types.ts

export interface ClubEntry {
  clubId: number;
  name: string;
  verbandId: number;
  verbandName: string;
  lat: number | null;
  lng: number | null;
  geocodedFrom: string | null;
  logoUrl: string | null;
  lastCrawled: string;
}

export interface ClubEnriched {
  clubId: number;
  logoUrl?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
  };
  info?: string;
}

export interface MergedClub extends ClubEntry {
  logoUrl: string | null;
  website?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
  };
  info?: string;
}

// BBB-API Response-Typen
export interface BbbVerband {
  id: number;
  label: string;
  hits: number;
}

export interface BbbLiga {
  ligaId: number;
  liganame: string;
  verbandId: number;
  verbandName: string;
}

export interface BbbTeam {
  seasonTeamId: number;
  teamPermanentId: number;
  teamname: string;
  teamnameSmall: string;
  clubId: number;
}

export interface BbbTableEntry {
  rang: number;
  team: BbbTeam;
}
```

- [ ] **Schritt 2: Commit**

```bash
git add crawler/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: BBB-Client

**Files:**
- Create: `crawler/bbb-client.ts`
- Create: `tests/bbb-client.test.ts`

Der Client kapselt alle HTTP-Calls gegen die BBB-API inkl. Rate-Limiting (1 req/sek).

- [ ] **Schritt 1: Failing test schreiben**

```typescript
// tests/bbb-client.test.ts
import { BbbClient } from '../crawler/bbb-client';

describe('BbbClient', () => {
  it('extracts verbaende from wam data', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          verbaende: [{ id: 2, label: 'Bayern', hits: 374 }]
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getVerbaende();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].label).toBe('Bayern');
  });

  it('returns ligen for a verband', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          ligen: [{ ligaId: 51933, liganame: 'Bayernliga', verbandId: 2, verbandName: 'Bayern' }],
          hasMoreData: false,
          startAtIndex: 0,
          size: 1
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getLigen(2, 0);
    expect(result.ligen).toHaveLength(1);
    expect(result.ligen[0].ligaId).toBe(51933);
    expect(result.hasMoreData).toBe(false);
  });

  it('returns table entries for a liga', async () => {
    const client = new BbbClient();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '0',
        data: {
          tabelle: {
            entries: [{
              rang: 1,
              team: {
                seasonTeamId: 429406,
                teamPermanentId: 163077,
                teamname: 'SYNTAINICS MBC',
                teamnameSmall: 'MBC',
                clubId: 1977
              }
            }]
          }
        }
      })
    });
    (client as any).fetch = mockFetch;

    const result = await client.getTable(51933);
    expect(result).toHaveLength(1);
    expect(result[0].team.clubId).toBe(1977);
  });
});
```

- [ ] **Schritt 2: Test ausführen — muss FAIL**

```bash
npx jest tests/bbb-client.test.ts --no-coverage
```

Expected: `Cannot find module '../crawler/bbb-client'`

- [ ] **Schritt 3: BbbClient implementieren**

```typescript
// crawler/bbb-client.ts
import fetch from 'node-fetch';
import { BbbVerband, BbbLiga, BbbTableEntry } from './types';

const BBB_BASE = 'https://www.basketball-bund.net/rest';
const RATE_LIMIT_MS = 1100;

export class BbbClient {
  private fetch = fetch;

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)',
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> ?? {})
      }
    });
    if (!response.ok) {
      throw new Error(`BBB API error: ${response.status} ${url}`);
    }
    const data = await response.json() as any;
    if (data.status !== '0') {
      throw new Error(`BBB API returned error status: ${data.message}`);
    }
    return data as T;
  }

  async getVerbaende(): Promise<BbbVerband[]> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.request<{ data: { verbaende: BbbVerband[] } }>(
      `${BBB_BASE}/wam/data`,
      {
        method: 'POST',
        body: JSON.stringify({ token: 0, verbandIds: [], gebietIds: [], ligatypIds: [], akgGeschlechtIds: [], altersklasseIds: [], spielklasseIds: [] })
      }
    );
    return data.data.verbaende;
  }

  async getLigen(verbandId: number, startAtIndex: number): Promise<{ ligen: BbbLiga[]; hasMoreData: boolean }> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.request<{ data: { ligen: BbbLiga[]; hasMoreData: boolean } }>(
      `${BBB_BASE}/wam/liga/list?startAtIndex=${startAtIndex}`,
      {
        method: 'POST',
        body: JSON.stringify({ token: 0, verbandIds: [verbandId], gebietIds: [], ligatypIds: [], akgGeschlechtIds: [], altersklasseIds: [], spielklasseIds: [] })
      }
    );
    return { ligen: data.data.ligen, hasMoreData: data.data.hasMoreData };
  }

  async getTable(ligaId: number): Promise<BbbTableEntry[]> {
    await this.sleep(RATE_LIMIT_MS);
    const data = await this.request<{ data: { tabelle: { entries: BbbTableEntry[] } } }>(
      `${BBB_BASE}/competition/table/id/${ligaId}`
    );
    return data.data.tabelle?.entries ?? [];
  }
}
```

- [ ] **Schritt 4: Tests ausführen — müssen PASS**

```bash
npx jest tests/bbb-client.test.ts --no-coverage
```

Expected: 3 passed

- [ ] **Schritt 5: Commit**

```bash
git add crawler/bbb-client.ts tests/bbb-client.test.ts
git commit -m "feat: add BBB API client with rate limiting"
```

---

## Task 4: Extractor

**Files:**
- Create: `crawler/extractor.ts`
- Create: `tests/extractor.test.ts`

- [ ] **Schritt 1: Failing test schreiben**

```typescript
// tests/extractor.test.ts
import { extractClubs, extractCityFromName } from '../crawler/extractor';
import { BbbTableEntry } from '../crawler/types';

const makeEntry = (clubId: number, teamname: string, teamPermanentId: number): BbbTableEntry => ({
  rang: 1,
  team: { seasonTeamId: 1, teamPermanentId, teamname, teamnameSmall: '', clubId }
});

describe('extractCityFromName', () => {
  it('returns last word as city', () => {
    expect(extractCityFromName('Fibalon Baskets Regensburg')).toBe('Regensburg');
  });

  it('handles single word', () => {
    expect(extractCityFromName('München')).toBe('München');
  });
});

describe('extractClubs', () => {
  it('deduplicates by clubId', () => {
    const entries = [
      makeEntry(428, 'Fibalon Baskets Regensburg', 1001),
      makeEntry(428, 'Fibalon Baskets Regensburg U16', 1002),
      makeEntry(999, 'Bayern Baskets München', 2001),
    ];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs).toHaveLength(2);
    expect(clubs.map(c => c.clubId)).toContain(428);
    expect(clubs.map(c => c.clubId)).toContain(999);
  });

  it('sets logoUrl from teamPermanentId', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].logoUrl).toBe('https://www.basketball-bund.net/media/team/1001/logo');
  });

  it('sets verbandId and verbandName', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].verbandId).toBe(2);
    expect(clubs[0].verbandName).toBe('Bayern');
  });

  it('sets geocodedFrom to extracted city', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].geocodedFrom).toBe('Regensburg');
  });
});
```

- [ ] **Schritt 2: Test ausführen — muss FAIL**

```bash
npx jest tests/extractor.test.ts --no-coverage
```

Expected: `Cannot find module '../crawler/extractor'`

- [ ] **Schritt 3: Extractor implementieren**

```typescript
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
```

- [ ] **Schritt 4: Tests ausführen — müssen PASS**

```bash
npx jest tests/extractor.test.ts --no-coverage
```

Expected: 5 passed

- [ ] **Schritt 5: Commit**

```bash
git add crawler/extractor.ts tests/extractor.test.ts
git commit -m "feat: add club extractor with city heuristic"
```

---

## Task 5: Geocoder

**Files:**
- Create: `crawler/geocoder.ts`
- Create: `tests/geocoder.test.ts`

- [ ] **Schritt 1: Failing test schreiben**

```typescript
// tests/geocoder.test.ts
import { geocodeCity } from '../crawler/geocoder';

describe('geocodeCity', () => {
  it('returns coordinates for known city', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ lat: '49.0134', lon: '12.1016' }])
    });

    const result = await geocodeCity('Regensburg', mockFetch as any);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(49.0134, 2);
    expect(result!.lng).toBeCloseTo(12.1016, 2);
  });

  it('returns null for unknown city', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([])
    });

    const result = await geocodeCity('Hinterdupfing', mockFetch as any);
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await geocodeCity('Regensburg', mockFetch as any);
    expect(result).toBeNull();
  });
});
```

- [ ] **Schritt 2: Test ausführen — muss FAIL**

```bash
npx jest tests/geocoder.test.ts --no-coverage
```

Expected: `Cannot find module '../crawler/geocoder'`

- [ ] **Schritt 3: Geocoder implementieren**

```typescript
// crawler/geocoder.ts
import fetch from 'node-fetch';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100;

export async function geocodeCity(
  city: string,
  fetchFn: typeof fetch = fetch
): Promise<{ lat: number; lng: number } | null> {
  await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=de`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' }
    });

    if (!response.ok) return null;

    const results = await response.json() as Array<{ lat: string; lon: string }>;
    if (!results || results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon)
    };
  } catch {
    return null;
  }
}
```

- [ ] **Schritt 4: Tests ausführen — müssen PASS**

```bash
npx jest tests/geocoder.test.ts --no-coverage
```

Expected: 3 passed

- [ ] **Schritt 5: Commit**

```bash
git add crawler/geocoder.ts tests/geocoder.test.ts
git commit -m "feat: add Nominatim geocoder"
```

---

## Task 6: Writer

**Files:**
- Create: `crawler/writer.ts`

- [ ] **Schritt 1: Writer implementieren**

```typescript
// crawler/writer.ts
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
```

- [ ] **Schritt 2: Commit**

```bash
git add crawler/writer.ts
git commit -m "feat: add clubs.json writer with merge logic"
```

---

## Task 7: Crawler Orchestrator

**Files:**
- Create: `crawler/index.ts`

- [ ] **Schritt 1: Orchestrator implementieren**

```typescript
// crawler/index.ts
import { BbbClient } from './bbb-client';
import { extractClubs } from './extractor';
import { geocodeCity } from './geocoder';
import { mergeAndWrite, loadExistingClubs } from './writer';
import { ClubEntry } from './types';

async function crawl(): Promise<void> {
  const client = new BbbClient();
  const allClubs = new Map<number, ClubEntry>();

  console.log('Lade Verbände...');
  const verbaende = await client.getVerbaende();
  console.log(`${verbaende.length} Verbände gefunden.`);

  for (const verband of verbaende) {
    console.log(`\nVerband: ${verband.label} (${verband.id})`);
    let startAtIndex = 0;
    let hasMore = true;

    while (hasMore) {
      const { ligen, hasMoreData } = await client.getLigen(verband.id, startAtIndex);
      console.log(`  ${ligen.length} Ligen ab Index ${startAtIndex}`);

      for (const liga of ligen) {
        try {
          const entries = await client.getTable(liga.ligaId);
          const clubs = extractClubs(entries, verband.id, verband.label);
          for (const club of clubs) {
            if (!allClubs.has(club.clubId)) {
              allClubs.set(club.clubId, club);
            }
          }
        } catch (err) {
          console.warn(`  Tabelle für Liga ${liga.ligaId} nicht verfügbar: ${err}`);
        }
      }

      hasMore = hasMoreData;
      startAtIndex += ligen.length;
    }
  }

  console.log(`\n${allClubs.size} eindeutige Vereine gefunden. Starte Geocoding...`);

  const existing = loadExistingClubs();
  const toGeocode = Array.from(allClubs.values()).filter(club => {
    const ex = existing.get(club.clubId);
    return !ex || ex.lat === null;
  });

  console.log(`${toGeocode.length} Vereine werden geocodiert (${allClubs.size - toGeocode.length} haben bereits Koordinaten).`);

  let geocoded = 0;
  for (const club of toGeocode) {
    const coords = await geocodeCity(club.geocodedFrom ?? club.name);
    if (coords) {
      club.lat = coords.lat;
      club.lng = coords.lng;
      geocoded++;
    }
    if (geocoded % 10 === 0 && geocoded > 0) {
      console.log(`  ${geocoded}/${toGeocode.length} geocodiert...`);
    }
  }

  console.log(`\nGeocodierung abgeschlossen: ${geocoded}/${toGeocode.length} erfolgreich.`);
  mergeAndWrite(Array.from(allClubs.values()));
}

crawl().catch(err => {
  console.error('Crawl fehlgeschlagen:', err);
  process.exit(1);
});
```

- [ ] **Schritt 2: TypeScript-Compilation prüfen**

```bash
npx tsc --noEmit
```

Expected: Keine Fehler.

- [ ] **Schritt 3: Commit**

```bash
git add crawler/index.ts
git commit -m "feat: add crawler orchestrator"
```

---

## Task 8: Search Engine

**Files:**
- Create: `api/types.ts`
- Create: `api/search-engine.ts`
- Create: `tests/search-engine.test.ts`

- [ ] **Schritt 1: API Types definieren**

```typescript
// api/types.ts
import { MergedClub } from '../crawler/types';

export interface SearchResult extends MergedClub {
  distanceKm?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}
```

- [ ] **Schritt 2: Failing tests schreiben**

```typescript
// tests/search-engine.test.ts
import { SearchEngine } from '../api/search-engine';
import { MergedClub } from '../crawler/types';

const makeClub = (clubId: number, name: string, lat: number, lng: number): MergedClub => ({
  clubId,
  name,
  verbandId: 2,
  verbandName: 'Bayern',
  lat,
  lng,
  geocodedFrom: name.split(' ').pop() ?? null,
  logoUrl: null,
  lastCrawled: '2026-04-13T10:00:00Z'
});

const clubs: MergedClub[] = [
  makeClub(1, 'Fibalon Baskets Regensburg', 49.0134, 12.1016),
  makeClub(2, 'Bayern Baskets München', 48.1351, 11.5820),
  makeClub(3, 'Würzburg Baskets', 49.7944, 9.9294),
];

describe('SearchEngine.searchByName', () => {
  const engine = new SearchEngine(clubs);

  it('finds exact match', () => {
    const results = engine.searchByName('Regensburg');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
  });

  it('finds fuzzy match with typo', () => {
    const results = engine.searchByName('Regensbrug');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
  });

  it('returns empty for no match', () => {
    const results = engine.searchByName('xyzabcdef');
    expect(results).toHaveLength(0);
  });
});

describe('SearchEngine.searchByLocation', () => {
  const engine = new SearchEngine(clubs);

  it('finds clubs within radius', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 50);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clubId).toBe(1);
    expect(results[0].distanceKm).toBeCloseTo(0, 0);
  });

  it('excludes clubs outside radius', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 10);
    const clubIds = results.map(r => r.clubId);
    expect(clubIds).not.toContain(2);
  });

  it('sorts by distance ascending', () => {
    const results = engine.searchByLocation(49.0134, 12.1016, 500);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distanceKm!).toBeGreaterThanOrEqual(results[i - 1].distanceKm!);
    }
  });

  it('skips clubs without coordinates', () => {
    const clubsWithNull: MergedClub[] = [
      makeClub(1, 'Test Club', 49.0, 12.0),
      { ...makeClub(2, 'No Coords', 0, 0), lat: null, lng: null }
    ];
    const engine2 = new SearchEngine(clubsWithNull);
    const results = engine2.searchByLocation(49.0, 12.0, 100);
    expect(results.map(r => r.clubId)).not.toContain(2);
  });
});
```

- [ ] **Schritt 3: Test ausführen — muss FAIL**

```bash
npx jest tests/search-engine.test.ts --no-coverage
```

Expected: `Cannot find module '../api/search-engine'`

- [ ] **Schritt 4: SearchEngine implementieren**

```typescript
// api/search-engine.ts
import Fuse from 'fuse.js';
import { MergedClub } from '../crawler/types';
import { SearchResult } from './types';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class SearchEngine {
  private fuse: Fuse<MergedClub>;
  private clubs: MergedClub[];

  constructor(clubs: MergedClub[]) {
    this.clubs = clubs;
    this.fuse = new Fuse(clubs, {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true
    });
  }

  searchByName(query: string): SearchResult[] {
    return this.fuse.search(query).map(r => r.item);
  }

  searchByLocation(lat: number, lng: number, radiusKm: number): SearchResult[] {
    return this.clubs
      .filter(c => c.lat !== null && c.lng !== null)
      .map(c => ({
        ...c,
        distanceKm: Math.round(haversineKm(lat, lng, c.lat!, c.lng!) * 10) / 10
      }))
      .filter(c => c.distanceKm! <= radiusKm)
      .sort((a, b) => a.distanceKm! - b.distanceKm!);
  }

  searchCombined(query: string, lat: number, lng: number, radiusKm: number): SearchResult[] {
    const byLocation = this.searchByLocation(lat, lng, radiusKm);
    const locationIds = new Set(byLocation.map(c => c.clubId));
    const byName = this.searchByName(query).filter(c => locationIds.has(c.clubId));
    const distances = new Map(byLocation.map(c => [c.clubId, c.distanceKm]));
    return byName.map(c => ({ ...c, distanceKm: distances.get(c.clubId) }));
  }
}
```

- [ ] **Schritt 5: Tests ausführen — müssen PASS**

```bash
npx jest tests/search-engine.test.ts --no-coverage
```

Expected: 7 passed

- [ ] **Schritt 6: Commit**

```bash
git add api/types.ts api/search-engine.ts tests/search-engine.test.ts
git commit -m "feat: add search engine with fuzzy search and haversine"
```

---

## Task 9: Express API

**Files:**
- Create: `api/routes/search.ts`
- Create: `api/server.ts`

- [ ] **Schritt 1: Such-Router implementieren**

```typescript
// api/routes/search.ts
import { Router, Request, Response } from 'express';
import { SearchEngine } from '../search-engine';
import { geocodeCity } from '../../crawler/geocoder';
import { MergedClub } from '../../crawler/types';

export function createSearchRouter(clubs: MergedClub[]): Router {
  const router = Router();
  const engine = new SearchEngine(clubs);

  router.get('/search', async (req: Request, res: Response) => {
    const { name, near, radius } = req.query as Record<string, string>;
    const radiusKm = parseFloat(radius ?? '25');

    if (!name && !near) {
      res.status(400).json({ error: 'Parameter "name" oder "near" erforderlich.' });
      return;
    }

    try {
      let results;

      if (name && near) {
        const coords = await geocodeCity(near);
        if (!coords) {
          res.status(404).json({ error: `Ort "${near}" nicht gefunden.` });
          return;
        }
        results = engine.searchCombined(name, coords.lat, coords.lng, radiusKm);
      } else if (near) {
        const coords = await geocodeCity(near);
        if (!coords) {
          res.status(404).json({ error: `Ort "${near}" nicht gefunden.` });
          return;
        }
        results = engine.searchByLocation(coords.lat, coords.lng, radiusKm);
      } else {
        results = engine.searchByName(name!);
      }

      res.json({ results, total: results.length });
    } catch {
      res.status(500).json({ error: 'Interner Fehler bei der Suche.' });
    }
  });

  router.get('/clubs/:clubId', (req: Request, res: Response) => {
    const clubId = parseInt(req.params.clubId, 10);
    const club = clubs.find(c => c.clubId === clubId);
    if (!club) {
      res.status(404).json({ error: `Verein ${clubId} nicht gefunden.` });
      return;
    }
    res.json(club);
  });

  return router;
}
```

- [ ] **Schritt 2: Server implementieren**

```typescript
// api/server.ts
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ClubEntry, ClubEnriched, MergedClub } from '../crawler/types';
import { createSearchRouter } from './routes/search';

const PORT = process.env.PORT ?? 3000;
const CLUBS_PATH = path.join(__dirname, '..', 'data', 'clubs.json');
const ENRICHED_PATH = path.join(__dirname, '..', 'data', 'clubs-enriched.json');

function loadAndMerge(): MergedClub[] {
  if (!fs.existsSync(CLUBS_PATH)) {
    console.warn('clubs.json nicht gefunden. Bitte zuerst Crawler ausführen.');
    return [];
  }

  const base: ClubEntry[] = JSON.parse(fs.readFileSync(CLUBS_PATH, 'utf-8'));
  const enriched: ClubEnriched[] = fs.existsSync(ENRICHED_PATH)
    ? JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf-8'))
    : [];

  const enrichedMap = new Map(enriched.map(e => [e.clubId, e]));

  return base.map(club => ({
    ...club,
    ...(enrichedMap.get(club.clubId) ?? {})
  }));
}

const clubs = loadAndMerge();
const lastCrawled = clubs.length > 0
  ? clubs.reduce((latest, c) => c.lastCrawled > latest ? c.lastCrawled : latest, '')
  : null;

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use('/', createSearchRouter(clubs));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', clubCount: clubs.length, lastCrawled });
});

app.use(express.static(path.join(__dirname, '..', 'portal')));

app.listen(PORT, () => {
  console.log(`Vereinsregister API läuft auf http://localhost:${PORT}`);
  console.log(`${clubs.length} Vereine geladen.`);
});
```

- [ ] **Schritt 3: TypeScript-Compilation prüfen**

```bash
npx tsc --noEmit
```

Expected: Keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add api/routes/search.ts api/server.ts
git commit -m "feat: add Express API with search and health endpoints"
```

---

## Task 10: Portal

**Files:**
- Create: `portal/index.html`
- Create: `portal/style.css`
- Create: `portal/app.js`

Das Portal nutzt ausschließlich DOM-API-Methoden (`createElement`, `textContent`, `setAttribute`) — kein `innerHTML` mit externen Daten — um XSS zu vermeiden.

- [ ] **Schritt 1: HTML anlegen**

```html
<!-- portal/index.html -->
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Basketball Vereinsregister</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Basketball Vereinsregister</h1>
    <p>Finde einen Basketballverein in Deutschland</p>
  </header>

  <main>
    <section class="search-box">
      <div class="search-row">
        <input type="text" id="name-input" placeholder="Vereinsname suchen..." autocomplete="off">
        <button id="name-btn">Suchen</button>
      </div>

      <div class="divider">— oder —</div>

      <div class="search-row">
        <input type="text" id="near-input" placeholder="Mein Ort (z.B. Regensburg)">
        <select id="radius-select">
          <option value="10">10 km</option>
          <option value="25" selected>25 km</option>
          <option value="50">50 km</option>
          <option value="100">100 km</option>
        </select>
        <button id="near-btn">In der Nähe suchen</button>
      </div>
    </section>

    <section id="results">
      <p id="status-text"></p>
      <div id="results-list"></div>
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Schritt 2: CSS anlegen**

```css
/* portal/style.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f5f5;
  color: #333;
  line-height: 1.5;
}

header {
  background: #1a237e;
  color: white;
  padding: 1.5rem 1rem;
  text-align: center;
}

header h1 { font-size: 1.6rem; }
header p { opacity: 0.8; margin-top: 0.25rem; }

main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.search-box {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.search-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.search-row input {
  flex: 1;
  min-width: 200px;
  padding: 0.6rem 0.8rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.search-row select {
  padding: 0.6rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.search-row button {
  padding: 0.6rem 1.2rem;
  background: #1a237e;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  white-space: nowrap;
}

.search-row button:hover { background: #283593; }

.divider {
  text-align: center;
  color: #999;
  margin: 1rem 0;
  font-size: 0.9rem;
}

#results { margin-top: 1.5rem; }

#status-text {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.club-card {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.club-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 4px;
}

.club-logo-placeholder {
  width: 60px;
  height: 60px;
  background: #e0e0e0;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.club-info { flex: 1; min-width: 0; }
.club-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem; }
.club-meta { color: #666; font-size: 0.85rem; margin-bottom: 0.5rem; }
.club-links { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.club-links a { color: #1a237e; text-decoration: none; font-size: 0.9rem; }
.club-links a:hover { text-decoration: underline; }

.club-info-text {
  font-size: 0.85rem;
  color: #555;
  border-left: 3px solid #e0e0e0;
  padding-left: 0.75rem;
  margin-top: 0.5rem;
}

.bbb-link {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 0.3rem 0.8rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #333;
  text-decoration: none;
}

.bbb-link:hover { background: #eeeeee; }

@media (max-width: 500px) {
  .club-card { flex-direction: column; }
  .search-row { flex-direction: column; }
  .search-row button { width: 100%; }
}
```

- [ ] **Schritt 3: JavaScript anlegen**

Alle Club-Daten werden über DOM-API (textContent, setAttribute) gesetzt — kein innerHTML mit externen Strings.

```javascript
// portal/app.js
const API_BASE = 'http://localhost:3000';

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function createLogoEl(club) {
  if (club.logoUrl) {
    const img = document.createElement('img');
    img.className = 'club-logo';
    img.setAttribute('src', club.logoUrl);
    img.setAttribute('alt', club.name + ' Logo');
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'club-logo-placeholder';
      placeholder.textContent = '🏀';
      img.parentNode.replaceChild(placeholder, img);
    });
    return img;
  }
  const placeholder = document.createElement('div');
  placeholder.className = 'club-logo-placeholder';
  placeholder.textContent = '🏀';
  return placeholder;
}

function renderClub(club) {
  const card = document.createElement('div');
  card.className = 'club-card';

  card.appendChild(createLogoEl(club));

  const info = document.createElement('div');
  info.className = 'club-info';

  const name = document.createElement('div');
  name.className = 'club-name';
  name.textContent = club.name;
  info.appendChild(name);

  const metaParts = [
    club.verbandName,
    (club.address && club.address.city) ? club.address.city : club.geocodedFrom,
    club.distanceKm != null ? club.distanceKm + ' km entfernt' : null
  ].filter(Boolean);
  const meta = document.createElement('div');
  meta.className = 'club-meta';
  meta.textContent = metaParts.join(' · ');
  info.appendChild(meta);

  if (club.address && (club.address.street || club.address.zip || club.address.city)) {
    const addrParts = [
      club.address.street,
      [club.address.zip, club.address.city].filter(Boolean).join(' ')
    ].filter(Boolean);
    const addrEl = document.createElement('div');
    addrEl.className = 'club-meta';
    addrEl.textContent = addrParts.join(', ');
    info.appendChild(addrEl);
  }

  const links = document.createElement('div');
  links.className = 'club-links';
  if (club.website) {
    const a = document.createElement('a');
    a.href = club.website;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '🌐 ' + club.website.replace(/^https?:\/\//, '');
    links.appendChild(a);
  }
  if (club.email) {
    const a = document.createElement('a');
    a.href = 'mailto:' + club.email;
    a.textContent = '📧 ' + club.email;
    links.appendChild(a);
  }
  if (club.phone) {
    const a = document.createElement('a');
    a.href = 'tel:' + club.phone;
    a.textContent = '📞 ' + club.phone;
    links.appendChild(a);
  }
  if (links.childNodes.length > 0) info.appendChild(links);

  if (club.info) {
    const infoText = document.createElement('div');
    infoText.className = 'club-info-text';
    infoText.textContent = club.info;
    info.appendChild(infoText);
  }

  const bbbLink = document.createElement('a');
  bbbLink.className = 'bbb-link';
  bbbLink.href = 'https://www.basketball-bund.net/vereinDetail/id/' + club.clubId;
  bbbLink.target = '_blank';
  bbbLink.rel = 'noopener';
  bbbLink.textContent = 'Auf basketball-bund.net ansehen →';
  info.appendChild(bbbLink);

  card.appendChild(info);
  return card;
}

function showResults(results, statusText) {
  const list = document.getElementById('results-list');
  const status = document.getElementById('status-text');
  while (list.firstChild) list.removeChild(list.firstChild);
  status.textContent = statusText;
  results.forEach(club => list.appendChild(renderClub(club)));
}

async function searchByName(query) {
  if (query.length < 3) return;
  try {
    const res = await fetch(API_BASE + '/search?name=' + encodeURIComponent(query));
    const data = await res.json();
    showResults(data.results, data.total + ' Verein(e) gefunden');
  } catch {
    document.getElementById('status-text').textContent = 'Fehler beim Laden der Ergebnisse.';
  }
}

async function searchByLocation() {
  const near = document.getElementById('near-input').value.trim();
  const radius = document.getElementById('radius-select').value;
  if (!near) return;

  document.getElementById('status-text').textContent = 'Suche läuft...';
  try {
    const res = await fetch(API_BASE + '/search?near=' + encodeURIComponent(near) + '&radius=' + radius);
    const data = await res.json();
    if (data.error) {
      document.getElementById('status-text').textContent = data.error;
      return;
    }
    showResults(data.results, data.total + ' Verein(e) im Umkreis von ' + radius + ' km um "' + near + '"');
  } catch {
    document.getElementById('status-text').textContent = 'Fehler beim Laden der Ergebnisse.';
  }
}

const debouncedSearch = debounce(searchByName, 300);

document.getElementById('name-input').addEventListener('input', e => {
  debouncedSearch(e.target.value.trim());
});

document.getElementById('name-btn').addEventListener('click', () => {
  searchByName(document.getElementById('name-input').value.trim());
});

document.getElementById('near-btn').addEventListener('click', searchByLocation);

document.getElementById('near-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchByLocation();
});
```

- [ ] **Schritt 4: Manueller Smoke-Test**

```bash
# Terminal 1: API starten
npm run api

# Browser öffnen
open http://localhost:3000
```

Expected: Portal öffnet sich, beide Suchfelder sichtbar.

- [ ] **Schritt 5: Commit**

```bash
git add portal/
git commit -m "feat: add vanilla HTML/CSS/JS portal with safe DOM rendering"
```

---

## Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Schritt 1: README anlegen**

Inhalt:

```
# Basketball Vereinsregister

Findet Basketballvereine in Deutschland — per Namenssuche oder Umkreissuche.

## Quick Start

1. npm install
2. npm run crawl   (einmalig, ~30-60 min wegen Rate-Limiting)
3. npm run api
4. http://localhost:3000 öffnen

## Verein anreichern

data/clubs-enriched.json editieren:

[
  {
    "clubId": 428,
    "website": "https://mein-verein.de",
    "email": "info@mein-verein.de",
    "phone": "+49 ...",
    "address": { "street": "Musterstr. 1", "zip": "12345", "city": "Musterstadt" },
    "info": "Trainingszeiten, Halle, etc.",
    "logoUrl": "https://mein-verein.de/logo.png"
  }
]

Die clubId findest du über die Suche im Portal.

## API

GET /search?name=Baskets
GET /search?near=Regensburg&radius=25
GET /search?name=Baskets&near=München&radius=50
GET /clubs/:clubId
GET /health

## Tests

npm test
```

- [ ] **Schritt 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start and enrichment guide"
```

---

## Task 12: Abschluss-Check

- [ ] **Alle Tests ausführen**

```bash
npm test
```

Expected: Alle Tests grün.

- [ ] **TypeScript-Compilation prüfen**

```bash
npx tsc --noEmit
```

Expected: Keine Fehler.

- [ ] **Struktur prüfen**

```bash
ls crawler/ api/ api/routes/ portal/ data/ tests/
```

Expected:
- `crawler/`: index.ts, bbb-client.ts, extractor.ts, geocoder.ts, writer.ts, types.ts
- `api/`: server.ts, types.ts, search-engine.ts
- `api/routes/`: search.ts
- `portal/`: index.html, style.css, app.js
- `data/`: clubs-enriched.json
- `tests/`: bbb-client.test.ts, extractor.test.ts, geocoder.test.ts, search-engine.test.ts
