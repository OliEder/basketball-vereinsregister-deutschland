// Kalender-Abo: je Team drei .ics-Dateien aus den Live-Daten samt Spielorten:
//   ics/<teamPermanentId>.ics (alle Spiele), -heim.ics (nur Heimspiele), -auswaerts.ics (nur Auswärtsspiele)
//
//   npx ts-node crawler/ics.ts --live=_site/data/live --out=_site/ics [--team-urls=_site/data/team-url-map.json] [--base=https://…] [--manifest=<datei>]
//
// Inkrementell: Mit --manifest merkt sich der Lauf je Team einen Hash seiner Eingaben (Rohdaten seiner Ligen, Name, Seitenadresse,
// Zahl der sichtbaren Spiele, Programmstand). Stimmt der Hash und liegen die drei Dateien schon in --out (aus dem Cache des letzten Laufs),
// wird das Team übersprungen; Dateien von Teams, die es nicht mehr gibt, werden entfernt.
//
// Die Datei heißt nach der Team-ID und bleibt daher stabil, auch wenn ein Verein auf eine andere Seite umzieht.
// Enthalten sind Spiele ab 7 Tage zurück (Ergebnis in der Beschreibung) und alle kommenden. Der Spielort steht nur,
// wenn die Halle aus matchInfo gemeldet ist (liga/<id>.json: venues und halls, siehe apply-venues.ts).
// Zeiten sind deutsche Ortszeit und werden als UTC ausgegeben; Kalender-Apps rechnen sie in die eigene Zeitzone um.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DEFAULT_BASE } from './seo';

export interface IcsMatch {
  matchId: number;
  kickoffDate?: string;
  kickoffTime?: string;
  homeTeam?: { teamPermanentId?: number; teamname?: string };
  guestTeam?: { teamPermanentId?: number; teamname?: string };
  result?: string | null;
  abgesagt?: boolean;
  verzicht?: boolean;
}

export interface IcsHall { bezeichnung?: string; strasse?: string | null; plz?: string | null; ort?: string | null; lat?: number | null; lng?: number | null }

export interface IcsLiga {
  ligaId: number;
  liganame: string;
  fetchedAt?: string;
  matches: IcsMatch[];
  venues?: Record<string, number | string>;
  halls?: Record<string, IcsHall>;
}

/** RFC 5545: Backslash, Semikolon, Komma und Zeilenumbrüche maskieren. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen auf höchstens 75 Oktette kürzen (Fortsetzung mit Leerzeichen), ohne ein UTF-8-Zeichen zu teilen. */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let limit = 75;
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf-8') > limit) {
      out.push(cur);
      cur = ' ';
      limit = 75;   // die Fortsetzungszeile zählt das führende Leerzeichen mit
    }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

function berlinOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find(p => p.type === t)!.value);
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - utcMs) / 60000);
}

/** Deutsche Ortszeit (YYYY-MM-DD, HH:MM) → UTC in Millisekunden; berücksichtigt Sommer- und Winterzeit. */
export function berlinToUtc(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = berlinOffsetMinutes(guess);
  let utc = guess - off1 * 60000;
  const off2 = berlinOffsetMinutes(utc);
  if (off2 !== off1) utc = guess - off2 * 60000;
  return utc;
}

export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const dateCompact = (d: string): string => d.replace(/-/g, '');

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const MATCH_MINUTES = 120;

export function locationOf(hall: IcsHall | undefined): string | null {
  if (!hall || !hall.bezeichnung) return null;
  const place = [hall.plz, hall.ort].filter(Boolean).join(' ');
  return [hall.bezeichnung, hall.strasse, place].filter(Boolean).join(', ');
}

export type IcsScope = 'all' | 'home' | 'away';
export const SCOPES: { scope: IcsScope; suffix: string; label: string }[] = [
  { scope: 'all', suffix: '', label: '' },
  { scope: 'home', suffix: '-heim', label: ' – Heimspiele' },
  { scope: 'away', suffix: '-auswaerts', label: ' – Auswärtsspiele' }
];

export interface CalendarOptions {
  teamId: number;
  scope?: IcsScope;               // alle Spiele (Standard), nur Heim- oder nur Auswärtsspiele
  name: string;
  ligen: IcsLiga[];
  today: string;                  // YYYY-MM-DD
  pageUrl?: string;
  stamp: string;                  // ISO-Zeitpunkt für DTSTAMP (Stand der Daten, damit gleicher Stand gleiche Datei ergibt)
}

export function buildCalendar(o: CalendarOptions): string {
  const from = addDays(o.today, -7);
  const scope = o.scope ?? 'all';
  const title = `${o.name} – Basketball${SCOPES.find(s => s.scope === scope)!.label}`;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Basketball Vereinsregister//Spielplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(title)}`,
    `NAME:${escapeText(title)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H'
  ];
  if (o.pageUrl) lines.push(`X-WR-CALDESC:${escapeText(`Spielplan von ${o.name}. Aktuelle Tabelle und Ergebnisse: ${o.pageUrl}`)}`);

  const stamp = formatUtc(Date.parse(o.stamp));
  const seen = new Set<number>();
  const events: { start: string; lines: string[] }[] = [];

  for (const liga of o.ligen) {
    for (const m of liga.matches ?? []) {
      const home = m.homeTeam?.teamPermanentId === o.teamId;
      const guest = m.guestTeam?.teamPermanentId === o.teamId;
      if (!(home || guest) || !m.kickoffDate || m.kickoffDate < from || seen.has(m.matchId)) continue;
      if ((scope === 'home' && !home) || (scope === 'away' && !guest)) continue;
      seen.add(m.matchId);

      const cancelled = !!m.abgesagt || !!m.verzicht;
      const summary = `${m.homeTeam?.teamname ?? '?'} – ${m.guestTeam?.teamname ?? '?'}`;
      const ev: string[] = ['BEGIN:VEVENT', `UID:m${m.matchId}-t${o.teamId}@vereinsregister`, `DTSTAMP:${stamp}`];
      if (m.kickoffTime && /^\d{1,2}:\d{2}$/.test(m.kickoffTime)) {
        const start = berlinToUtc(m.kickoffDate, m.kickoffTime.padStart(5, '0'));
        ev.push(`DTSTART:${formatUtc(start)}`, `DTEND:${formatUtc(start + MATCH_MINUTES * 60000)}`);
      } else {
        ev.push(`DTSTART;VALUE=DATE:${dateCompact(m.kickoffDate)}`, `DTEND;VALUE=DATE:${dateCompact(addDays(m.kickoffDate, 1))}`);
      }
      ev.push(`SUMMARY:${escapeText(summary)}`);

      const hallId = liga.venues?.[String(m.matchId)];
      const hall = hallId != null ? liga.halls?.[String(hallId)] : undefined;
      const loc = locationOf(hall);
      if (loc) {
        ev.push(`LOCATION:${escapeText(loc)}`);
        if (typeof hall!.lat === 'number' && typeof hall!.lng === 'number') ev.push(`GEO:${hall!.lat};${hall!.lng}`);
      }
      const desc = [liga.liganame];
      if (m.result) desc.push(`Ergebnis: ${m.result}`);
      if (m.verzicht) desc.push('Verzicht');
      else if (m.abgesagt) desc.push('Abgesagt');
      ev.push(`DESCRIPTION:${escapeText(desc.join('\n'))}`);
      if (cancelled) ev.push('STATUS:CANCELLED');
      ev.push('END:VEVENT');
      events.push({ start: `${m.kickoffDate} ${m.kickoffTime ?? ''}`, lines: ev });
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  for (const e of events) lines.push(...e.lines);
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** teamPermanentId → Name und Ligen, in denen das Team in Tabelle oder Spielplan vorkommt. */
export function collectTeams(docs: IcsLiga[]): Map<number, { name: string; ligen: IcsLiga[] }> {
  const out = new Map<number, { name: string; ligen: IcsLiga[] }>();
  const add = (t: { teamPermanentId?: number; teamname?: string } | undefined, doc: IcsLiga) => {
    if (!t?.teamPermanentId) return;
    const e = out.get(t.teamPermanentId) ?? { name: t.teamname ?? `Team ${t.teamPermanentId}`, ligen: [] };
    if (!e.ligen.includes(doc)) e.ligen.push(doc);
    out.set(t.teamPermanentId, e);
  };
  for (const doc of docs) {
    for (const e of (doc as any).tabelle ?? []) add(e?.team, doc);
    for (const m of doc.matches ?? []) { add(m.homeTeam, doc); add(m.guestTeam, doc); }
  }
  return out;
}

const sha1 = (data: string | Buffer): string => crypto.createHash('sha1').update(data).digest('hex');

/** Hash des Programmstands: Änderungen an diesem Modul machen alle gespeicherten Kalender ungültig. */
export function codeVersion(): string {
  try { return sha1(fs.readFileSync(__filename)).slice(0, 12); } catch { return 'unbekannt'; }
}

export interface HashedLiga { doc: IcsLiga; hash: string }                    // hash: Hash der Rohdatei der Liga
export interface Manifest { version: string; teams: Record<string, string> }

export interface GenerateOptions {
  ligen: HashedLiga[];
  out: string;
  manifestFile?: string;
  teamUrls?: Record<string, string>;
  base: string;
  today: string;
  version?: string;
  now?: string;                    // Ersatz für den Zeitpunkt, wenn keine Liga einen Datenstand hat (Tests)
}

export interface GenerateResult { teams: number; built: number; skipped: number; pruned: number }

const FILE_RE = /^(\d+)(-heim|-auswaerts)?\.ics$/;

/** Erzeugt die Kalender; mit Manifest nur für Teams, deren Eingaben sich geändert haben (oder deren Dateien fehlen). */
export function generateCalendars(o: GenerateOptions): GenerateResult {
  const version = o.version ?? codeVersion();
  const from = addDays(o.today, -7);
  const info = new Map<IcsLiga, string>();                                  // Liga → Hash der Rohdatei und Zahl der noch sichtbaren Spiele
  for (const l of o.ligen) info.set(l.doc, `${l.doc.ligaId}:${l.hash}:${(l.doc.matches ?? []).filter(m => (m.kickoffDate ?? '') >= from).length}`);

  let previous: Record<string, string> = {};
  if (o.manifestFile && fs.existsSync(o.manifestFile)) {
    try { const m: Manifest = JSON.parse(fs.readFileSync(o.manifestFile, 'utf-8')); if (m.version === version) previous = m.teams ?? {}; } catch { /* kaputtes Manifest: alles neu */ }
  }

  fs.mkdirSync(o.out, { recursive: true });
  const teams = collectTeams(o.ligen.map(l => l.doc));
  const next: Record<string, string> = {};
  let built = 0, skipped = 0;
  for (const [teamId, t] of teams) {
    const page = o.teamUrls?.[String(teamId)] ? `${o.base}/${o.teamUrls[String(teamId)]}` : undefined;
    const hash = sha1([version, t.name, page ?? '', ...t.ligen.map(l => info.get(l)).sort()].join('\n'));
    next[String(teamId)] = hash;
    const files = SCOPES.map(v => path.join(o.out, `${teamId}${v.suffix}.ics`));
    if (previous[String(teamId)] === hash && files.every(f => fs.existsSync(f))) { skipped++; continue; }
    const stamp = t.ligen.map(l => l.fetchedAt ?? '').sort().pop() || o.now || new Date().toISOString();
    SCOPES.forEach((v, i) => fs.writeFileSync(files[i], buildCalendar({ teamId, scope: v.scope, name: t.name, ligen: t.ligen, today: o.today, pageUrl: page, stamp }), 'utf-8'));
    built++;
  }

  let pruned = 0;                                                           // Kalender von Teams, die es nicht mehr gibt
  for (const f of fs.readdirSync(o.out)) {
    const m = FILE_RE.exec(f);
    if (m && !teams.has(Number(m[1]))) { fs.rmSync(path.join(o.out, f)); pruned++; }
  }
  if (o.manifestFile) fs.writeFileSync(o.manifestFile, JSON.stringify({ version, teams: next } satisfies Manifest), 'utf-8');
  return { teams: teams.size, built, skipped, pruned };
}

function arg(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function main(): void {
  const live = arg('live') ?? '_site/data/live';
  const out = arg('out') ?? '_site/ics';
  const base = (arg('base') ?? process.env.SITE_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
  const teamUrlsFile = arg('team-urls');
  const teamUrls: Record<string, string> = teamUrlsFile && fs.existsSync(teamUrlsFile) ? JSON.parse(fs.readFileSync(teamUrlsFile, 'utf-8')) : {};

  const dir = path.join(live, 'liga');
  if (!fs.existsSync(dir)) { console.log(`Keine Live-Daten in ${live}; keine Kalender.`); return; }
  const ligen: HashedLiga[] = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const raw = fs.readFileSync(path.join(dir, f));
    return { doc: JSON.parse(raw.toString('utf-8')) as IcsLiga, hash: sha1(raw) };
  });
  const r = generateCalendars({ ligen, out, manifestFile: arg('manifest'), teamUrls, base, today: new Date().toISOString().slice(0, 10) });
  console.log(`Kalender: ${r.teams} Teams × ${SCOPES.length} Abos → ${out} (neu ${r.built}, unverändert ${r.skipped}, entfernt ${r.pruned})`);
}

if (require.main === module) main();
