import { summarize, seasonBlocks, Sample } from '../crawler/probe-seasons';

describe('probe-seasons', () => {
  it('summarize liest Saison, Verband und Ebene aus ligaData', () => {
    const json = {
      status: '0',
      data: {
        ligaData: { seasonId: 2025, seasonName: '2025/2026', liganame: 'U10m Bezirksliga Oberpfalz', verbandName: 'Bayern', skEbeneName: 'Bezirk', bezirkName: 'Oberpfalz', tableExists: true },
        tabelle: { entries: [{}, {}] }
      }
    };
    expect(summarize(51961, 200, json)).toMatchObject({
      ligaId: 51961, seasonName: '2025/2026', verbandName: 'Bayern', ebene: 'Bezirk', bezirk: 'Oberpfalz', tabelleEintraege: 2
    });
  });

  it('summarize übersteht Fehlerantworten ohne ligaData', () => {
    expect(summarize(1, 404, null)).toMatchObject({ ligaId: 1, http: 404, seasonName: null, tabelleEintraege: 0 });
  });

  it('seasonBlocks fasst die Stichproben je Saison zusammen', () => {
    const s = (ligaId: number, seasonName: string | null): Sample => ({ ligaId, http: 200, seasonName });
    expect(seasonBlocks([s(250, '2024/2025'), s(500, '2024/2025'), s(750, '2025/2026'), s(1000, null), s(1250, '2025/2026')])).toEqual([
      { season: '2024/2025', minId: 250, maxId: 500, samples: 2 },
      { season: '2025/2026', minId: 750, maxId: 1250, samples: 2 }
    ]);
  });
});
