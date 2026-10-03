import fs from 'fs';
import os from 'os';
import path from 'path';
import { seasonKey, normalize, playedCount, pickNewer, archive, readArchivedLiga, loadLive, hashOf } from '../crawler/archive';
import { LigaDoc } from '../crawler/live';

const match = (id: number, result: string | null = null): any => ({ matchId: id, kickoffDate: '2026-10-10', homeTeam: { teamPermanentId: 1 }, guestTeam: { teamPermanentId: 2 }, result });
const liga = (id: number, matches: any[], extra: Partial<LigaDoc> = {}): LigaDoc => ({
  ligaId: id, liganame: `Liga ${id}`, verbandName: 'Bayern', fetchedAt: '2026-10-03T00:00:00Z',
  tabelle: [{ rang: 1, team: { teamPermanentId: 1, teamname: 'A', clubId: 10 } }], matches, seasonName: '2026/2027', ...extra
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
const NOW = new Date('2026-10-03T12:00:00Z');

describe('seasonKey', () => {
  it('liest die Saison aus seasonName oder seasonId', () => {
    expect(seasonKey({ seasonName: '2026/2027' }, NOW)).toBe('2026-27');
    expect(seasonKey({ seasonName: '2026/27' }, NOW)).toBe('2026-27');
    expect(seasonKey({ seasonName: '2099-2100' }, NOW)).toBe('2099-00');
    expect(seasonKey({ seasonId: 2025 }, NOW)).toBe('2025-26');
  });
  it('rechnet ohne Angabe nach Datum, Wechsel am 1. Juli', () => {
    expect(seasonKey({}, new Date('2026-10-03T00:00:00Z'))).toBe('2026-27');
    expect(seasonKey({}, new Date('2027-06-30T00:00:00Z'))).toBe('2026-27');
    expect(seasonKey({}, new Date('2027-07-01T00:00:00Z'))).toBe('2027-28');
  });
});

describe('normalize / pickNewer', () => {
  it('entfernt fetchedAt, venues und halls', () => {
    const n = normalize({ ...liga(1, []), venues: { '1': 2 }, halls: { '2': {} } } as any);
    expect(n).not.toHaveProperty('fetchedAt');
    expect(n).not.toHaveProperty('venues');
    expect(n).not.toHaveProperty('halls');
  });

  it('zählt gespielte Spiele', () => {
    expect(playedCount({ matches: [match(1, '70:60'), match(2), match(3, '5:0')] })).toBe(2);
  });

  it('neue Fassung gewinnt bei gleichem oder mehr Stand, nie bei weniger gespielten Spielen oder leerer Antwort', () => {
    const old = normalize(liga(1, [match(1, '70:60'), match(2, '60:50')]));
    expect(pickNewer(old, normalize(liga(1, [match(1, '70:60'), match(2, '60:50'), match(3, '1:0')]))).replaced).toBe(true);
    expect(pickNewer(old, normalize(liga(1, [match(1, '70:60'), match(2)]))).replaced).toBe(false);
    expect(pickNewer(old, normalize(liga(1, [], { tabelle: [] }))).doc).toBe(old);
    expect(pickNewer(old, normalize(liga(1, [match(1, '70:60'), match(2, '60:50')]))).replaced).toBe(false);   // unverändert
    expect(pickNewer(null, old).replaced).toBe(true);
  });
});

describe('archive', () => {
  it('legt Ligen je Saison an und schreibt Index und lesbare Dateien', () => {
    const store = tmp();
    const r = archive([liga(2, [match(1, '70:60')]), liga(1, [match(1)]), liga(3, [], { tabelle: [] })], store, NOW);
    expect(r).toEqual([{ season: '2026-27', total: 2, added: 2, changed: 0, kept: 0 }]);
    expect(readArchivedLiga(store, '2026-27', 2)?.matches[0].result).toBe('70:60');
    expect(readArchivedLiga(store, '2026-27', 3)).toBeNull();           // leere Liga wird nicht angelegt
    const idx = JSON.parse(fs.readFileSync(path.join(store, '2026-27', 'index.json'), 'utf-8'));
    expect(idx.ligen.map((l: any) => [l.ligaId, l.played, l.matches])).toEqual([[1, 0, 1], [2, 1, 1]]);
    expect(idx.ligen[0].hash).toBe(hashOf(normalize(liga(1, [match(1)]))));
  });

  it('ist idempotent: ein zweiter Lauf mit gleichem Stand ändert nichts', () => {
    const store = tmp();
    archive([liga(1, [match(1, '70:60')])], store, NOW);
    const later = new Date('2026-11-01T00:00:00Z');
    const r = archive([liga(1, [match(1, '70:60')], { fetchedAt: '2026-11-01T00:00:00Z' })], store, later);
    expect(r[0]).toMatchObject({ added: 0, changed: 0, kept: 1 });
    const idx = JSON.parse(fs.readFileSync(path.join(store, '2026-27', 'index.json'), 'utf-8'));
    expect(idx.ligen[0].updated).toBe('2026-10-03');                      // Änderungstag bleibt
  });

  it('übernimmt neue Ergebnisse, behält aber den Stand bei unvollständiger Antwort', () => {
    const store = tmp();
    archive([liga(1, [match(1, '70:60'), match(2)])], store, NOW);
    archive([liga(1, [match(1, '70:60'), match(2, '55:50')])], store, new Date('2026-10-10T00:00:00Z'));
    expect(playedCount(readArchivedLiga(store, '2026-27', 1)!)).toBe(2);
    const r = archive([liga(1, [match(1)])], store, new Date('2026-10-11T00:00:00Z'));     // API liefert plötzlich weniger
    expect(r[0].kept).toBe(1);
    expect(playedCount(readArchivedLiga(store, '2026-27', 1)!)).toBe(2);
  });

  it('löscht keine Liga, die in den Live-Daten fehlt, und trennt Saisons', () => {
    const store = tmp();
    archive([liga(1, [match(1, '1:0')]), liga(2, [match(1, '1:0')])], store, NOW);
    archive([liga(2, [match(1, '1:0')]), liga(9, [match(1, '2:0')], { seasonName: '2027/2028' })], store, new Date('2027-09-01T00:00:00Z'));
    expect(readArchivedLiga(store, '2026-27', 1)).not.toBeNull();
    expect(readArchivedLiga(store, '2027-28', 9)).not.toBeNull();
  });
});

describe('loadLive', () => {
  it('liest liga/*.json und ignoriert andere Dateien', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'liga'));
    fs.writeFileSync(path.join(dir, 'liga', '5.json'), JSON.stringify(liga(5, [])));
    fs.writeFileSync(path.join(dir, 'liga', 'x.txt'), 'nein');
    expect(loadLive(dir).map(d => d.ligaId)).toEqual([5]);
    expect(loadLive('/nicht/vorhanden')).toEqual([]);
  });
});
