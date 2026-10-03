// Spielorte aus matchInfo: Spiel-ID → Halle, inkrementell und dauerhaft gespeichert.
//
//   npm run venues [-- --source=<Pages-URL oder Ordner>] [-- --store=data-store]
//                  [-- --budget-min=25] [-- --concurrency=4] [-- --delay=300] [-- --max=0]
//
// Die Halle eines Spiels steht nur in `match/id/{id}/matchInfo` (eine Anfrage je Spiel, rund 120 000
// Spiele pro Saison). Deshalb gibt es einen dauerhaften Speicher (Branch `data-store`) und eine
// Warteschlange mit Zeitbudget pro Lauf:
//   1. Spiele der nächsten 14 Tage ohne Eintrag (der Teaser braucht sie zuerst)
//   2. Spiele der nächsten 7 Tage, deren Eintrag älter als ein Tag ist (Verlegungen)
//   3. alle weiteren kommenden Spiele ohne Eintrag, das nächste zuerst
//   4. gespielte Spiele ohne Eintrag, das jüngste zuerst (Hallenzähler)
// Welche Spiele es gibt, liest der Lauf aus den veröffentlichten Live-Daten (liga/<id>.json).
//
//   <store>/venues.json  { updated, matches: { "<matchId>": [hallId, tagGeholt] } }  (hallId 0 = unbekannt)
//   <store>/halls.json   { "<hallId>": { bezeichnung, strasse, plz, ort } }
//   <store>/status.json  Fortschritt (Spiele gesamt, mit Halle, offen)
import fs from 'fs';
import path from 'path';
import { fetchJson } from './live';

const BASE = 'https://www.basketball-bund.net/rest';
export const DEFAULT_SOURCE = 'https://olieder.github.io/basketball-vereinsregister-deutschland/data/live';
/** Unbekannte Hallen (hallId 0) werden nach dieser Zahl Tage erneut versucht. */
export const RETRY_UNKNOWN_DAYS = 7;
const MAX_ERROR_RATIO = 0.2;
const MIN_REQUESTS_FOR_GUARD = 50;

export interface VenueStore { updated: string; matches: Record<string, [number, number]> }
export interface HallInfo { bezeichnung: string; strasse: string | null; plz: string | null; ort: string | null }
export type HallMap = Record<string, HallInfo>;
export interface Candidate { matchId: number; date: string | null; played: boolean }

export const emptyStore = (): VenueStore => ({ updated: '', matches: {} });

/** Tagesnummer (UTC) für "heute" und Vergleiche: ganze Tage seit 1970. */
export function dayNumber(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  return Math.floor(d.getTime() / 86_400_000);
}

/** Kandidaten aus den Liga-Dokumenten: ohne abgesagte Spiele und Verzichte, ohne doppelte Spiel-IDs. */
export function candidatesFromDocs(docs: Array<{ matches?: any[] }>): Candidate[] {
  const seen = new Map<number, Candidate>();
  for (const doc of docs) {
    for (const m of doc.matches ?? []) {
      const id = Number(m?.matchId);
      if (!id || m.abgesagt === true || m.verzicht === true || seen.has(id)) continue;
      seen.set(id, { matchId: id, date: typeof m.kickoffDate === 'string' ? m.kickoffDate : null, played: !!m.result });
    }
  }
  return Array.from(seen.values());
}

/**
 * Reihenfolge der Abrufe (siehe Kopfkommentar). `today` im Format YYYY-MM-DD.
 * Ein Eintrag mit hallId 0 zählt als fehlend, sobald er älter als RETRY_UNKNOWN_DAYS ist.
 */
export function planFetches(candidates: Candidate[], store: VenueStore, today: string): number[] {
  const todayNum = dayNumber(today);
  const scored: Array<{ id: number; prio: number; key: number }> = [];

  for (const c of candidates) {
    const entry = store.matches[String(c.matchId)];
    const missing = !entry || (entry[0] === 0 && todayNum - entry[1] >= RETRY_UNKNOWN_DAYS);
    const dayNum = c.date ? dayNumber(c.date) : null;
    const upcoming = !c.played && (dayNum === null || dayNum >= todayNum);
    const ahead = dayNum === null ? Infinity : dayNum - todayNum;

    if (upcoming && missing && ahead <= 14) scored.push({ id: c.matchId, prio: 1, key: ahead });
    else if (upcoming && !missing && ahead <= 7 && entry[1] < todayNum) scored.push({ id: c.matchId, prio: 2, key: ahead });
    else if (upcoming && missing) scored.push({ id: c.matchId, prio: 3, key: ahead });
    else if (!upcoming && missing) scored.push({ id: c.matchId, prio: 4, key: dayNum === null ? 0 : -dayNum });
  }
  return scored.sort((a, b) => a.prio - b.prio || a.key - b.key).map(s => s.id);
}

export type FetchResult = { ok: true; hallId: number; hall: HallInfo | null } | { ok: false };

/** Liest das Spielfeld aus einer matchInfo-Antwort; fehlt es, ist die Halle unbekannt (hallId 0). */
export function parseSpielfeld(json: any): { hallId: number; hall: HallInfo | null } {
  const f = json?.data?.matchInfo?.spielfeld;
  const id = Number(f?.id);
  if (!f || !id) return { hallId: 0, hall: null };
  return {
    hallId: id,
    hall: { bezeichnung: f.bezeichnung ?? '', strasse: f.strasse ?? null, plz: f.plz ?? null, ort: f.ort ?? null }
  };
}

export interface RunOptions {
  fetchInfo: (matchId: number) => Promise<FetchResult>;
  today: string;
  /** Ende des Zeitbudgets (ms seit Epoche); 0 = unbegrenzt */
  deadline?: number;
  maxRequests?: number;
  concurrency?: number;
  delayMs?: number;
  now?: () => number;
}

export interface RunReport { fetched: number; errors: number; aborted: boolean; stoppedByBudget: boolean }

/** Arbeitet die Warteschlange ab und schreibt die Ergebnisse in `store` und `halls`. Bei zu vielen Fehlern: Abbruch. */
export async function runQueue(plan: number[], store: VenueStore, halls: HallMap, opt: RunOptions): Promise<RunReport> {
  const now = opt.now ?? Date.now;
  const todayNum = dayNumber(opt.today);
  const limit = opt.maxRequests && opt.maxRequests > 0 ? Math.min(opt.maxRequests, plan.length) : plan.length;
  const report: RunReport = { fetched: 0, errors: 0, aborted: false, stoppedByBudget: false };
  let next = 0;

  const worker = async () => {
    while (next < limit && !report.aborted) {
      if (opt.deadline && now() >= opt.deadline) { report.stoppedByBudget = true; return; }
      const matchId = plan[next++];
      const res = await opt.fetchInfo(matchId);
      if (res.ok) {
        report.fetched++;
        store.matches[String(matchId)] = [res.hallId, todayNum];
        if (res.hall) halls[String(res.hallId)] = res.hall;
      } else {
        report.errors++;
      }
      const total = report.fetched + report.errors;
      if (total >= MIN_REQUESTS_FOR_GUARD && report.errors / total > MAX_ERROR_RATIO) report.aborted = true;
      if (opt.delayMs) await new Promise(r => setTimeout(r, opt.delayMs));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opt.concurrency ?? 4, limit)) }, worker));
  return report;
}

// ---- Ein- und Ausgabe ---------------------------------------------------------------------------

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

/** Schreibt über eine Temp-Datei, damit ein Abbruch keine halbe Datei hinterlässt. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmp, file);
}

/** Liest alle Liga-Dokumente aus einem Ordner oder von einer URL (…/data/live). */
export async function loadLigaDocs(source: string, fetchFn: (url: string) => Promise<any> = u => fetchJson(u)): Promise<Array<{ matches?: any[] }>> {
  const isUrl = /^https?:\/\//.test(source);
  const read = async (rel: string) => isUrl ? fetchFn(`${source.replace(/\/$/, '')}/${rel}`) : readJson<any>(path.join(source, rel), null);
  const index = await read('index.json');
  const ids: number[] = (index?.ligen ?? []).map((l: any) => l.ligaId);
  const docs: Array<{ matches?: any[] }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try { const d = await read(`liga/${id}.json`); if (d) docs.push(d); } catch { /* einzelne Liga fehlt: wird beim nächsten Lauf nachgeholt */ }
    }
  }));
  return docs;
}

function arg(name: string, fallback: number): number;
function arg(name: string, fallback: string): string;
function arg(name: string, fallback: number | string): number | string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const v = hit.slice(name.length + 3);
  return typeof fallback === 'number' ? parseInt(v, 10) : v;
}

async function main(): Promise<void> {
  const source = arg('source', DEFAULT_SOURCE);
  const storeDir = arg('store', 'data-store');
  const budgetMin = arg('budget-min', 25);
  const concurrency = arg('concurrency', 4);
  const delayMs = arg('delay', 300);
  const maxRequests = arg('max', 0);

  const store = readJson<VenueStore>(path.join(storeDir, 'venues.json'), emptyStore());
  const halls = readJson<HallMap>(path.join(storeDir, 'halls.json'), {});
  console.log(`Speicher: ${Object.keys(store.matches).length} Spiele, ${Object.keys(halls).length} Hallen.`);

  const docs = await loadLigaDocs(source);
  const candidates = candidatesFromDocs(docs);
  if (candidates.length === 0) throw new Error(`Keine Spiele in ${source} gefunden — Abbruch, Speicher bleibt unverändert.`);
  const today = new Date().toISOString().slice(0, 10);
  const plan = planFetches(candidates, store, today);
  console.log(`${docs.length} Ligen, ${candidates.length} Spiele, ${plan.length} Abrufe offen.`);

  const fetchInfo = async (matchId: number): Promise<FetchResult> => {
    try {
      return { ok: true, ...parseSpielfeld(await fetchJson(`${BASE}/match/id/${matchId}/matchInfo`)) };
    } catch (err: any) {
      // 4xx (z. B. Spiel gelöscht) ist dauerhaft: als unbekannt vermerken, sonst blockiert es die Warteschlange
      if (err?.permanent) return { ok: true, hallId: 0, hall: null };
      return { ok: false };
    }
  };

  const report = await runQueue(plan, store, halls, {
    fetchInfo, today, concurrency, delayMs, maxRequests,
    deadline: budgetMin > 0 ? Date.now() + budgetMin * 60_000 : 0
  });

  // Auch bei Abbruch wegen Fehlern bleiben die bis dahin geholten Einträge erhalten.
  store.updated = new Date().toISOString();
  writeJsonAtomic(path.join(storeDir, 'venues.json'), store);
  writeJsonAtomic(path.join(storeDir, 'halls.json'), halls);

  const withHall = candidates.filter(c => (store.matches[String(c.matchId)]?.[0] ?? 0) > 0).length;
  const status = {
    updated: store.updated, spieleGesamt: candidates.length, mitHalle: withHall,
    offen: Math.max(0, plan.length - report.fetched), hallen: Object.keys(halls).length
  };
  writeJsonAtomic(path.join(storeDir, 'status.json'), status);

  const summary = `Spielorte: ${report.fetched} geholt, ${report.errors} Fehler${report.aborted ? ' (ABBRUCH: zu viele Fehler)' : ''}${report.stoppedByBudget ? ', Zeitbudget erreicht' : ''}. ` +
    `Stand: ${status.mitHalle}/${status.spieleGesamt} Spiele mit Halle, ${status.hallen} Hallen.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (report.aborted) process.exit(1);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Spielort-Crawl fehlgeschlagen:', err);
    process.exit(1);
  });
}
