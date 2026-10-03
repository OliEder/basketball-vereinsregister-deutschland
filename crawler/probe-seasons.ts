// Sondiert die Liga-ID-Systematik und den Zugriff auf frühere Saisons. Verändert keine Daten.
//
//   npm run probe-seasons [-- --max=57000] [-- --step=250] [-- --delay=1000]
//
// 1. Tastet die Liga-IDs von 1 bis --max im Abstand --step per Tabellen-Abruf ab und
//    notiert Saison, Verband und Ebene (ligaData). Daraus ergeben sich die ID-Blöcke je Saison.
// 2. Prüft die Beispiel-IDs der API-Beschreibung (Tabelle, Spielplan, Kreuztabelle,
//    Teamstatistik) auf Verfügbarkeit und Struktur.

import fs from 'fs';

const BASE = 'https://www.basketball-bund.net/rest';
const HEADERS = { 'User-Agent': 'Vereinsregister/1.0 (https://github.com/vereinsregister)' };

// IDs aus den Beispielen der API-Beschreibung (Saison 2025/26) und eine aktuelle Liga
const EXAMPLE_IDS = [51536, 51933, 51938, 51961, 52514];

function arg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? parseInt(hit.slice(name.length + 3), 10) : fallback;
}

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

export interface Sample {
  ligaId: number;
  http: number;
  apiStatus?: string;
  seasonId?: number | null;
  seasonName?: string | null;
  liganame?: string | null;
  verbandName?: string | null;
  ebene?: string | null;
  bezirk?: string | null;
  tableExists?: boolean | null;
  tabelleEintraege?: number;
}

export function summarize(ligaId: number, http: number, json: any): Sample {
  const ld = json?.data?.ligaData ?? null;
  return {
    ligaId,
    http,
    apiStatus: json?.status,
    seasonId: ld?.seasonId ?? null,
    seasonName: ld?.seasonName ?? null,
    liganame: ld?.liganame ?? null,
    verbandName: ld?.verbandName ?? null,
    ebene: ld?.skEbeneName ?? null,
    bezirk: ld?.bezirkName ?? null,
    tableExists: ld?.tableExists ?? null,
    tabelleEintraege: json?.data?.tabelle?.entries?.length ?? 0
  };
}

/** Fasst die Stichproben je Saison zusammen: kleinste/größte gefundene ID und Anzahl. */
export function seasonBlocks(samples: Sample[]): { season: string; minId: number; maxId: number; samples: number }[] {
  const by = new Map<string, Sample[]>();
  for (const s of samples) {
    if (s.seasonName == null) continue;
    by.set(s.seasonName, [...(by.get(s.seasonName) ?? []), s]);
  }
  return [...by.entries()]
    .map(([season, xs]) => ({
      season,
      minId: Math.min(...xs.map(x => x.ligaId)),
      maxId: Math.max(...xs.map(x => x.ligaId)),
      samples: xs.length
    }))
    .sort((a, b) => a.minId - b.minId);
}

async function probeExample(id: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ligaId: id };
  const table = await get(`/competition/table/id/${id}`);
  out.table = summarize(id, table.status, table.json);
  await sleep(1000);

  const plan = await get(`/competition/spielplan/id/${id}`);
  const matches: any[] = plan.json?.data?.matches ?? [];
  out.spielplan = {
    http: plan.status,
    spiele: matches.length,
    mitErgebnis: matches.filter(m => m.result).length,
    ligaDataImSpiel: matches.some(m => m.ligaData),
    matchInfoImSpielplan: matches.some(m => m.matchInfo)
  };
  await sleep(1000);

  const cross = await get(`/competition/crosstable/id/${id}`);
  out.kreuztabelle = { http: cross.status, teams: cross.json?.data?.kreuztabelle?.teams?.length ?? 0 };
  await sleep(1000);

  const stat = await get(`/competition/teamstatistic/id/${id}`);
  const entries: any[] = stat.json?.data?.teamStatistik?.statisticEntries ?? [];
  out.teamstatistik = {
    http: stat.status,
    eintraege: entries.length,
    stand: stat.json?.data?.teamStatistik?.stand ?? null,
    statisticType: stat.json?.data?.ligaData?.statisticType ?? null,
    ersterEintrag: entries[0]
      ? {
          pts: entries[0].pts,
          fouls: entries[0].fouls,
          freiwurfVersuche: entries[0].onePoints?.attempted,
          zweierVersuche: entries[0].twoPoints?.attempted,
          rebounds: entries[0].rt
        }
      : null
  };
  await sleep(1000);

  const first = matches.find(m => m.matchId);
  if (first) {
    const info = await get(`/match/id/${first.matchId}/matchInfo`);
    out.matchInfo = { http: info.status, matchId: first.matchId, spielfeld: info.json?.data?.matchInfo?.spielfeld ?? null };
  }
  return out;
}

async function main(): Promise<void> {
  const max = arg('max', 57000);
  const step = arg('step', 250);
  const delay = arg('delay', 1000);
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), max, step };

  console.log('1. Beispiel-IDs der API-Beschreibung...');
  const examples: Record<string, unknown>[] = [];
  for (const id of EXAMPLE_IDS) {
    examples.push(await probeExample(id));
    console.log(`  ${id}: ${JSON.stringify((examples[examples.length - 1] as any).table?.seasonName)}`);
  }
  report.examples = examples;

  console.log(`2. Tastet Liga-IDs 1..${max} im Abstand ${step} ab...`);
  const samples: Sample[] = [];
  for (let id = step; id <= max; id += step) {
    const r = await get(`/competition/table/id/${id}`);
    samples.push(summarize(id, r.status, r.json));
    if (samples.length % 20 === 0) console.log(`  ${samples.length} Stichproben...`);
    await sleep(delay);
  }
  report.samples = samples;
  report.seasonBlocks = seasonBlocks(samples);
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync('probe-seasons.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('Ergebnis: probe-seasons.json');
  console.table(report.seasonBlocks);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Probe fehlgeschlagen:', err);
    process.exit(1);
  });
}
