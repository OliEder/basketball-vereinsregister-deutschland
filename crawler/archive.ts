// Saison-Archiv: sichert Tabellen und Ergebnisse jeder Liga dauerhaft, weil die BBB-API nur die laufende Saison liefert.
//
//   npx tsx crawler/archive.ts --live=_live --store=season-archive
//
// Aufbau des Speichers (Branch "season-archive", siehe README.md darin und ADR-010):
//   <saison>/liga/<ligaId>.json.gz   Liga mit Tabelle und allen Spielen
//   <saison>/index.json              Übersicht aller Ligen der Saison (mit Prüfsumme)
//
// Eine Saison heißt "2026-27". Quelle ist seasonName aus der Ligaliste, sonst das Datum (Saisonwechsel am 1. Juli).
// Der Lauf ersetzt nur Ligen, deren Stand nicht schlechter ist als der archivierte (nie weniger gespielte Spiele),
// und löscht nie eine Liga, die in den Live-Daten fehlt. So kann eine unvollständige Antwort der API das Archiv
// nicht beschädigen.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { LigaDoc } from './live';

export type ArchivedLiga = Omit<LigaDoc, 'fetchedAt'> & { venues?: never; halls?: never };

export interface IndexEntry {
  ligaId: number;
  liganame: string;
  verbandName: string;
  akName?: string;
  geschlecht?: string;
  ebene?: string | null;
  bezirk?: string | null;
  kreis?: string | null;
  teams: number;
  matches: number;
  played: number;
  hash: string;
  updated: string;     // Tag der letzten Änderung (YYYY-MM-DD)
}

export interface SeasonResult { season: string; total: number; added: number; changed: number; kept: number }

/** "2026/2027", "2026/27", "2026-27" oder 2026 → "2026-27"; ohne Angabe nach Datum (Saisonwechsel 1. Juli). */
export function seasonKey(doc: Pick<LigaDoc, 'seasonName' | 'seasonId'>, now: Date): string {
  const m = /^\s*(\d{4})\s*[\/-]\s*(\d{2}|\d{4})\s*$/.exec(doc.seasonName ?? '');
  if (m) return `${m[1]}-${m[2].slice(-2)}`;
  if (typeof doc.seasonId === 'number' && doc.seasonId > 1990 && doc.seasonId < 2200) {
    return `${doc.seasonId}-${String((doc.seasonId + 1) % 100).padStart(2, '0')}`;
  }
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Ohne flüchtige oder anderswo gespeicherte Felder: so bleibt der Inhalt bei gleichem Spielstand gleich. */
export function normalize(doc: LigaDoc): ArchivedLiga {
  const { fetchedAt, venues, halls, ...rest } = doc as LigaDoc & { venues?: unknown; halls?: unknown };
  void fetchedAt; void venues; void halls;
  return rest as ArchivedLiga;
}

export const playedCount = (doc: Pick<LigaDoc, 'matches'>): number =>
  (doc.matches ?? []).filter(m => typeof m?.result === 'string' && m.result.includes(':')).length;

export const hashOf = (doc: ArchivedLiga): string => crypto.createHash('sha1').update(JSON.stringify(doc)).digest('hex');

const hasContent = (d: Pick<LigaDoc, 'tabelle' | 'matches'>): boolean => (d.tabelle?.length ?? 0) > 0 || (d.matches?.length ?? 0) > 0;

/** Welche Fassung gewinnt: die neue nur, wenn sie Inhalt hat und nicht weniger gespielte Spiele als die archivierte. */
export function pickNewer(archived: ArchivedLiga | null, incoming: ArchivedLiga): { doc: ArchivedLiga; replaced: boolean } {
  if (!archived) return { doc: incoming, replaced: true };
  if (!hasContent(incoming)) return { doc: archived, replaced: false };
  if (playedCount(incoming) < playedCount(archived)) return { doc: archived, replaced: false };
  return { doc: incoming, replaced: hashOf(incoming) !== hashOf(archived) };
}

const ligaFile = (store: string, season: string, ligaId: number): string => path.join(store, season, 'liga', `${ligaId}.json.gz`);

export function readArchivedLiga(store: string, season: string, ligaId: number): ArchivedLiga | null {
  const f = ligaFile(store, season, ligaId);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf-8'));
}

function readIndex(store: string, season: string): Map<number, IndexEntry> {
  const f = path.join(store, season, 'index.json');
  if (!fs.existsSync(f)) return new Map();
  const list: IndexEntry[] = JSON.parse(fs.readFileSync(f, 'utf-8')).ligen ?? [];
  return new Map(list.map(e => [e.ligaId, e]));
}

function entryOf(doc: ArchivedLiga, hash: string, updated: string): IndexEntry {
  return {
    ligaId: doc.ligaId, liganame: doc.liganame, verbandName: doc.verbandName,
    ...(doc.akName ? { akName: doc.akName } : {}), ...(doc.geschlecht ? { geschlecht: doc.geschlecht } : {}),
    ebene: doc.skEbeneName ?? null, bezirk: doc.bezirkName ?? null, kreis: doc.kreisname ?? null,
    teams: doc.tabelle?.length ?? 0, matches: doc.matches?.length ?? 0, played: playedCount(doc), hash, updated
  };
}

export function loadLive(liveDir: string): LigaDoc[] {
  const dir = path.join(liveDir, 'liga');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as LigaDoc)
    .filter(d => d && typeof d.ligaId === 'number');
}

export function archive(docs: LigaDoc[], store: string, now = new Date()): SeasonResult[] {
  const today = now.toISOString().slice(0, 10);
  const bySeason = new Map<string, LigaDoc[]>();
  for (const d of docs) {
    const s = seasonKey(d, now);
    bySeason.set(s, [...(bySeason.get(s) ?? []), d]);
  }

  const results: SeasonResult[] = [];
  for (const [season, list] of bySeason) {
    const index = readIndex(store, season);
    fs.mkdirSync(path.join(store, season, 'liga'), { recursive: true });
    let added = 0, changed = 0, kept = 0;

    for (const doc of list.sort((a, b) => a.ligaId - b.ligaId)) {
      const incoming = normalize(doc);
      const archived = readArchivedLiga(store, season, doc.ligaId);
      const { doc: winner, replaced } = pickNewer(archived, incoming);
      if (!archived && !hasContent(incoming)) continue;          // leere Ligen werden nicht angelegt
      if (!replaced && archived) {
        kept++;
        if (!index.has(doc.ligaId)) index.set(doc.ligaId, entryOf(archived, hashOf(archived), today));   // Index verloren oder neu
        continue;
      }
      const hash = hashOf(winner);
      fs.writeFileSync(ligaFile(store, season, doc.ligaId), zlib.gzipSync(Buffer.from(JSON.stringify(winner)), { level: 9 }));
      index.set(doc.ligaId, entryOf(winner, hash, today));
      if (archived) changed++; else added++;
    }

    const entries = [...index.values()].sort((a, b) => a.ligaId - b.ligaId);
    fs.writeFileSync(path.join(store, season, 'index.json'), JSON.stringify({ season, ligen: entries }) + '\n', 'utf-8');
    results.push({ season, total: entries.length, added, changed, kept });
  }
  return results;
}

export const STORE_README = `# Saison-Archiv

Tabellen und Ergebnisse aller Ligen, je Saison dauerhaft gesichert (Quelle: BBB-API, Projekt basketball-vereinsregister-deutschland).
Die API liefert nur die laufende Saison; dieser Branch bewahrt den Stand früherer Saisons.

- \`<saison>/index.json\`: Übersicht der Ligen (Name, Verband, Ebene, Bezirk, Kreis, Anzahl Teams/Spiele, Prüfsumme)
- \`<saison>/liga/<ligaId>.json.gz\`: Liga mit \`tabelle\` und \`matches\` (gzip, JSON)

Der Branch wird einmal täglich durch genau einen Commit ersetzt. Ein Eintrag wird nie durch einen Stand mit weniger
gespielten Spielen ersetzt und nie gelöscht. Es werden keine Spielerdaten gespeichert.
`;

function arg(name: string, fallback: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function main(): void {
  const live = arg('live', '_live');
  const store = arg('store', 'season-archive');
  const docs = loadLive(live);
  if (docs.length === 0) {
    console.log(`Keine Live-Daten in ${live}; nichts zu archivieren.`);
    setOutput(false);
    return;
  }
  fs.mkdirSync(store, { recursive: true });
  const results = archive(docs, store);
  fs.writeFileSync(path.join(store, 'README.md'), STORE_README, 'utf-8');
  let touched = 0;
  for (const r of results) {
    touched += r.added + r.changed;
    console.log(`Saison ${r.season}: ${r.total} Ligen im Archiv, ${r.added} neu, ${r.changed} geändert, ${r.kept} unverändert.`);
  }
  setOutput(touched > 0);
}

function setOutput(changed: boolean): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `changed=${changed}\n`);
}

if (require.main === module) main();
