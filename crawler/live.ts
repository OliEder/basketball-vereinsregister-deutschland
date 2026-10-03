// Live-Crawl: holt Tabelle und Spielplan pro Liga und schreibt sie als statische JSON-Dateien.
//
//   npm run live [-- --out=_live] [-- --concurrency=4] [-- --delay=300] [-- --limit=50]
//
//   <out>/liga/<ligaId>.json   Liga, Tabelle, Spiele
//   <out>/team-index.json      teamPermanentId → [ligaId, ...]
//   <out>/index.json           Übersicht aller Ligen + Laufinfo
//
// Eine Anfrage pro Liga (competition/spielplan/id/{ligaId}) liefert Spiele und Tabelle
// (Messung: 2124 Ligen, ~37 KB je Liga, keine Drosselung bei 5 parallelen Anfragen).
// Ist die Tabelle dort leer, wird einmalig competition/table/id/{ligaId} nachgeladen.

import fs from 'fs';
import path from 'path';
import { BbbClient } from './bbb-client';

const BASE = 'https://www.basketball-bund.net/rest';
const HEADERS = { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' };
const MAX_ATTEMPTS = 3;
const MAX_FAILURE_RATIO = 0.1;

export interface LigaMeta {
  ligaId: number;
  liganame: string;
  verbandName: string;
  akName?: string;
  geschlecht?: string;
  /** Saison und Gebiet laut Ligaliste; für das Saison-Archiv (crawler/archive.ts) */
  seasonId?: number;
  seasonName?: string;
  skName?: string;
  skEbeneName?: string | null;
  bezirkName?: string | null;
  kreisname?: string | null;
}

export interface LigaDoc extends LigaMeta {
  fetchedAt: string;
  tabelle: any[];
  matches: any[];
}

/** Entfernt undefined-Felder, damit die Dokumente ohne die neuen Angaben unverändert bleiben. */
export function definedOnly<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function tabelleEntries(tabelle: any): any[] {
  if (Array.isArray(tabelle)) return tabelle;
  if (Array.isArray(tabelle?.entries)) return tabelle.entries;
  return [];
}

/** Baut das gespeicherte Dokument: Spiele ohne das (pro Spiel wiederholte) ligaData. */
export function toLigaDoc(meta: LigaMeta, data: any, fetchedAt: string, tableFallback: any[] = []): LigaDoc {
  const matches = (Array.isArray(data?.matches) ? data.matches : []).map((m: any) => {
    const { ligaData, ...rest } = m ?? {};
    return rest;
  });
  const own = tabelleEntries(data?.tabelle);
  return { ...meta, fetchedAt, tabelle: own.length > 0 ? own : tableFallback, matches };
}

/** teamPermanentId → Ligen, in denen das Team in Tabelle oder Spielplan vorkommt. */
export function buildTeamIndex(docs: LigaDoc[]): Record<string, number[]> {
  const index = new Map<number, Set<number>>();
  const add = (teamId: unknown, ligaId: number) => {
    const id = Number(teamId);
    if (!id) return;
    if (!index.has(id)) index.set(id, new Set());
    index.get(id)!.add(ligaId);
  };
  for (const doc of docs) {
    for (const e of doc.tabelle) add(e?.team?.teamPermanentId, doc.ligaId);
    for (const m of doc.matches) {
      add(m?.homeTeam?.teamPermanentId, doc.ligaId);
      add(m?.guestTeam?.teamPermanentId, doc.ligaId);
    }
  }
  const out: Record<string, number[]> = {};
  for (const [teamId, ligen] of index) out[teamId] = Array.from(ligen).sort((a, b) => a - b);
  return out;
}

export async function fetchJson(url: string, fetchFn: typeof fetch = globalThis.fetch): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetchFn(url, { headers: HEADERS });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { permanent: true });
      throw new Error(`HTTP ${res.status} ${url}`);
    } catch (err: any) {
      if (err?.permanent || attempt >= MAX_ATTEMPTS) throw err;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

function arg(name: string, fallback: number): number;
function arg(name: string, fallback: string): string;
function arg(name: string, fallback: number | string): number | string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const v = hit.slice(name.length + 3);
  return typeof fallback === 'number' ? parseInt(v, 10) : v;
}

async function listLigen(): Promise<LigaMeta[]> {
  const client = new BbbClient();
  const verbaende = await client.getVerbaende();
  const byId = new Map<number, LigaMeta>();
  for (const v of verbaende) {
    let start = 0;
    for (;;) {
      const { ligen, hasMoreData } = await client.getLigen(v.id, start);
      if (ligen.length === 0) break;
      for (const l of ligen) {
        if (!byId.has(l.ligaId)) {
          byId.set(l.ligaId, {
            ligaId: l.ligaId, liganame: l.liganame, verbandName: v.label, akName: l.akName, geschlecht: l.geschlecht,
            ...definedOnly({ seasonId: l.seasonId, seasonName: l.seasonName, skName: l.skName, skEbeneName: l.skEbeneName, bezirkName: l.bezirkName, kreisname: l.kreisname })
          });
        }
      }
      if (!hasMoreData) break;
      start += ligen.length;
    }
  }
  return Array.from(byId.values());
}

async function live(): Promise<void> {
  const out = arg('out', '_live');
  const concurrency = arg('concurrency', 4);
  const delay = arg('delay', 300);
  const limit = arg('limit', 0);

  console.log('Lade Ligenliste...');
  let ligen = await listLigen();
  if (limit > 0) ligen = ligen.slice(0, limit);
  console.log(`${ligen.length} Ligen, ${concurrency} parallel, ${delay} ms Pause.`);

  fs.mkdirSync(path.join(out, 'liga'), { recursive: true });
  const docs: LigaDoc[] = [];
  const failed: number[] = [];
  let fallbacks = 0;
  let next = 0;
  const startedAt = new Date().toISOString();

  await Promise.all(Array.from({ length: Math.min(concurrency, ligen.length) }, async () => {
    while (next < ligen.length) {
      const meta = ligen[next++];
      try {
        const data = (await fetchJson(`${BASE}/competition/spielplan/id/${meta.ligaId}`))?.data;
        let fallback: any[] = [];
        if (data && tabelleEntries(data.tabelle).length === 0 && Array.isArray(data.matches) && data.matches.length > 0) {
          await sleep(delay);
          fallbacks++;
          fallback = tabelleEntries((await fetchJson(`${BASE}/competition/table/id/${meta.ligaId}`))?.data?.tabelle);
        }
        const doc = toLigaDoc(meta, data, new Date().toISOString(), fallback);
        fs.writeFileSync(path.join(out, 'liga', `${meta.ligaId}.json`), JSON.stringify(doc), 'utf-8');
        docs.push(doc);
      } catch (err) {
        failed.push(meta.ligaId);
        console.warn(`  Liga ${meta.ligaId} fehlgeschlagen: ${err}`);
      }
      if ((docs.length + failed.length) % 200 === 0) console.log(`  ${docs.length + failed.length}/${ligen.length}...`);
      await sleep(delay);
    }
  }));

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'team-index.json'), JSON.stringify(buildTeamIndex(docs)), 'utf-8');
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({
    startedAt,
    finishedAt,
    ligen: docs
      .map(d => ({ ligaId: d.ligaId, liganame: d.liganame, verbandName: d.verbandName, akName: d.akName, geschlecht: d.geschlecht, spiele: d.matches.length, teams: d.tabelle.length }))
      .sort((a, b) => a.ligaId - b.ligaId),
    fehlgeschlagen: failed
  }), 'utf-8');

  const summary = `Live-Crawl: ${docs.length}/${ligen.length} Ligen, ${failed.length} fehlgeschlagen, ${fallbacks} Tabellen-Nachladungen.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');

  // Guard: bei Totalausfall nicht deployen
  if (docs.length === 0 || failed.length / ligen.length > MAX_FAILURE_RATIO) {
    console.error(`Zu viele Fehler (> ${MAX_FAILURE_RATIO * 100} %) — Abbruch.`);
    process.exit(1);
  }
}

if (require.main === module) {
  live().catch(err => {
    console.error('Live-Crawl fehlgeschlagen:', err);
    process.exit(1);
  });
}
