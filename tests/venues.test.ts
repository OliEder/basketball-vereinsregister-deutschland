import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  candidatesFromDocs, planFetches, runQueue, parseSpielfeld, loadLigaDocs, writeJsonAtomic, readJson, dayNumber,
  emptyStore, VenueStore, HallMap, Candidate
} from '../crawler/venues';

const TODAY = '2026-10-03';
const day = (offset: number) => new Date(dayNumber(TODAY) * 86_400_000 + offset * 86_400_000).toISOString().slice(0, 10);
const cand = (matchId: number, offset: number | null, played = false): Candidate => ({ matchId, date: offset === null ? null : day(offset), played });
const store = (entries: Record<number, [number, number]> = {}): VenueStore => ({ updated: '', matches: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v])) });

describe('candidatesFromDocs', () => {
  it('nimmt Spiele einmalig und lässt abgesagte und Verzichte aus', () => {
    const docs = [{ matches: [
      { matchId: 1, kickoffDate: '2026-10-10', result: null },
      { matchId: 1, kickoffDate: '2026-10-10' },
      { matchId: 2, kickoffDate: '2026-09-01', result: '70:60' },
      { matchId: 3, kickoffDate: '2026-10-11', abgesagt: true },
      { matchId: 4, kickoffDate: '2026-10-12', verzicht: true },
      { matchId: 5, abgesagt: null, verzicht: null },
      { kickoffDate: '2026-10-13' }
    ] }, { matches: undefined }];
    expect(candidatesFromDocs(docs)).toEqual([
      { matchId: 1, date: '2026-10-10', played: false },
      { matchId: 2, date: '2026-09-01', played: true },
      { matchId: 5, date: null, played: false }
    ]);
  });
});

describe('planFetches', () => {
  it('ordnet: nahe kommende ohne Eintrag, Auffrischung, weitere kommende, gespielte', () => {
    const t = dayNumber(TODAY);
    const s = store({ 20: [123, t - 1], 21: [123, t] });
    const plan = planFetches([
      cand(1, -30, true),   // gespielt ohne Eintrag
      cand(2, -2, true),    // gespielt ohne Eintrag, jünger
      cand(3, 40),          // weit in der Zukunft
      cand(4, 5),           // nächste 14 Tage
      cand(5, 1),           // nächste 14 Tage, früher
      cand(20, 3),          // Eintrag von gestern, nächste 7 Tage → auffrischen
      cand(21, 3),          // Eintrag von heute → nichts zu tun
      cand(6, 10)           // nächste 14 Tage
    ], s, TODAY);
    expect(plan).toEqual([5, 4, 6, 20, 3, 2, 1]);
  });

  it('holt unbekannte Hallen (0) erst nach einer Woche erneut', () => {
    const t = dayNumber(TODAY);
    expect(planFetches([cand(1, 30)], store({ 1: [0, t - 3] }), TODAY)).toEqual([]);
    expect(planFetches([cand(1, 30)], store({ 1: [0, t - 8] }), TODAY)).toEqual([1]);
    // innerhalb der nächsten 7 Tage wird täglich aufgefrischt, auch eine unbekannte Halle
    expect(planFetches([cand(2, 2)], store({ 2: [0, t - 1] }), TODAY)).toEqual([2]);
  });

  it('behandelt Spiele ohne Datum als kommend, aber zuletzt', () => {
    expect(planFetches([cand(1, null), cand(2, 30)], emptyStore(), TODAY)).toEqual([2, 1]);
  });

  it('lässt Spiele mit bekannter Halle aus, die weit in der Zukunft liegen', () => {
    const t = dayNumber(TODAY);
    expect(planFetches([cand(1, 30), cand(2, -5, true)], store({ 1: [5, t - 2], 2: [5, t - 100] }), TODAY)).toEqual([]);
  });
});

describe('parseSpielfeld', () => {
  it('liest Halle und Adresse', () => {
    expect(parseSpielfeld({ data: { matchInfo: { spielfeld: { id: 2433, bezeichnung: 'Lise-Meitner-Gymnasium', strasse: 'Jahnstr. 3', plz: '82008', ort: 'Unterhaching' } } } }))
      .toEqual({ hallId: 2433, hall: { bezeichnung: 'Lise-Meitner-Gymnasium', strasse: 'Jahnstr. 3', plz: '82008', ort: 'Unterhaching' } });
  });
  it('kennt fehlende oder leere Spielfelder als unbekannt', () => {
    expect(parseSpielfeld({ data: { matchInfo: null } })).toEqual({ hallId: 0, hall: null });
    expect(parseSpielfeld({ data: { matchInfo: { spielfeld: { id: 0, bezeichnung: 'x' } } } })).toEqual({ hallId: 0, hall: null });
    expect(parseSpielfeld(null)).toEqual({ hallId: 0, hall: null });
  });
});

describe('runQueue', () => {
  const ok = (hallId: number) => async () => ({ ok: true as const, hallId, hall: { bezeichnung: `H${hallId}`, strasse: null, plz: null, ort: 'Bonn' } });

  it('trägt Spiel, Halle und Abruftag ein', async () => {
    const s = emptyStore(); const h: HallMap = {};
    const r = await runQueue([1, 2], s, h, { fetchInfo: ok(7), today: TODAY, concurrency: 1 });
    expect(r).toMatchObject({ fetched: 2, errors: 0, aborted: false });
    expect(s.matches['1']).toEqual([7, dayNumber(TODAY)]);
    expect(h['7'].bezeichnung).toBe('H7');
  });

  it('beachtet maxRequests', async () => {
    const s = emptyStore();
    const r = await runQueue([1, 2, 3, 4], s, {}, { fetchInfo: ok(1), today: TODAY, maxRequests: 2, concurrency: 1 });
    expect(r.fetched).toBe(2);
    expect(Object.keys(s.matches)).toEqual(['1', '2']);
  });

  it('hält das Zeitbudget ein', async () => {
    let t = 1000;
    const r = await runQueue([1, 2, 3, 4, 5], emptyStore(), {}, { fetchInfo: async () => { t += 100; return { ok: true, hallId: 1, hall: null }; }, today: TODAY, concurrency: 1, deadline: 1250, now: () => t });
    expect(r.stoppedByBudget).toBe(true);
    expect(r.fetched).toBe(3); // 1000, 1100 und 1200 liegen vor dem Ende bei 1250
  });

  it('bricht bei zu vielen Fehlern ab und speichert Fehlschläge nicht', async () => {
    const s = emptyStore();
    const plan = Array.from({ length: 200 }, (_, i) => i + 1);
    const r = await runQueue(plan, s, {}, { fetchInfo: async () => ({ ok: false as const }), today: TODAY, concurrency: 1 });
    expect(r.aborted).toBe(true);
    expect(r.errors).toBeLessThan(200);
    expect(Object.keys(s.matches)).toHaveLength(0);
  });

  it('einzelne Fehler stören nicht', async () => {
    const s = emptyStore();
    const plan = Array.from({ length: 100 }, (_, i) => i + 1);
    const r = await runQueue(plan, s, {}, { fetchInfo: async id => (id % 20 === 0 ? { ok: false as const } : { ok: true as const, hallId: 3, hall: null }), today: TODAY, concurrency: 1 });
    expect(r.aborted).toBe(false);
    expect(r.errors).toBe(5);
    expect(Object.keys(s.matches)).toHaveLength(95);
  });
});

describe('Ein- und Ausgabe', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'venues-'));

  it('schreibt atomar und liest mit Rückfallwert', () => {
    const dir = tmp();
    const f = path.join(dir, 'sub', 'a.json');
    writeJsonAtomic(f, { x: 1 });
    expect(readJson(f, null)).toEqual({ x: 1 });
    expect(fs.existsSync(f + '.tmp')).toBe(false);
    expect(readJson(path.join(dir, 'fehlt.json'), { y: 2 })).toEqual({ y: 2 });
  });

  it('lädt Liga-Dokumente aus einem Ordner', async () => {
    const dir = tmp();
    writeJsonAtomic(path.join(dir, 'index.json'), { ligen: [{ ligaId: 1 }, { ligaId: 2 }] });
    writeJsonAtomic(path.join(dir, 'liga', '1.json'), { matches: [{ matchId: 10 }] });
    const docs = await loadLigaDocs(dir);
    expect(docs).toHaveLength(1); // Liga 2 fehlt und wird übersprungen
    expect(docs[0].matches).toEqual([{ matchId: 10 }]);
  });

  it('lädt Liga-Dokumente über eine URL', async () => {
    const calls: string[] = [];
    const fake = async (u: string) => { calls.push(u); return u.endsWith('index.json') ? { ligen: [{ ligaId: 5 }] } : { matches: [{ matchId: 1 }] }; };
    const docs = await loadLigaDocs('https://example.test/data/live/', fake);
    expect(calls).toEqual(['https://example.test/data/live/index.json', 'https://example.test/data/live/liga/5.json']);
    expect(docs).toHaveLength(1);
  });
});
