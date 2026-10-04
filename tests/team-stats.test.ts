const TeamStats = require('../portal/team-stats.js');

describe('TeamStats.items', () => {
  const summary = { rang: 2, played: 3, wins: 2, losses: 1, diff: 5, form: ['S', 'N', 'S'] };

  it('kompakt: Platz, Bilanz, Diff. und Letzte 5', () => {
    expect(TeamStats.items(summary, true)).toEqual([
      { value: '2.', label: 'Platz' }, { value: '2 – 1', label: 'Bilanz' }, { value: '+5', label: 'Diff.' }, { form: ['S', 'N', 'S'], label: 'Letzte 5' }
    ]);
  });

  it('groß: ausgeschriebene Beschriftungen', () => {
    expect(TeamStats.items(summary, false).map((i: any) => i.label)).toEqual(['Tabellenplatz', 'Bilanz (S – N)', 'Korbdifferenz', 'Form (letzte 5)']);
  });

  it('negative Differenz ohne Plus; ohne Spiele kompakt nichts, groß Platzhalter', () => {
    expect(TeamStats.items({ ...summary, diff: -3 }, true)[2].value).toBe('-3');
    expect(TeamStats.items({}, true)).toEqual([]);
    expect(TeamStats.items({}, false).map((i: any) => i.value)).toEqual(['–', '–', undefined]);
  });

  it('nur der Platz (Register ohne Live-Daten) ergibt eine einzelne Kachel', () => {
    expect(TeamStats.items({ rang: 4 }, true)).toEqual([{ value: '4.', label: 'Platz' }]);
  });
});
