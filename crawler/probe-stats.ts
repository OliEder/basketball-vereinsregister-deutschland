// Prüft, welche Teamstatistik-Felder je Liga tatsächlich befüllt sind. Verändert keine Daten.
//
//   npm run probe-stats [-- --ligen=55802,55811,...] [-- --delay=1000]
//
// Je Liga: Teamstatistik-Endpunkt (Einträge, Stand, Anzahl Teams mit Wert > 0 pro Feld) und
// die Mannschaftssummen (homeTotalStats) eines beendeten Spiels. Spielerwerte werden weder
// gelesen noch gespeichert.

import fs from 'fs';

const BASE = 'https://www.basketball-bund.net/rest';
const HEADERS = { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' };

// Aktuelle Saison: 1. BBL, ProA, ProB Nord/Süd, 1. und 2. DBBL, eine Regionalliga und eine
// Jugend-Bezirksoberliga zum Vergleich der Erfassungstiefe.
const DEFAULT_LIGEN = [55802, 55811, 55815, 55817, 55738, 55746, 55749, 52514, 54937];

export const FELDER = ['pts', 'fouls', 'eff', 'ro', 'rd', 'rt', 'as', 'st', 'to', 'bs'] as const;
export const WURFARTEN = ['twoPoints', 'threePoints', 'wt', 'onePoints'] as const;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get(path: string): Promise<{ status: number; json: any }> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

/** Zählt je Feld, bei wie vielen Einträgen ein Wert > 0 steht (Wurfarten: made und attempted). */
export function fieldCoverage(entries: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FELDER) out[f] = entries.filter(e => Number(e?.[f]) > 0).length;
  for (const w of WURFARTEN) {
    out[`${w}.made`] = entries.filter(e => Number(e?.[w]?.made) > 0).length;
    out[`${w}.attempted`] = entries.filter(e => Number(e?.[w]?.attempted) > 0).length;
  }
  return out;
}

/** Mannschaftssummen eines Spiels: nur Felder mit Wert > 0, ohne Spielerdaten. */
export function nonZeroTotals(total: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!total) return out;
  for (const f of FELDER) if (Number(total[f]) > 0) out[f] = Number(total[f]);
  for (const w of WURFARTEN) {
    if (Number(total[w]?.made) > 0) out[`${w}.made`] = Number(total[w].made);
    if (Number(total[w]?.attempted) > 0) out[`${w}.attempted`] = Number(total[w].attempted);
  }
  return out;
}

async function probeLiga(ligaId: number, delay: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ligaId };
  const stat = await get(`/competition/teamstatistic/id/${ligaId}`);
  const ld = stat.json?.data?.ligaData;
  const entries: any[] = stat.json?.data?.teamStatistik?.statisticEntries ?? [];
  out.liganame = ld?.liganame ?? null;
  out.seasonName = ld?.seasonName ?? null;
  out.statisticType = ld?.statisticType ?? null;
  out.teamstatistik = {
    http: stat.status,
    apiStatus: stat.json?.status,
    eintraege: entries.length,
    stand: stat.json?.data?.teamStatistik?.stand ?? null,
    felderMitWert: fieldCoverage(entries),
    // Rohwerte des ersten Teams (Teamstatistik, keine Spielerdaten) zur Fehlersuche
    ersterEintrag: entries[0] ? { ...entries[0], tableTeamEntry: undefined } : null
  };
  await sleep(delay);

  const plan = await get(`/competition/spielplan/id/${ligaId}`);
  const played = (plan.json?.data?.matches ?? []).filter((m: any) => m.result && m.ergebnisbestaetigt === true);
  out.gespielteSpiele = played.length;
  await sleep(delay);

  if (played[0]) {
    const box = await get(`/match/id/${played[0].matchId}/boxscore`);
    out.boxscore = {
      http: box.status,
      matchId: played[0].matchId,
      statisticType: box.json?.data?.statisticType ?? null,
      boxscoreVorhanden: box.json?.data?.matchBoxscore != null,
      boxscoreSchluessel: Object.keys(box.json?.data?.matchBoxscore ?? {}),
      heimRoh: box.json?.data?.matchBoxscore?.homeTotalStats ?? null,
      heim: nonZeroTotals(box.json?.data?.matchBoxscore?.homeTotalStats),
      gast: nonZeroTotals(box.json?.data?.matchBoxscore?.guestTotalStats)
    };
    await sleep(delay);
  }
  return out;
}

async function main(): Promise<void> {
  const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const ligen = arg('ligen')?.split(',').map(Number).filter(Boolean) ?? DEFAULT_LIGEN;
  const delay = parseInt(arg('delay') ?? '1000', 10);

  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), ligen: [] as unknown[] };
  for (const id of ligen) {
    const r = await probeLiga(id, delay);
    (report.ligen as unknown[]).push(r);
    console.log(`  ${id}: ${r.liganame} – ${(r.teamstatistik as any).eintraege} Einträge`);
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync('probe-stats.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('Ergebnis: probe-stats.json');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Probe fehlgeschlagen:', err);
    process.exit(1);
  });
}
