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
//
// Schlägt der Spielplan einer Liga fehl (z. B. HTTP 500), werden die Spiele über die Teams der Tabelle
// geholt (team/id/{teamPermanentId}/matches, gefiltert auf die Liga). Gelingt auch das nicht, bleibt das
// Dokument des letzten Laufs (--prev) erhalten.
//
// Log: eine Zeile je auffälliger Liga ("[liga] id=… status=…") und ein Block "[summary] …" am Ende,
// jeweils als key=value, damit sich Schlüsse direkt aus dem Log ziehen lassen.

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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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

/** Woher die Daten einer Liga stammen. */
export type Quelle = 'spielplan' | 'team-matches' | 'cache';

export interface LigaResult {
  doc: LigaDoc;
  quelle: Quelle;
  /** Tabelle kam aus competition/table, weil der Spielplan keine lieferte */
  tabelleNachgeladen: boolean;
  /** Fehlergrund des Spielplans, wenn nicht aus 'spielplan' */
  grund?: string;
  /** nur bei 'team-matches' */
  teams?: number;
  teamsOhneSpiele?: number;
  teamFehler?: number;
}

export interface CrawlDeps {
  fetchJson: (url: string) => Promise<any>;
  sleep: (ms: number) => Promise<void>;
  delay: number;
  now?: () => string;
  /** Dokument aus dem letzten Lauf; Rückfall, wenn nichts Frisches zu holen ist */
  loadPrev?: (ligaId: number) => LigaDoc | undefined;
}

const reason = (err: unknown): string => String((err as any)?.message ?? err).replace(/\s+/g, ' ').slice(0, 160);

/**
 * Holt eine Liga: Spielplan → (Tabelle nachladen) → bei Fehler Spiele über die Teams der Tabelle →
 * bei erneutem Fehler Dokument des letzten Laufs. Wirft nur, wenn nichts davon gelingt.
 */
export async function crawlLiga(meta: LigaMeta, d: CrawlDeps): Promise<LigaResult> {
  const now = d.now ?? (() => new Date().toISOString());
  let spielplanError: unknown;
  try {
    const data = (await d.fetchJson(`${BASE}/competition/spielplan/id/${meta.ligaId}`))?.data;
    let fallback: any[] = [];
    let nachgeladen = false;
    if (data && tabelleEntries(data.tabelle).length === 0 && Array.isArray(data.matches) && data.matches.length > 0) {
      await d.sleep(d.delay);
      nachgeladen = true;
      fallback = tabelleEntries((await d.fetchJson(`${BASE}/competition/table/id/${meta.ligaId}`))?.data?.tabelle);
    }
    return { doc: toLigaDoc(meta, data, now(), fallback), quelle: 'spielplan', tabelleNachgeladen: nachgeladen };
  } catch (err) {
    spielplanError = err;
  }

  const grund = reason(spielplanError);
  try {
    const tabelle = tabelleEntries((await d.fetchJson(`${BASE}/competition/table/id/${meta.ligaId}`))?.data?.tabelle);
    const teamIds = [...new Set(tabelle.map(e => Number(e?.team?.teamPermanentId)).filter(Boolean))];
    if (teamIds.length === 0) throw new Error('Tabelle ohne Teams');
    const byId = new Map<number, any>();
    let teamFehler = 0;
    let teamsOhneSpiele = 0;
    for (const teamId of teamIds) {
      await d.sleep(d.delay);
      try {
        const matches: any[] = (await d.fetchJson(`${BASE}/team/id/${teamId}/matches`))?.data?.matches ?? [];
        const own = matches.filter(m => m?.ligaData?.ligaId === meta.ligaId);
        if (own.length === 0) teamsOhneSpiele++;
        for (const m of own) byId.set(m.matchId, m);
      } catch {
        teamFehler++;
      }
    }
    if (byId.size === 0 && teamFehler === teamIds.length) throw new Error('kein Team lieferte Spiele');
    const doc = toLigaDoc(meta, { tabelle, matches: [...byId.values()] }, now());
    return { doc, quelle: 'team-matches', tabelleNachgeladen: false, grund, teams: teamIds.length, teamsOhneSpiele, teamFehler };
  } catch (fallbackError) {
    const prev = d.loadPrev?.(meta.ligaId);
    if (prev) return { doc: prev, quelle: 'cache', tabelleNachgeladen: false, grund: `${grund}; Rückfall: ${reason(fallbackError)}` };
    throw Object.assign(new Error(`${grund}; Rückfall: ${reason(fallbackError)}`), { cause: spielplanError });
  }
}

const logLine = (tag: string, fields: Record<string, string | number | undefined>): string =>
  `[${tag}] ` + Object.entries(fields).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' && /[\s"=]/.test(v) ? JSON.stringify(v) : v}`).join(' ');

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

  const prevDir = arg('prev', '_live');
  const loadPrev = (ligaId: number): LigaDoc | undefined => {
    try {
      return JSON.parse(fs.readFileSync(path.join(prevDir, 'liga', `${ligaId}.json`), 'utf-8')) as LigaDoc;
    } catch {
      return undefined;
    }
  };

  fs.mkdirSync(path.join(out, 'liga'), { recursive: true });
  const docs: LigaDoc[] = [];
  const results: Array<{ meta: LigaMeta; result: LigaResult }> = [];
  const failed: Array<{ meta: LigaMeta; grund: string }> = [];
  let next = 0;
  const startedAt = new Date().toISOString();
  const deps: CrawlDeps = { fetchJson, sleep, delay, loadPrev };

  await Promise.all(Array.from({ length: Math.min(concurrency, ligen.length) }, async () => {
    while (next < ligen.length) {
      const meta = ligen[next++];
      try {
        const result = await crawlLiga(meta, deps);
        fs.writeFileSync(path.join(out, 'liga', `${meta.ligaId}.json`), JSON.stringify(result.doc), 'utf-8');
        docs.push(result.doc);
        results.push({ meta, result });
        const r = result;
        if (r.quelle !== 'spielplan') {
          console.warn(logLine('liga', {
            id: meta.ligaId, status: r.quelle, name: meta.liganame, verband: meta.verbandName,
            spiele: r.doc.matches.length, tabelle: r.doc.tabelle.length, teams: r.teams,
            teams_ohne_spiele: r.teamsOhneSpiele, teams_fehler: r.teamFehler, stand: r.quelle === 'cache' ? r.doc.fetchedAt : undefined, grund: r.grund
          }));
        }
      } catch (err) {
        const grund = reason(err);
        failed.push({ meta, grund });
        console.warn(logLine('liga', { id: meta.ligaId, status: 'fehlgeschlagen', name: meta.liganame, verband: meta.verbandName, grund }));
      }
      if ((docs.length + failed.length) % 200 === 0) console.log(`  ${docs.length + failed.length}/${ligen.length}...`);
      await sleep(delay);
    }
  }));

  const by = (q: Quelle) => results.filter(r => r.result.quelle === q);
  const ids = (xs: Array<{ meta: LigaMeta }>) => xs.map(x => x.meta.ligaId).sort((a, b) => a - b);
  const aus = { team: by('team-matches'), cache: by('cache') };
  const nachgeladen = results.filter(r => r.result.tabelleNachgeladen).length;
  const ohneTabelle = docs.filter(d => d.tabelle.length === 0);
  const ohneSpiele = docs.filter(d => d.matches.length === 0);
  const teamIndex = buildTeamIndex(docs);
  const spiele = docs.reduce((n, d) => n + d.matches.length, 0);
  const cap = (xs: number[]) => (xs.length > 25 ? `${xs.slice(0, 25).join(',')},…(+${xs.length - 25})` : xs.join(','));

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'team-index.json'), JSON.stringify(teamIndex), 'utf-8');
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({
    startedAt,
    finishedAt,
    ligen: docs
      .map(d => ({ ligaId: d.ligaId, liganame: d.liganame, verbandName: d.verbandName, akName: d.akName, geschlecht: d.geschlecht, spiele: d.matches.length, teams: d.tabelle.length }))
      .sort((a, b) => a.ligaId - b.ligaId),
    fehlgeschlagen: ids(failed),
    ausTeamSpielen: ids(aus.team),
    veraltet: ids(aus.cache)
  }), 'utf-8');

  const failureReasons = failed.map(f => `Liga ${f.meta.ligaId} (${f.meta.liganame}): ${f.grund}`);
  const summaryLines = [
    logLine('summary', { ligen: ligen.length, geladen: docs.length, fehlgeschlagen: failed.length, spielplan: by('spielplan').length, team_matches: aus.team.length, cache: aus.cache.length }),
    logLine('summary', { tabelle_nachgeladen: nachgeladen, ohne_tabelle: ohneTabelle.length, ohne_spiele: ohneSpiele.length, spiele: spiele, teams: Object.keys(teamIndex).length }),
    logLine('summary', { fehlgeschlagen_ids: cap(ids(failed)) || '-', team_matches_ids: cap(ids(aus.team)) || '-', cache_ids: cap(ids(aus.cache)) || '-' }),
    logLine('summary', { ohne_tabelle_ids: cap(ohneTabelle.map(d => d.ligaId).sort((a, b) => a - b)) || '-' }),
    logLine('summary', { ohne_spiele_ids: cap(ohneSpiele.map(d => d.ligaId).sort((a, b) => a - b)) || '-' })
  ];
  summaryLines.forEach(l => console.log(l));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = [
      ...failed.map(f => `| ${f.meta.ligaId} | ${f.meta.liganame} | fehlgeschlagen | ${f.grund} |`),
      ...aus.cache.map(r => `| ${r.meta.ligaId} | ${r.meta.liganame} | veraltet (Stand ${r.result.doc.fetchedAt}) | ${r.result.grund} |`),
      ...aus.team.map(r => `| ${r.meta.ligaId} | ${r.meta.liganame} | aus Team-Spielen (${r.result.doc.matches.length} Spiele, ${r.result.teams} Teams) | ${r.result.grund} |`)
    ];
    const head = `Live-Crawl: ${docs.length}/${ligen.length} Ligen, ${failed.length} fehlgeschlagen, ${aus.team.length} aus Team-Spielen, ${aus.cache.length} aus dem Cache, ${nachgeladen} Tabellen-Nachladungen.`;
    const table = rows.length ? `\n\n| Liga | Name | Status | Grund |\n|---|---|---|---|\n${rows.join('\n')}\n` : '';
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, head + table + '\n');
  }
  // Annotationen erscheinen an der Lauf-Übersicht und im Schritt, statt nur im Log unterzugehen
  if (process.env.GITHUB_ACTIONS === 'true') {
    const warn = [
      ...failureReasons.map(r => `::warning title=Liga im Live-Crawl fehlgeschlagen::${r}`),
      ...aus.cache.map(r => `::warning title=Liga veraltet (aus dem Cache)::Liga ${r.meta.ligaId} (${r.meta.liganame}): ${r.result.grund}`)
    ];
    warn.slice(0, 10).forEach(w => console.log(w));
    if (warn.length > 10) console.log(`::warning title=Live-Crawl::... und ${warn.length - 10} weitere Ligen mit Problemen`);
    for (const r of aus.team.slice(0, 10)) console.log(`::notice title=Liga aus Team-Spielen::Liga ${r.meta.ligaId} (${r.meta.liganame}): ${r.result.doc.matches.length} Spiele über ${r.result.teams} Teams, Spielplan: ${r.result.grund}`);
  }

  // Guard: bei Totalausfall nicht deployen
  // Ligen aus dem Cache zählen als Ausfall: bei einem Totalausfall der API soll nicht still Altes deployt werden
  const ausfall = failed.length + aus.cache.length;
  if (docs.length === 0 || ausfall / ligen.length > MAX_FAILURE_RATIO) {
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
