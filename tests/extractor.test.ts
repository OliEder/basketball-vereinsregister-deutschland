// tests/extractor.test.ts
import { extractClubs, extractCityFromName, cityCandidates, extractTeams, regionFields, teamsFromMatches, addCompetition, isSideCompetition, Competition } from '../crawler/extractor';
import { BbbTableEntry, TeamEntry } from '../crawler/types';

const makeEntry = (clubId: number, teamname: string, teamPermanentId: number): BbbTableEntry => ({
  rang: 1,
  team: { seasonTeamId: 1, teamPermanentId, teamname, teamnameSmall: '', clubId }
});

describe('extractCityFromName', () => {
  it('returns last word as city', () => {
    expect(extractCityFromName('Fibalon Baskets Regensburg')).toBe('Regensburg');
  });

  it('ignores legal form and founding year at the end', () => {
    expect(extractCityFromName('SV Eidelstedt e.V.')).toBe('Eidelstedt');
    expect(extractCityFromName('TSV Calw von 1846 e. V.')).toBe('Calw');
    expect(extractCityFromName('TSV Nahe von 1924 e.V.')).toBe('Nahe');
    expect(extractCityFromName('Bremen 1860')).toBe('Bremen');
    expect(extractCityFromName('TB Sigmaringen e. V.')).toBe('Sigmaringen');
    expect(extractCityFromName('Sportverein Weyhe eV')).toBe('Weyhe');
    expect(extractCityFromName('SG Bramsche e. V. 1966')).toBe('Bramsche');
  });

  it('still strips team numbers and takes the first part of slash cities', () => {
    expect(extractCityFromName('Bonn 2. Mannschaft')).toBe('Bonn');
    expect(extractCityFromName('Berlin (1)')).toBe('Berlin');
    expect(extractCityFromName('BG Marburg/Keltern')).toBe('Marburg');
  });

  it('handles single word', () => {
    expect(extractCityFromName('München')).toBe('München');
  });
});

describe('cityCandidates', () => {
  it('entfernt Vereinskürzel, Rechtsform, Baskets und Basketball', () => {
    expect(cityCandidates('SV Eidelstedt e.V.')).toEqual(['Eidelstedt']);
    expect(cityCandidates('TSV Calw von 1846 e. V.')).toEqual(['Calw']);
    expect(cityCandidates('DJK Adler Union Essen Frintrop e.V.')[0]).toBe('Frintrop');
    expect(cityCandidates('Fibalon Baskets Regensburg')).toEqual(['Regensburg', 'Fibalon']);
    expect(cityCandidates('FC Bayern Basketball')).toEqual(['Bayern']);
    expect(cityCandidates('Basketball Club Dresden e.V.')).toEqual(['Dresden']);
    expect(cityCandidates('Hamburger SV')).toContain('Hamburg');
  });

  it('liefert bei Adjektivformen die Grundform mit', () => {
    expect(cityCandidates('Eckernförder MTV')).toEqual(['Eckernförder', 'Eckernförd', 'Eckernförde']);
    expect(cityCandidates('Barmstedter MTV').slice(0, 2)).toEqual(['Barmstedter', 'Barmstedt']);
    expect(cityCandidates('Mönchengladbacher TV')).toContain('Mönchengladbach');
  });

  it('lässt Orte mit Bindestrich und Schrägstrich heil', () => {
    expect(cityCandidates('TuS Baden-Baden')).toEqual(['Baden-Baden']);
    expect(cityCandidates('BG Marburg/Keltern')).toEqual(['Marburg']);
    expect(cityCandidates('Post-SV Bonn 1926 e. V.')).toEqual(['Bonn']);
  });

  it('überspringt Jahreszahlen, "von" und Abkürzungen mit Punkt; Kürzel am Anfang eines Bindestrich-Worts fallen weg', () => {
    expect(cityCandidates('TV von 1912 Verl e. V.')).toEqual(['Verl']);
    expect(cityCandidates('TV 03 Wörth a.Rh. e. V.')).toEqual(['Wörth am Rhein', 'Wörth']);
    expect(cityCandidates('DJK-Köln-Ost e.V.')).toEqual(['Köln-Ost']);
    expect(cityCandidates('Blau-Weiß Merzen e. V.')[0]).toBe('Merzen');
  });

  it('behält Ortszusätze wie a.Rh. und schreibt sie aus', () => {
    expect(cityCandidates('Offenbach a.M. e.V.')).toEqual(['Offenbach am Main', 'Offenbach']);
    expect(cityCandidates('SV Neustadt a.d. Donau')).toEqual(['Neustadt an der Donau', 'Neustadt']);
    expect(cityCandidates('TSV Kirchheim b. München')[0]).toBe('Kirchheim bei München');
    expect(cityCandidates('TV Waldkirch i. Br.')[0]).toBe('Waldkirch im Breisgau');
  });

  it('gibt nichts zurück, wenn nur Kürzel übrig bleiben', () => {
    expect(cityCandidates('TSV MTV')).toEqual([]);
    expect(extractCityFromName('MTV')).toBe('MTV'); // wie bisher das letzte Wort
  });
});

describe('extractCityFromName ohne Kürzel', () => {
  it('nimmt nicht mehr das Kürzel am Ende', () => {
    expect(extractCityFromName('Eckernförder MTV')).toBe('Eckernförder');
    expect(extractCityFromName('Mönchengladbacher TV')).toBe('Mönchengladbacher');
    expect(extractCityFromName('Hagener SV')).toBe('Hagener');
  });
});

describe('extractClubs', () => {
  it('deduplicates by clubId', () => {
    const entries = [
      makeEntry(428, 'Fibalon Baskets Regensburg', 1001),
      makeEntry(428, 'Fibalon Baskets Regensburg U16', 1002),
      makeEntry(999, 'Bayern Baskets München', 2001),
    ];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs).toHaveLength(2);
    expect(clubs.map(c => c.clubId)).toContain(428);
    expect(clubs.map(c => c.clubId)).toContain(999);
  });

  it('sets logoUrl from teamPermanentId', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].logoUrl).toBe('https://www.basketball-bund.net/media/team/1001/logo');
  });

  it('sets verbandId and verbandName', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].verbandId).toBe(2);
    expect(clubs[0].verbandName).toBe('Bayern');
  });

  it('sets geocodedFrom to extracted city', () => {
    const entries = [makeEntry(428, 'Fibalon Baskets Regensburg', 1001)];
    const clubs = extractClubs(entries, 2, 'Bayern');
    expect(clubs[0].geocodedFrom).toBe('Regensburg');
  });
});


describe('extractTeams', () => {
  it('groups teamPermanentIds by clubId with altersklasse + geschlecht', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'Bonn 1', teamnameSmall: 'Bonn', clubId: 10 } },
      { rang: 2, team: { seasonTeamId: 2, teamPermanentId: 200, teamname: 'Berlin 1', teamnameSmall: 'Berlin', clubId: 20 } },
      { rang: 3, team: { seasonTeamId: 3, teamPermanentId: 101, teamname: 'Bonn 2', teamnameSmall: 'Bonn', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.get(10)).toEqual([
      { teamPermanentId: 100, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
      { teamPermanentId: 101, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
    ]);
    expect(result.get(20)).toEqual([
      { teamPermanentId: 200, altersklasse: 'Senioren', geschlecht: 'männlich', training: [] },
    ]);
  });

  it('stores liga and rang when liga is given', () => {
    const entries: BbbTableEntry[] = [
      { rang: 3, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'Bonn 1', teamnameSmall: 'Bonn', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich', { ligaId: 55, liganame: 'Regionalliga' });
    expect(result.get(10)).toEqual([
      { teamPermanentId: 100, altersklasse: 'Senioren', geschlecht: 'männlich', ligaId: 55, liganame: 'Regionalliga', rang: 3, training: [] },
    ]);
  });

  it('skips entries with null clubId', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 999, teamname: 'Sieger A/B', teamnameSmall: 'Sieger', clubId: null as any } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.size).toBe(0);
  });

  it('deduplicates teams with same teamPermanentId within a club', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'Bonn 1', teamnameSmall: 'Bonn', clubId: 10 } },
      { rang: 2, team: { seasonTeamId: 2, teamPermanentId: 100, teamname: 'Bonn 1 (duplicate)', teamnameSmall: 'Bonn', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'Senioren', 'männlich');
    expect(result.get(10)).toHaveLength(1);
    expect(result.get(10)![0].teamPermanentId).toBe(100);
  });
});

describe('regionFields / extractTeams mit ligaData', () => {
  it('übernimmt Ebene, Bezirk und Kreis', () => {
    expect(regionFields({ skEbeneName: 'Bezirk', bezirkName: 'Oberpfalz', kreisname: 'Regensburg' }))
      .toEqual({ ebene: 'Bezirk', bezirk: 'Oberpfalz', kreis: 'Regensburg' });
  });

  it('lässt leere und fehlende Angaben weg', () => {
    expect(regionFields({ skEbeneName: 'Verband', bezirkName: ' ', kreisname: null })).toEqual({ ebene: 'Verband' });
    expect(regionFields(null)).toEqual({});
    expect(regionFields(undefined)).toEqual({});
  });

  it('schreibt die Gebietsangaben in die Teams der Liga', () => {
    const entries: BbbTableEntry[] = [
      { rang: 1, team: { seasonTeamId: 1, teamPermanentId: 100, teamname: 'FC Tegernheim', teamnameSmall: 'TEG', clubId: 10 } },
    ];
    const result = extractTeams(entries, 'U14', 'weiblich', {
      ligaId: 51961, liganame: 'U14 weiblich Bezirksoberliga',
      ligaData: { skEbeneName: 'Bezirk', bezirkName: 'Oberpfalz' }
    });
    expect(result.get(10)![0]).toMatchObject({ ligaId: 51961, ebene: 'Bezirk', bezirk: 'Oberpfalz' });
    expect(result.get(10)![0]).not.toHaveProperty('kreis');
  });
});

describe('teamsFromMatches (Ligen ohne Tabelle)', () => {
  const t = (id: number, club: number | null, name = `T${id}`) =>
    ({ teamPermanentId: id, teamname: name, clubId: club, seasonTeamId: id, teamnameSmall: null });

  it('nimmt Heim- und Gastteams, jedes Team einmal', () => {
    const matches = [
      { homeTeam: t(1, 10), guestTeam: t(2, 20) },
      { homeTeam: t(2, 20), guestTeam: t(3, 30) },
    ];
    expect(teamsFromMatches(matches).map(e => e.team.teamPermanentId)).toEqual([1, 2, 3]);
  });

  it('liefert Teams ohne Rang und ohne rang-Feld im TeamEntry (K.-o.-Runde)', () => {
    const matches = [{ homeTeam: t(1, 10), guestTeam: t(2, null, 'Sieger A/B') }];
    const result = extractTeams(teamsFromMatches(matches), 'U14', 'männlich', { ligaId: 7, liganame: 'Pokal' });
    expect(result.get(10)).toEqual([
      { teamPermanentId: 1, altersklasse: 'U14', geschlecht: 'männlich', ligaId: 7, liganame: 'Pokal', training: [] },
    ]);
    expect(result.has(null as any)).toBe(false);
  });

  it('verträgt fehlende Spiele und Teams', () => {
    expect(teamsFromMatches([])).toEqual([]);
    expect(teamsFromMatches([{ homeTeam: null, guestTeam: undefined }])).toEqual([]);
  });
});

describe('Hauptwettbewerb bei mehreren Ligen', () => {
  const team = (ligaId: number, liganame: string) => ({ teamPermanentId: 1, ligaId, liganame, training: [] });
  const run = (comps: Array<[Competition]>) => {
    const teams: any[] = [];
    const known = new Map<number, Competition>();
    for (const [c] of comps) addCompetition(teams, team(c.ligaId, c.liganame), c, known);
    return teams[0];
  };
  const regionalliga: Competition = { ligaId: 10, liganame: '1. Regionalliga Südwest', ebeneId: 0, verbandOrder: 5 };
  const landespokal: Competition = { ligaId: 20, liganame: 'BVRP POKAL Herren', ligatypId: 2, ebeneId: 0, verbandOrder: 9 };

  it('Regionalliga bleibt Hauptwettbewerb, der Landespokal wird weiterer Wettbewerb', () => {
    const t = run([[regionalliga], [landespokal]]);
    expect(t.ligaId).toBe(10);
    expect(t.weitereWettbewerbe).toEqual([{ ligaId: 20, liganame: 'BVRP POKAL Herren' }]);
  });

  it('ist unabhängig von der Crawl-Reihenfolge', () => {
    const t = run([[landespokal], [regionalliga]]);
    expect(t.ligaId).toBe(10);
    expect(t.weitereWettbewerbe).toEqual([{ ligaId: 20, liganame: 'BVRP POKAL Herren' }]);
  });

  it('Pokal im Namen ist auch bei Ligatyp 1 ein Nebenwettbewerb (NRW-Jugendpokal)', () => {
    const jugendpokal: Competition = { ligaId: 5, liganame: 'Jugendpokal U16 männlich (JPU16M)', ebeneId: 1, verbandOrder: 1 };
    const oberliga: Competition = { ligaId: 6, liganame: 'Jugendoberliga 2 U16 männlich (JOL2U16M)', ebeneId: 1, verbandOrder: 1 };
    expect(isSideCompetition(jugendpokal)).toBe(true);
    expect(run([[jugendpokal], [oberliga]]).ligaId).toBe(6);
  });

  it('Auf-/Abstieg und Finals ohne Pokal im Namen zählen über den Ligatyp', () => {
    expect(isSideCompetition({ ligaId: 1, liganame: 'Aufstiegsspiele zur 2. DBBL', ligatypId: 3 })).toBe(true);
    expect(isSideCompetition({ ligaId: 2, liganame: 'Bezirksliga Herren', ligatypId: undefined })).toBe(false);
  });

  it('bei gleicher Klasse gewinnt die höhere Ebene, dann der frühere Verband', () => {
    const bezirk: Competition = { ligaId: 1, liganame: 'Bezirksliga', ebeneId: 1, verbandOrder: 1 };
    const verband: Competition = { ligaId: 2, liganame: 'Landesliga', ebeneId: 0, verbandOrder: 8 };
    expect(run([[bezirk], [verband]]).ligaId).toBe(2);
  });

  it('nur Pokal: der Pokal bleibt Hauptwettbewerb', () => {
    const t = run([[landespokal]]);
    expect(t.ligaId).toBe(20);
    expect(t.weitereWettbewerbe).toBeUndefined();
  });

  it('dieselbe Liga zweimal ergibt keinen doppelten Eintrag', () => {
    const t = run([[regionalliga], [landespokal], [landespokal]]);
    expect(t.weitereWettbewerbe).toHaveLength(1);
  });

  it('jede Pokalrunde bleibt ein eigener weiterer Wettbewerb (BBL-Pokal: Runde, Achtelfinale, Viertelfinale)', () => {
    const bundesliga: Competition = { ligaId: 1, liganame: '1. Bundesliga', ebeneId: 0, verbandOrder: 0 };
    const runde1: Competition = { ligaId: 55809, liganame: 'BBL-Pokal 1. Runde', ligatypId: 2, ebeneId: 0, verbandOrder: 0 };
    const achtel: Competition = { ligaId: 55807, liganame: 'BBL-Pokal 1/8-Finale', ligatypId: 2, ebeneId: 0, verbandOrder: 0 };
    const viertel: Competition = { ligaId: 55758, liganame: 'DBBL-Pokal 1/4-Finale', ligatypId: 4, ebeneId: 0, verbandOrder: 0 };
    const t = run([[runde1], [bundesliga], [viertel], [achtel]]);
    expect(t.ligaId).toBe(1);
    expect(t.weitereWettbewerbe.map((w: any) => w.ligaId)).toEqual([55758, 55807, 55809]);
  });

  it('Liga ohne Namen erzeugt trotzdem einen schemagültigen Eintrag', () => {
    const t = run([[regionalliga], [{ ligaId: 56601, liganame: undefined as any, ligatypId: 2 }]]);
    expect(t.weitereWettbewerbe).toEqual([{ ligaId: 56601, liganame: 'Liga 56601' }]);
  });
});
