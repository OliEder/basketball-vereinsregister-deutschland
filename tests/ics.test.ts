import fs from 'fs';
import os from 'os';
import path from 'path';
import { SCOPES, escapeText, foldLine, berlinToUtc, formatUtc, locationOf, buildCalendar, collectTeams, IcsLiga } from '../crawler/ics';

const t = (id: number, name: string) => ({ teamPermanentId: id, teamname: name });
const liga: IcsLiga = {
  ligaId: 9, liganame: 'Kreisliga A, Gruppe 1', fetchedAt: '2026-10-03T09:00:00Z',
  matches: [
    { matchId: 1, kickoffDate: '2026-10-10', kickoffTime: '18:30', homeTeam: t(1, 'TV Test'), guestTeam: t(2, 'SV Gast') },
    { matchId: 2, kickoffDate: '2026-12-05', kickoffTime: '17:00', homeTeam: t(2, 'SV Gast'), guestTeam: t(1, 'TV Test'), abgesagt: true },
    { matchId: 3, kickoffDate: '2026-09-20', kickoffTime: '17:00', homeTeam: t(1, 'TV Test'), guestTeam: t(2, 'SV Gast'), result: '70:60' },   // zu alt
    { matchId: 4, kickoffDate: '2026-10-01', kickoffTime: '17:00', homeTeam: t(1, 'TV Test'), guestTeam: t(3, 'Dritte'), result: '80:60' },     // 2 Tage zurück
    { matchId: 5, kickoffDate: '2026-11-01', homeTeam: t(3, 'Dritte'), guestTeam: t(4, 'Andere') },                                                // fremdes Spiel
    { matchId: 6, kickoffDate: '2026-11-14', homeTeam: t(1, 'TV Test'), guestTeam: t(2, 'SV Gast') }                                                 // ohne Uhrzeit
  ],
  venues: { '1': 500 },
  halls: { '500': { bezeichnung: 'Sporthalle; Nord', strasse: 'Weg 1', plz: '93047', ort: 'Regensburg', lat: 49.01, lng: 12.1 } }
};

describe('Textfunktionen', () => {
  it('escapeText maskiert Sonderzeichen und Zeilenumbrüche', () => {
    expect(escapeText('A, B; C\\D\nE')).toBe('A\\, B\\; C\\\\D\\nE');
  });

  it('foldLine kürzt auf 75 Oktette und trennt kein UTF-8-Zeichen', () => {
    const line = 'SUMMARY:' + 'ä'.repeat(100);
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    folded.forEach(l => expect(Buffer.byteLength(l, 'utf-8')).toBeLessThanOrEqual(75));
    expect(folded.slice(1).every(l => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(line);
    expect(foldLine('kurz')).toBe('kurz');
  });
});

describe('Zeiten', () => {
  it('rechnet deutsche Ortszeit mit Sommer- und Winterzeit in UTC um', () => {
    expect(formatUtc(berlinToUtc('2026-10-10', '18:30'))).toBe('20261010T163000Z');   // MESZ (+2)
    expect(formatUtc(berlinToUtc('2026-12-05', '17:00'))).toBe('20261205T160000Z');   // MEZ (+1)
    expect(formatUtc(berlinToUtc('2027-03-28', '12:00'))).toBe('20270328T100000Z');   // Tag der Umstellung, schon Sommerzeit
    expect(formatUtc(berlinToUtc('2026-10-25', '12:00'))).toBe('20261025T110000Z');   // Tag der Rückstellung, schon Winterzeit
  });
});

describe('buildCalendar', () => {
  const ics = buildCalendar({ teamId: 1, name: 'TV Test', ligen: [liga], today: '2026-10-03', pageUrl: 'https://x.test/a/b/', stamp: '2026-10-03T09:00:00Z' });

  it('ist ein gültiger Rahmen mit CRLF und Zeitzonen-/Aktualisierungshinweisen', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:TV Test – Basketball');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('enthält eigene Spiele ab 7 Tage zurück, nicht ältere und keine fremden', () => {
    const uids = [...ics.matchAll(/UID:(.+)\r/g)].map(m => m[1]);
    expect(uids).toEqual(['m4-t1@vereinsregister', 'm1-t1@vereinsregister', 'm6-t1@vereinsregister', 'm2-t1@vereinsregister']);
  });

  it('Spiel mit Halle: Ort, Koordinaten, UTC-Zeit, Dauer', () => {
    const ev = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:m1-'))!;
    expect(ev).toContain('DTSTART:20261010T163000Z');
    expect(ev).toContain('DTEND:20261010T183000Z');
    expect(ev).toContain('SUMMARY:TV Test – SV Gast');
    expect(ev.replace(/\r\n /g, '')).toContain('LOCATION:Sporthalle\\; Nord\\, Weg 1\\, 93047 Regensburg');
    expect(ev).toContain('GEO:49.01;12.1');
    expect(ev).toContain('DESCRIPTION:Kreisliga A\\, Gruppe 1');
  });

  it('Ergebnis in der Beschreibung, abgesagte Spiele als CANCELLED, ohne Uhrzeit ganztägig', () => {
    expect(ics.split('BEGIN:VEVENT').find(e => e.includes('UID:m4-'))).toContain('Ergebnis: 80:60');
    expect(ics.split('BEGIN:VEVENT').find(e => e.includes('UID:m2-'))).toContain('STATUS:CANCELLED');
    const allDay = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:m6-'))!;
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261114');
    expect(allDay).toContain('DTEND;VALUE=DATE:20261115');
    expect(allDay).not.toContain('LOCATION');          // keine gemeldete Halle: kein Ort
  });

  it('gleicher Stand ergibt dieselbe Datei', () => {
    const again = buildCalendar({ teamId: 1, name: 'TV Test', ligen: [liga], today: '2026-10-03', pageUrl: 'https://x.test/a/b/', stamp: '2026-10-03T09:00:00Z' });
    expect(again).toBe(ics);
  });

  it('nur Heim- oder nur Auswärtsspiele mit eigenem Kalendernamen, gleiche UIDs', () => {
    const base = { teamId: 1, name: 'TV Test', ligen: [liga], today: '2026-10-03', stamp: '2026-10-03T09:00:00Z' };
    const home = buildCalendar({ ...base, scope: 'home' });
    const away = buildCalendar({ ...base, scope: 'away' });
    const uids = (c: string) => [...c.matchAll(/UID:(.+)\r/g)].map(m => m[1]);
    expect(uids(home)).toEqual(['m4-t1@vereinsregister', 'm1-t1@vereinsregister', 'm6-t1@vereinsregister']);
    expect(uids(away)).toEqual(['m2-t1@vereinsregister']);
    expect(home).toContain('X-WR-CALNAME:TV Test – Basketball – Heimspiele');
    expect(away).toContain('X-WR-CALNAME:TV Test – Basketball – Auswärtsspiele');
    expect(uids(ics)).toEqual(expect.arrayContaining([...uids(home), ...uids(away)]));
    expect(SCOPES.map(s => s.suffix)).toEqual(['', '-heim', '-auswaerts']);
  });

  it('ein Team ohne Spiele ergibt einen gültigen, leeren Kalender', () => {
    const empty = buildCalendar({ teamId: 77, name: 'Leer', ligen: [liga], today: '2026-10-03', stamp: '2026-10-03T09:00:00Z' });
    expect(empty).not.toContain('BEGIN:VEVENT');
    expect(empty).toContain('END:VCALENDAR');
  });
});

describe('Hilfen', () => {
  it('locationOf lässt fehlende Teile weg', () => {
    expect(locationOf({ bezeichnung: 'Halle', ort: 'Ulm' })).toBe('Halle, Ulm');
    expect(locationOf({ strasse: 'Weg 1' })).toBeNull();
    expect(locationOf(undefined)).toBeNull();
  });

  it('collectTeams sammelt Teams mit ihren Ligen aus Tabelle und Spielplan', () => {
    const m = collectTeams([{ ...liga, tabelle: [{ team: t(9, 'Nur Tabelle') }] } as any]);
    expect([...m.keys()].sort()).toEqual([1, 2, 3, 4, 9]);
    expect(m.get(1)!.name).toBe('TV Test');
  });
});

describe('CLI-Pfad', () => {
  it('schreibt je Team eine Datei', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-'));
    fs.mkdirSync(path.join(dir, 'live', 'liga'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'live', 'liga', '9.json'), JSON.stringify(liga));
    const { execFileSync } = require('child_process');
    execFileSync('npx', ['ts-node', 'crawler/ics.ts', `--live=${path.join(dir, 'live')}`, `--out=${path.join(dir, 'ics')}`], { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
    expect(fs.readdirSync(path.join(dir, 'ics')).sort()).toEqual(['1-auswaerts.ics', '1-heim.ics', '1.ics', '2-auswaerts.ics', '2-heim.ics', '2.ics', '3-auswaerts.ics', '3-heim.ics', '3.ics', '4-auswaerts.ics', '4-heim.ics', '4.ics']);
  });
});
