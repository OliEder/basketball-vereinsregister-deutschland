// Messung für einen Live-Crawl (Tabelle + Spielplan pro Liga). Verändert keine Daten.
//
//   npm run probe-live [-- --sample=40] [-- --burst=20] [-- --concurrency=5]
//
// Ermittelt: Anzahl aller Ligen, Dauer/Größe der Abrufe pro Liga, Antwortstruktur des
// Spielplan-Endpunkts und ob die API bei parallelen Anfragen drosselt (429/5xx).

import fs from 'fs';
import { BbbClient } from './bbb-client';

const BASE = 'https://www.basketball-bund.net/rest';
const HEADERS = { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' };

interface Timing { ms: number; status: number; bytes: number; json: any }

function arg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? parseInt(hit.slice(name.length + 3), 10) : fallback;
}

async function timed(url: string): Promise<Timing> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
    return { ms: Date.now() - t0, status: res.status, bytes: Buffer.byteLength(text), json };
  } catch {
    return { ms: Date.now() - t0, status: 0, bytes: 0, json: null };
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);

async function probe(): Promise<void> {
  const sampleSize = arg('sample', 40);
  const burstSize = arg('burst', 20);
  const concurrency = arg('concurrency', 5);
  const client = new BbbClient();
  const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // 1. Alle Ligen zählen (Seiten wie im Monats-Crawl)
  console.log('1. Zähle Ligen...');
  const verbaende = await client.getVerbaende();
  const allLigen: { ligaId: number; liganame: string; verbandName: string }[] = [];
  for (const v of verbaende) {
    let start = 0;
    for (;;) {
      const { ligen, hasMoreData } = await client.getLigen(v.id, start);
      if (ligen.length === 0) break;
      allLigen.push(...ligen.map(l => ({ ligaId: l.ligaId, liganame: l.liganame, verbandName: v.label })));
      if (!hasMoreData) break;
      start += ligen.length;
    }
  }
  const distinct = new Map(allLigen.map(l => [l.ligaId, l]));
  report.ligenGesamt = distinct.size;
  console.log(`   ${distinct.size} verschiedene Ligen in ${verbaende.length} Verbänden.`);

  // 2. Stichprobe, gleichmäßig über die Liste verteilt
  const all = Array.from(distinct.values());
  const step = Math.max(1, Math.floor(all.length / sampleSize));
  const sample = all.filter((_, i) => i % step === 0).slice(0, sampleSize);
  console.log(`2. Stichprobe: ${sample.length} Ligen (je Tabelle + Spielplan, mit 1,1 s Pause)...`);

  const rows: any[] = [];
  for (const liga of sample) {
    const table = await timed(`${BASE}/competition/table/id/${liga.ligaId}`);
    await sleep(1100);
    const plan = await timed(`${BASE}/competition/spielplan/id/${liga.ligaId}`);
    await sleep(1100);
    const d = plan.json?.data;
    rows.push({
      ligaId: liga.ligaId,
      liganame: liga.liganame,
      table: { status: table.status, ms: table.ms, bytes: table.bytes, entries: table.json?.data?.tabelle?.entries?.length ?? null },
      spielplan: {
        status: plan.status, ms: plan.ms, bytes: plan.bytes,
        dataKeys: d ? Object.keys(d) : null,
        spieltage: Array.isArray(d?.spieltage) ? d.spieltage.length : null,
        inlineMatches: Array.isArray(d?.matches) ? d.matches.length : null
      }
    });
  }
  report.stichprobe = rows;

  // 3. Spieltag-Abruf: gibt es pro Spieltag die Spiele?
  const withDays = rows.find(r => (r.spielplan.spieltage ?? 0) > 0);
  if (withDays) {
    const plan = await timed(`${BASE}/competition/spielplan/id/${withDays.ligaId}`);
    const first = plan.json.data.spieltage[0];
    const md = await timed(`${BASE}/competition/id/${withDays.ligaId}/matchday/${first.spieltag}`);
    const m = md.json?.data?.matches?.[0];
    report.spieltagBeispiel = {
      ligaId: withDays.ligaId, status: md.status, ms: md.ms, bytes: md.bytes,
      matches: md.json?.data?.matches?.length ?? null,
      matchKeys: m ? Object.keys(m) : null
    };
  }

  // 4. Drosselung: Anfragen ohne Pause, parallel
  console.log(`3. Burst: ${burstSize} Anfragen, ${concurrency} parallel, ohne Pause...`);
  const burstUrls = Array.from({ length: burstSize }, (_, i) => `${BASE}/competition/table/id/${sample[i % sample.length].ligaId}`);
  const burst: Timing[] = [];
  let next = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < burstUrls.length) burst.push(await timed(burstUrls[next++]));
  }));
  const statusCount: Record<string, number> = {};
  burst.forEach(b => { statusCount[b.status] = (statusCount[b.status] ?? 0) + 1; });
  report.burst = { requests: burst.length, concurrency, totalMs: Date.now() - t0, avgMs: avg(burst.map(b => b.ms)), status: statusCount };

  // 5. Hochrechnung
  const tableMs = rows.map(r => r.table.ms);
  const planMs = rows.map(r => r.spielplan.ms);
  const bytes = rows.map(r => r.table.bytes + r.spielplan.bytes);
  const perLigaSeq = avg(tableMs) + avg(planMs) + 2200;
  report.hochrechnung = {
    avgTableMs: avg(tableMs), p95TableMs: pct(tableMs, 0.95),
    avgSpielplanMs: avg(planMs), p95SpielplanMs: pct(planMs, 0.95),
    avgBytesProLiga: avg(bytes),
    gesamtMB: Math.round((avg(bytes) * distinct.size) / 1e5) / 10,
    laufzeitSequentiellMinuten: Math.round((perLigaSeq * distinct.size) / 60000),
    laufzeitParallelMinuten: Math.round(((avg(tableMs) + avg(planMs)) * distinct.size) / concurrency / 60000)
  };
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync('probe-live.json', JSON.stringify(report, null, 2), 'utf-8');
  const summary = JSON.stringify({ ligenGesamt: report.ligenGesamt, burst: report.burst, hochrechnung: report.hochrechnung, spieltagBeispiel: report.spieltagBeispiel }, null, 2);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```json\n' + summary + '\n```\n');
}

probe().catch(err => {
  console.error('Probe fehlgeschlagen:', err);
  process.exit(1);
});
