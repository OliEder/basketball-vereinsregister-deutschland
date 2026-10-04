import { LAENDER, top3Entries, ligaCard, ebeneKey, EBENEN, collectHalls, hallState, hallWishes, renderHallPage, teamWishes, teamLigen, primaryLiga, renderTeamPage, teamSlug, localDerbies, ligaLevel, renderDerbies, assignKeyed, ligaWishes, top3, top3Text, renderLigaPage, buildLigaPages, LigaDoc, slugify, clubSlug, mainPlace, letterOf, knownOrte, renderListPage, ALPHABET_MIN, placeOf, assignPaths, buildSite, renderClubPage, renderRedirect, regionCards, renderRegionHub, scheduleRows, kickoffText, injectRegionLinks, depthPrefix, UrlMap } from '../crawler/seo';
import { ClubEntry } from '../crawler/types';

const BASE = 'https://example.org/reg';
const hall = (ort: string) => ({ id: 1, dbbSpielfeldId: 1, bezeichnung: 'Sporthalle', strasse: 'Weg 1', plz: '93047', ort });
const club = (id: number, name: string, ort: string | null, nr = '0200001', extra: Partial<ClubEntry> = {}): ClubEntry => ({
  clubId: id, name, vereinsnummer: nr, verbandId: 2, verbandName: 'Bayern', lat: 49, lng: 12, geocodedFrom: ort ?? '',
  logoUrl: null, lastCrawled: '', halls: ort ? [hall(ort)] : [],
  teams: [{ teamPermanentId: id, altersklasse: 'Senioren', geschlecht: 'männlich', liganame: 'Kreisliga <A>', training: [] }],
  ...extra
} as ClubEntry);

describe('slugify', () => {
  it('wandelt Umlaute und Sonderzeichen um', () => {
    expect(slugify('TSV Eintracht München-Ost e.V.')).toBe('tsv-eintracht-muenchen-ost-e-v');
    expect(slugify('Ü-Straße & Söhne')).toBe('ue-strasse-und-soehne');
    expect(slugify('  ??? ')).toBe('');
    expect(clubSlug('Steller Sportverein von 1932 e.V.')).toBe('steller-sportverein-von-1932');
    expect(clubSlug('Baskets e. V. Nord')).toBe('baskets-nord');
    expect(clubSlug('Eve Vereinigung')).toBe('eve-vereinigung');
  });
});

describe('placeOf', () => {
  it('nimmt das Land aus der Vereinsnummer, den Ort aus der Heimhalle', () => {
    expect(placeOf(club(1, 'A', 'Regensburg'))).toMatchObject({ state: { slug: 'bayern' }, place: { slug: 'regensburg', name: 'Regensburg' } });
  });
  it('Bundesligen und Rollstuhl landen unter bundesweit, fehlender Ort unter weitere', () => {
    expect(placeOf(club(2, 'B', 'Berlin', '2203001')).state.slug).toBe('bundesweit');
    expect(placeOf(club(3, 'C', null, '4012029'))).toMatchObject({ state: { slug: 'bundesweit' }, place: { slug: 'weitere' } });
  });
});

describe('assignPaths', () => {
  it('vergibt Pfade Land/Ort/Verein', () => {
    const m = assignPaths([club(1, 'TV Regensburg', 'Regensburg')]);
    expect(m['1']).toEqual({ path: 'bayern/regensburg/tv-regensburg/', history: [] });
  });

  it('unterscheidet gleiche Namen im selben Ort durch die ID', () => {
    const m = assignPaths([club(1, 'SV Eintracht', 'Ulm'), club(2, 'SV Eintracht', 'Ulm')]);
    expect(m['1'].path).toBe('bayern/ulm/sv-eintracht/');
    expect(m['2'].path).toBe('bayern/ulm/sv-eintracht-2/');
  });

  it('ein Verein mit bestehendem Pfad verliert ihn nicht an einen neuen Verein mit kleinerer ID', () => {
    const prev: UrlMap = { '5': { path: 'bayern/ulm/sv-eintracht/', history: [] } };
    const m = assignPaths([club(2, 'SV Eintracht', 'Ulm'), club(5, 'SV Eintracht', 'Ulm')], prev);
    expect(m['5'].path).toBe('bayern/ulm/sv-eintracht/');
    expect(m['2'].path).toBe('bayern/ulm/sv-eintracht-2/');
  });

  it('lässt einen Verein wandern und merkt sich den alten Pfad', () => {
    const prev = assignPaths([club(1, 'TV Test', 'Passau')]);
    const moved = assignPaths([club(1, 'TV Test', 'Regensburg')], prev);
    expect(moved['1']).toEqual({ path: 'bayern/regensburg/tv-test/', history: ['bayern/passau/tv-test/'] });
    // zweiter Umzug: alle alten Pfade bleiben, nichts zeigt auf einen Zwischenschritt
    const again = assignPaths([club(1, 'TV Test', 'Hof')], moved);
    expect(again['1'].history).toEqual(['bayern/passau/tv-test/', 'bayern/regensburg/tv-test/']);
    // Rückkehr: der Pfad ist wieder aktuell und keine Weiterleitung mehr
    const back = assignPaths([club(1, 'TV Test', 'Passau')], again);
    expect(back['1'].path).toBe('bayern/passau/tv-test/');
    expect(back['1'].history).not.toContain('bayern/passau/tv-test/');
  });

  it('gibt einen verlassenen Pfad nicht als Weiterleitung aus, wenn ihn ein anderer Verein bekommt', () => {
    const prev = assignPaths([club(1, 'TV Test', 'Passau')]);
    const m = assignPaths([club(1, 'TV Test', 'Hof'), club(2, 'TV Test', 'Passau')], prev);
    expect(m['2'].path).toBe('bayern/passau/tv-test/');
    expect(m['1'].history).not.toContain('bayern/passau/tv-test/');
  });

  it('behält Zuordnungen von Vereinen, die nicht mehr in clubs.json stehen', () => {
    const prev: UrlMap = { '9': { path: 'bayern/ulm/weg/', history: [] } };
    expect(assignPaths([club(1, 'A', 'Ulm')], prev)['9'].path).toBe('bayern/ulm/weg/');
  });
});

describe('Seiten', () => {
  const c = club(7, 'TV Regensburg', 'Regensburg');
  const path = 'bayern/regensburg/tv-regensburg/';
  const html = renderClubPage({ base: BASE, club: c, urlPath: path, cp: placeOf(c) });

  it('Vereinsseite: Head, Basis-URL und Inhalt für Crawler', () => {
    expect(html).toContain('<base href="../../../">');
    expect(html).toContain(`<link rel="canonical" href="${BASE}/${path}">`);
    expect(html).toContain('<meta name="club-id" content="7">');
    expect(html).toContain('<h1>TV Regensburg</h1>');
    expect(html).toContain('Kreisliga &lt;A&gt;');             // maskiert
    expect(html).toContain('"@type":"SportsOrganization"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it('JSON-LD lässt sich nicht aus dem Script-Block ausbrechen', () => {
    const evil = club(8, 'X</script><b>', 'Ulm');
    const out = renderClubPage({ base: BASE, club: evil, urlPath: 'bayern/ulm/x/', cp: placeOf(evil) });
    expect(out).not.toContain('</script><b>');
  });

  it('Weiterleitung: meta refresh, canonical und Link', () => {
    const r = renderRedirect(BASE, 'a/b/c/', 'x/y/z/');
    expect(r).toContain(`content="0; url=${BASE}/x/y/z/"`);
    expect(r).toContain(`rel="canonical" href="${BASE}/x/y/z/"`);
  });

  it('depthPrefix', () => {
    expect(depthPrefix('bayern/')).toBe('../');
    expect(depthPrefix('a/b/c/')).toBe('../../../');
  });
});

describe('buildSite', () => {
  const clubs = [club(1, 'TV Regensburg', 'Regensburg'), club(2, 'SV Passau', 'Passau'), club(3, 'ALBA Berlin', 'Berlin', '2203001')];
  const prev = assignPaths([club(1, 'TV Regensburg', 'Passau')]);
  const b = buildSite(clubs, prev, BASE, '2026-10-03');
  const keys = [...b.files.keys()];

  it('erzeugt Vereins-, Orts- und Landesseiten, Sitemap und robots.txt', () => {
    expect(keys).toEqual(expect.arrayContaining([
      'bayern/regensburg/tv-regensburg/index.html', 'bayern/regensburg/index.html', 'bayern/index.html',
      'bundesweit/berlin/alba-berlin/index.html', 'sitemap.xml', 'robots.txt'
    ]));
    expect(b.files.get('robots.txt')).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });

  it('legt die Weiterleitung am alten Pfad an und nimmt sie nicht in die Sitemap auf', () => {
    expect(b.files.get('bayern/passau/tv-regensburg/index.html')).toContain('http-equiv="refresh"');
    const sitemap = b.files.get('sitemap.xml')!;
    expect(sitemap).not.toContain('passau/tv-regensburg');
    expect(sitemap).toContain(`<loc>${BASE}/bayern/regensburg/tv-regensburg/</loc>`);
    expect(sitemap).toContain(`<loc>${BASE}/</loc>`);
  });

  it('Dubletten (gleicher Name und Ort) zeigen per canonical auf die Hauptseite und fehlen in der Sitemap', () => {
    const d = buildSite([club(1, 'ALBA Berlin', 'Berlin'), club(2, 'ALBA Berlin', 'Berlin')], {}, BASE, '2026-10-03');
    const dup = d.files.get('bayern/berlin/alba-berlin-2/index.html')!;
    expect(dup).toContain(`rel="canonical" href="${BASE}/bayern/berlin/alba-berlin/"`);
    expect(d.files.get('sitemap.xml')).not.toContain('alba-berlin-2');
    expect(d.files.get('sitemap.xml')).toContain('/alba-berlin/<');
  });

  it('Hubseite /vereine/ mit den Länderkarten, Startseite verweist darauf', () => {
    expect(b.regions.map(r => r.slug)).toEqual(['bayern', 'bundesweit']);
    const hub = b.files.get('vereine/index.html')!;
    expect(hub).toContain('<h1>Basketballvereine in Deutschland</h1>');
    expect(hub).toContain('<ul class="region-cards">');
    expect(hub).toContain('<a class="region-link" href="bayern/">Bayern</a>');
    expect(hub).toContain('<a class="region-link" href="bundesweit/">Bundesweit (Bundesligen, Rollstuhl, Kooperationen)</a>');
    expect(hub).toContain('<li><a href="index.html">Vereinsregister</a></li>');
    expect(b.files.get('sitemap.xml')).toContain('/vereine/<');
    const out = injectRegionLinks('<nav><!--REGION-LINKS--></nav>', b.regions);
    expect(out).toContain('<a class="dss-link" href="vereine/">Vereine nach Bundesland</a>');
    expect(out).not.toContain('region-card');                                              // die Karten stehen nur auf der Hubseite
  });

  it('Bundesweit und andere Nicht-Länder: breite Karte über beide Spalten, nach den Ländern', () => {
    expect(LAENDER.size).toBe(16);
    const regions = [
      { state: 'Bundesweit (Bundesligen)', slug: 'bundesweit', clubs: 5, teams: 0, orte: 1, ligen: 2, hallen: 0 },
      { state: 'Bayern', slug: 'bayern', clubs: 9, teams: 0, orte: 1, ligen: 3, hallen: 0 },
      { state: 'Hessen', slug: 'hessen', clubs: 7, teams: 0, orte: 1, ligen: 1, hallen: 0 }
    ];
    const html = regionCards(regions);
    expect(html.indexOf('href="bundesweit/"')).toBeGreaterThan(html.indexOf('href="hessen/"'));   // am Ende, sonst stünde sie mitten in den Paaren
    expect(html).toMatch(/region-card dss-card dss-card--hoverable region-card--wide"><a class="region-link" href="bundesweit\/">/);
    expect(html).not.toMatch(/region-card--wide"><a class="region-link" href="(bayern|hessen)\//);
  });

  it('Regionskarte: Vereine und Ligen immer, Teams und Hallen nur auf dem Desktop', () => {
    const r = b.regions.find(x => x.slug === 'bayern')!;
    expect(r).toMatchObject({ state: 'Bayern', clubs: 2 });
    expect(r.teams).toBe(0);                    // die Fixture-Teams haben keine Liga
    expect(r.orte).toBeGreaterThan(0);
    expect(r.hallen).toBeGreaterThan(0);
    const html = regionCards([{ state: 'Hessen', slug: 'hessen', clubs: 1234, teams: 5678, orte: 9, ligen: 1, hallen: 3 }]);
    expect(html).toContain('<div class="dss-stat-value">1.234</div><div class="dss-stat-label">Vereine</div>');   // deutsche Tausenderpunkte
    expect(html).toContain('<div class="dss-stat dss-stat--compact region-extra"><div class="dss-stat-value">5.678</div><div class="dss-stat-label">Teams</div></div>');   // nur ab Desktopbreite sichtbar
    expect(html).toContain('<div class="dss-stat dss-stat--compact region-extra"><div class="dss-stat-value">3</div><div class="dss-stat-label">Hallen</div></div>');
    expect(html).toContain('<div class="dss-stat dss-stat--compact"><div class="dss-stat-value">1</div><div class="dss-stat-label">Liga</div></div>');          // Vereine und Ligen immer
    expect(regionCards([{ state: 'X', slug: 'x', clubs: 2, teams: 0, orte: 1, ligen: 0, hallen: 0 }])).not.toContain('Liga');   // keine Kachel ohne Wert
  });

  it('Umriss: Überschrift, Umriss, Kennzahlen; ohne Umriss (Bundesweit) kein SVG; Quellenvermerk auf der Hubseite', () => {
    const regions = [{ state: 'Bayern', slug: 'bayern', clubs: 9, teams: 5, orte: 1, ligen: 3, hallen: 2 }, { state: 'Bundesweit', slug: 'bundesweit', clubs: 2, teams: 0, orte: 1, ligen: 1, hallen: 0 }];
    const geo = { outlines: { bayern: { path: 'M0,0L10,0L10,10Z', w: 10, h: 10 } }, attribution: '© BKG (2026) dl-de/by-2-0 (Daten verändert)' };
    const html = renderRegionHub(BASE, regions, true, true, geo);
    const cards = html.split('<li class="region-card').slice(1);
    const bayern = cards[0];
    expect(bayern.indexOf('region-link')).toBeLessThan(bayern.indexOf('<svg class="region-shape"'));       // Überschrift, Umriss, Kennzahlen
    expect(bayern.indexOf('<svg class="region-shape"')).toBeLessThan(bayern.indexOf('dss-stats'));
    expect(bayern).toContain('aria-hidden="true" focusable="false"><path d="M0,0L10,0L10,10Z"/>');
    expect(cards[1]).not.toContain('<svg');
    expect(html).toContain('© BKG (2026)</a>');
    expect(html).toContain('dl-de/by-2-0</a> (vereinfacht)');
    expect(html).toContain('href="liga/"');
    expect(html).toContain('href="halle/"');
    expect(renderRegionHub(BASE, regions, false, false)).not.toContain('Umrisse:');            // ohne Umrisse kein Quellenvermerk
  });

  it('Startseite: data-hubs nennt die vorhandenen Übersichten', () => {
    const html = '<div id="stats-bar"></div><!--REGION-LINKS-->';
    expect(injectRegionLinks(html, b.regions, true, true)).toContain('<div id="stats-bar" data-hubs="vereine liga halle"></div>');
    expect(injectRegionLinks(html, b.regions, false, false)).toContain('data-hubs="vereine"');
    expect(injectRegionLinks(html, [], false, false)).toContain('data-hubs=""');
    expect(injectRegionLinks(html, b.regions, true, true)).toContain('href="halle/"');
  });
});

describe('Stadtteile und Alphabet', () => {
  it('mainPlace fasst Stadtteile mit Leerzeichen-Bindestrich zur Stadt zusammen', () => {
    expect(mainPlace('Köln - Porz')).toBe('Köln');
    expect(mainPlace('Pulheim ¿ Stommeln')).toBe('Pulheim');
    expect(mainPlace('Neustadt / Wied')).toBe('Neustadt / Wied');   // kein Stadtteil-Muster
    expect(mainPlace('Halle (Saale)')).toBe('Halle (Saale)');
  });

  it('Stadtteile ohne Leerzeichen nur, wenn die Stadt selbst als Ort vorkommt', () => {
    const known = knownOrte([club(1, 'A', 'Stuttgart'), club(2, 'B', 'Stuttgart-Degerloch'), club(3, 'C', 'Garmisch-Partenkirchen')]);
    expect(mainPlace('Stuttgart-Degerloch', known)).toBe('Stuttgart');
    expect(mainPlace('Garmisch-Partenkirchen', known)).toBe('Garmisch-Partenkirchen');
    expect(mainPlace('Castrop-Rauxel')).toBe('Castrop-Rauxel');
  });

  it('Vereine in Stadtteilen landen unter der Stadt, der alte Stadtteil-Pfad wird zur Weiterleitung', () => {
    const before = assignPaths([club(1, 'TV Porz', 'Köln - Porz'), club(2, 'SV Köln', 'Köln')]);
    expect(before['1'].path).toBe('bayern/koeln/tv-porz/');
    const prev: UrlMap = { '1': { path: 'bayern/koeln-porz/tv-porz/', history: [] } };
    const after = assignPaths([club(1, 'TV Porz', 'Köln - Porz')], prev);
    expect(after['1']).toEqual({ path: 'bayern/koeln/tv-porz/', history: ['bayern/koeln-porz/tv-porz/'] });
  });

  it('letterOf ordnet Umlaute ihrem Grundbuchstaben zu', () => {
    expect(letterOf('Ärzte')).toBe('A');
    expect(letterOf('über')).toBe('U');
    expect(letterOf('1. FC')).toBe('#');
  });

  it('lange Listen bekommen Buchstabengruppen und eine Sprungleiste, kurze nicht', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `${String.fromCharCode(65 + (i % 5))}-Ort ${i}`, href: `x/${i}/` }));
    const long = renderListPage({ base: BASE, pagePath: 'bayern/', title: 't', heading: 'h', intro: 'i', crumbs: [{ name: 'a', path: '' }], groups: [{ items: mk(ALPHABET_MIN), alphabetic: true }] });
    expect(long).toContain('aria-label="Alphabet"');
    expect(long).toContain('href="bayern/#buchstabe-a"');
    expect(long).toContain('<h2 id="buchstabe-a" data-pagenav-skip>A</h2>');      // Buchstaben nicht noch einmal in der Seitennavigation
    const short = renderListPage({ base: BASE, pagePath: 'bayern/', title: 't', heading: 'h', intro: 'i', crumbs: [{ name: 'a', path: '' }], groups: [{ items: mk(ALPHABET_MIN - 1), alphabetic: true }] });
    expect(short).not.toContain('Alphabet');
  });
});

describe('Ligaseiten', () => {
  const team = (id: number, clubId: number, name: string) => ({ teamPermanentId: id, clubId, teamname: name });
  const row = (rang: number, t: any, sp: number, s: number, n: number) => ({ rang, team: t, anzspiele: sp, anzGewinnpunkte: s * 2, anzVerlustpunkte: n * 2, s, n, koerbe: 80 * sp, gegenKoerbe: 70 * sp, korbdiff: 10 * sp });
  const liga = (id: number, name: string, over: Partial<LigaDoc> = {}): LigaDoc => ({
    ligaId: id, liganame: name, verbandName: 'Bayern', akName: 'Senioren', geschlecht: 'männlich', fetchedAt: '2026-10-03T09:00:00Z',
    tabelle: [row(1, team(1, 7, 'TV Regensburg'), 2, 2, 0), row(2, team(2, 99, 'SV Fremd'), 2, 1, 1), row(3, team(3, 8, 'DJK <b>'), 2, 0, 2), row(4, team(4, 9, 'Vierter'), 1, 0, 1)],
    matches: [
      { matchId: 1, kickoffDate: '2026-09-26', kickoffTime: '18:30', homeTeam: team(1, 7, 'TV Regensburg'), guestTeam: team(2, 99, 'SV Fremd'), result: '74:89' },
      { matchId: 2, kickoffDate: '2026-10-10', kickoffTime: '17:00', homeTeam: team(2, 99, 'SV Fremd'), guestTeam: team(3, 8, 'DJK <b>'), result: null },
      { matchId: 3, kickoffDate: '2026-10-11', homeTeam: team(1, 7, 'TV Regensburg'), guestTeam: team(3, 8, 'DJK <b>'), result: null, abgesagt: true }
    ],
    ...over
  });

  it('Pfad: liga/<verband>/<liga ohne Kürzel in Klammern>/, gleiche Namen mit ID', () => {
    const w = ligaWishes([liga(2, 'Kreisliga A (KLA)'), liga(1, 'Kreisliga A (KLA)'), liga(3, 'Leer', { tabelle: [], matches: [] })]);
    expect(w).toEqual([
      { key: '1', desired: 'liga/bayern/kreisliga-a/' },
      { key: '2', desired: 'liga/bayern/kreisliga-a/' }
    ]);
    const m = assignKeyed(w);
    expect(m['1'].path).toBe('liga/bayern/kreisliga-a/');
    expect(m['2'].path).toBe('liga/bayern/kreisliga-a-2/');
  });

  it('Saisonwechsel: neue Liga-ID übernimmt den Pfad der verschwundenen', () => {
    const prev = assignKeyed(ligaWishes([liga(1, 'Kreisliga A')]));
    const next = assignKeyed(ligaWishes([liga(500, 'Kreisliga A')]), prev);
    expect(next['500'].path).toBe('liga/bayern/kreisliga-a/');
    expect(next['1']).toBeUndefined();
  });

  it('Top 3 erst, wenn gespielt wurde', () => {
    expect(top3Text(liga(1, 'X'))).toBe('1. TV Regensburg · 2. SV Fremd · 3. DJK <b>');
    expect(top3(liga(1, 'X', { tabelle: liga(1, 'X').tabelle.map(e => ({ ...e, anzspiele: 0 })) }))).toEqual([]);
  });

  it('Seite: Tabelle, Spiele, Vereinslinks und Maskierung', () => {
    const html = renderLigaPage({ base: BASE, doc: liga(1, 'Kreisliga A'), path: 'liga/bayern/kreisliga-a/', clubPaths: { '7': 'bayern/regensburg/tv-regensburg/' } });
    expect(html).toContain('<base href="../../../">');
    expect(html).toContain('<a href="bayern/regensburg/tv-regensburg/">TV Regensburg</a>');
    expect(html).toContain('DJK &lt;b&gt;');
    expect(html).not.toContain('DJK <b>');
    expect(html).toContain('Sa, 26.09.2026 · 18:30');
    expect(html).toContain('<div class="dss-row-score">74:89</div>');
    expect(html).toContain('Nächste Spiele');
    expect(html).not.toContain('11.10.2026');     // abgesagt
    expect(html).toContain('<th scope="col" class="center">Platz</th>');
    expect(html).toContain('Aktuell: 1. TV Regensburg');
  });

  it('Ligakarte: Name, Bezirk und Teams, Mini-Tabelle der Spitze mit verlinkten Teams', () => {
    const d = liga(1, 'Kreisliga A', { bezirkName: 'Oberpfalz' });
    expect(top3Entries(d).map(e => e.rang)).toEqual([1, 2, 3]);
    expect(top3Entries(liga(1, 'X', { tabelle: d.tabelle.map(e => ({ ...e, anzspiele: 0 })) }))).toEqual([]);
    const html = ligaCard(d, 'liga/bayern/kreisliga-a/', { '7': 'bayern/regensburg/tv-regensburg/' }, { '1': 'bayern/regensburg/tv-regensburg/herren/' });
    expect(html).toContain('<h4 class="liga-card-title"><a href="liga/bayern/kreisliga-a/">Kreisliga A</a></h4>');
    expect(html).toContain('Oberpfalz · 4 Teams');
    expect(html).toContain('<caption class="dss-sr-only">Tabellenspitze Kreisliga A</caption>');
    expect(html).toContain('<a href="bayern/regensburg/tv-regensburg/herren/">TV Regensburg</a>');       // Team direkt verlinkt
    expect(html.match(/<tr><td/g)).toHaveLength(3);                                                        // nur die ersten drei
    expect(html).not.toContain('Vierter');
    expect(html).toContain('DJK &lt;b&gt;');                                                               // maskiert
    const leer = ligaCard(liga(2, 'Neu', { tabelle: d.tabelle.map(e => ({ ...e, anzspiele: 0 })) }), 'liga/bayern/neu/', {}, {});
    expect(leer).toContain('Noch keine Spiele gespielt.');
    expect(leer).not.toContain('<table');
  });

  it('Ebene einer Liga: aus der Liga selbst, sonst aus den Vereinen, sonst Weitere', () => {
    expect(ebeneKey(liga(1, 'A', { skEbeneName: 'Bezirk' }))).toBe('Bezirk');
    expect(ebeneKey(liga(1, 'A'), () => 'Kreis')).toBe('Kreis');
    expect(ebeneKey(liga(1, 'A', { skEbeneName: 'Bundesebene' }), () => 'Kreis')).toBe('Weitere');
    expect(ebeneKey(liga(1, 'A'))).toBe('Weitere');
    expect(EBENEN.map(e => e.key)).toEqual(['Verband', 'Bezirk', 'Kreis', 'Weitere']);
  });

  it('Verbandsseite: Ebene, dann Altersklasse und Geschlecht, darin die Ligakarten', () => {
    const b = buildLigaPages([liga(1, 'Kreisliga A', { skEbeneName: 'Kreis' }), liga(2, 'Landesliga', { skEbeneName: 'Verband' }), liga(3, 'U14 Liga', { skEbeneName: 'Bezirk', akName: 'U14' })], {}, BASE, {});
    const html = b.files.get('liga/bayern/index.html')!;
    const at = (x: string): number => html.indexOf(x);
    expect(at('id="ebene-verband"')).toBeGreaterThan(-1);
    expect(at('id="ebene-verband"')).toBeLessThan(at('id="ebene-bezirk"'));
    expect(at('id="ebene-bezirk"')).toBeLessThan(at('id="ebene-kreis"'));
    expect(html).toContain('<h2 id="ebene-bezirk">Bezirksebene <span class="seo-note">1 Liga</span></h2>');
    expect(html).toContain('<h3>U14 · männlich</h3>');
    expect(html).toContain('<h3>Senioren · männlich</h3>');
    expect(html).toContain('<li class="liga-card dss-card dss-card--default">');
  });

  it('Verbandsseite und Übersicht, Weiterleitung bei geändertem Pfad', () => {
    const prev = { '1': { path: 'liga/bayern/alt/', history: [] } };
    const b = buildLigaPages([liga(1, 'Kreisliga A')], prev, BASE, {});
    expect(b.files.get('liga/bayern/alt/index.html')).toContain('http-equiv="refresh"');
    expect(b.files.get('liga/bayern/index.html')).toContain('Senioren · männlich');
    expect(b.files.get('liga/index.html')).toContain('href="liga/bayern/"');
    expect(b.sitemap).toEqual(expect.arrayContaining(['liga/bayern/kreisliga-a/', 'liga/bayern/', 'liga/']));
    expect(b.sitemap).not.toContain('liga/bayern/alt/');
  });

  it('buildSite verlinkt Ligen auf Länder-, Orts- und Vereinsseiten', () => {
    const c = club(7, 'TV Regensburg', 'Regensburg', '0200007', { teams: [{ teamPermanentId: 1, altersklasse: 'Senioren', geschlecht: 'männlich', ligaId: 1, liganame: 'Kreisliga A', training: [] } as any] });
    const b = buildSite([c], {}, BASE, '2026-10-03', { docs: [liga(1, 'Kreisliga A')] });
    expect(b.files.get('bayern/index.html')).toContain('href="liga/bayern/kreisliga-a/"');
    const land = b.files.get('bayern/index.html')!;
    expect(land).toContain('Alle 1 Ligen in Bayern');
    expect(land).toContain('<h2 id="ligen">Ligen in Bayern</h2>');
    expect(land).toContain('<li class="liga-card dss-card dss-card--default">');                       // Ligakarte mit Mini-Tabelle
    expect(land).toContain('Weitere Ligen');                                                           // Ebene unbekannt
    const ort = b.files.get('bayern/regensburg/index.html')!;
    expect(ort).toContain('Ligen in Regensburg');
    expect(ort).toContain('TV Regensburg: Platz 1');
    expect(b.files.get('bayern/regensburg/tv-regensburg/index.html')).toContain('<a href="liga/bayern/kreisliga-a/">Kreisliga A</a>');
    expect(b.files.get('sitemap.xml')).toContain('/liga/bayern/kreisliga-a/<');
    expect(b.hasLiga).toBe(true);
    expect(injectRegionLinks('<!--REGION-LINKS-->', b.regions, true)).toContain('href="liga/"');
  });
});

describe('Lokalderbys', () => {
  const tm = (clubId: number, name: string) => ({ clubId, teamname: name, teamPermanentId: clubId });
  const mk = (id: number, home: any, guest: any, date: string, result: string | null = null, extra: any = {}) =>
    ({ matchId: id, kickoffDate: date, kickoffTime: '18:00', homeTeam: home, guestTeam: guest, result, ...extra });
  const L = (id: number, verband: string, matches: any[]): LigaDoc => ({ ligaId: id, liganame: `Liga ${id}`, verbandName: verband, tabelle: [], matches });
  const place: Record<string, string> = { '1': 'bayern/ulm/', '2': 'bayern/ulm/', '3': 'bayern/ulm/', '4': 'bayern/neu-ulm/', '5': 'bayern/ulm/' };
  const slug: Record<string, string> = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'a' };
  const run = (docs: LigaDoc[], level = (d: LigaDoc) => ligaLevel(d, d.ligaId === 3 ? 'Kreis' : 'Verband')) =>
    localDerbies(docs, id => place[String(id)] ?? null, id => slug[String(id)] ?? null, level);

  it('Ebenen', () => {
    expect(ligaLevel(L(1, 'Bundesligen', []))).toBe(0);
    expect(ligaLevel(L(1, 'Regionalliga Nord', []))).toBe(1);
    expect(ligaLevel(L(1, 'Bayern', []), 'Bezirk')).toBe(3);
    expect(ligaLevel(L(1, 'Bayern', []))).toBe(3);
  });

  it('nur Spiele zweier Vereine desselben Ortes, nicht derselbe Verein unter zwei IDs', () => {
    const d = run([L(1, 'Bayern', [
      mk(1, tm(1, 'A'), tm(2, 'B'), '2026-10-10'),      // Derby
      mk(2, tm(1, 'A'), tm(4, 'D'), '2026-10-11'),      // anderer Ort
      mk(3, tm(1, 'A'), tm(5, 'A2'), '2026-10-12')      // gleicher Verein (Dublette)
    ])]);
    expect(d.get('bayern/ulm/')!.map(x => x.match.matchId)).toEqual([1]);
  });

  it('nur die zwei höchsten Ebenen, in denen der Ort Derbys hat', () => {
    const docs = [
      L(1, 'Regionalliga Süd', [mk(1, tm(1, 'A'), tm(2, 'B'), '2026-10-10')]),
      L(2, 'Bayern', [mk(2, tm(1, 'A'), tm(3, 'C'), '2026-10-11')]),
      L(3, 'Bayern', [mk(3, tm(2, 'B'), tm(3, 'C'), '2026-10-12')])   // Kreis (Ebene 4)
    ];
    const ids = run(docs).get('bayern/ulm/')!.map(x => x.match.matchId).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('Orte ohne bekannten Ort ("weitere") bilden keine Derbys', () => {
    const d = localDerbies([L(1, 'Bayern', [mk(1, tm(1, 'A'), tm(2, 'B'), '2026-10-10')])], () => 'bayern/weitere/', id => String(id), () => 3);
    expect(d.size).toBe(0);
  });

  it('Darstellung: kommende vor vergangenen, abgesagte fehlen, Vereine und Liga verlinkt', () => {
    const doc = L(1, 'Bayern', [
      mk(1, tm(1, 'TV <A>'), tm(2, 'B'), '2026-10-10'),
      mk(2, tm(2, 'B'), tm(1, 'TV <A>'), '2026-09-20', '80:70'),
      mk(3, tm(1, 'TV <A>'), tm(3, 'C'), '2026-10-17', null, { abgesagt: true })
    ]);
    const html = renderDerbies(run([doc]).get('bayern/ulm/')!, '2026-10-03', { '1': 'bayern/ulm/a/' }, { 1: 'liga/bayern/liga-1/' }, 'Ulm');
    expect(html).toContain('Lokalderbys in Ulm');
    expect(html).toContain('Nächste Derbys');
    expect(html).toContain('Letzte Derbys');
    expect(html).toContain('<a href="bayern/ulm/a/">TV &lt;A&gt;</a>');
    expect(html).toContain('<div class="dss-row-score">80:70</div>');
    expect(html).toContain('<a href="liga/bayern/liga-1/">Liga 1</a>');
    expect(html).not.toContain('17.10.2026');
    expect(renderDerbies([], '2026-10-03', {}, {}, 'Ulm')).toBe('');
  });

  it('buildSite zeigt Derbys auf der Ortsseite', () => {
    const a = club(1, 'TV Ulm', 'Ulm', '0200001'), b = club(2, 'SV Ulm', 'Ulm', '0200002');
    const doc = L(9, 'Bayern', [{ ...mk(1, tm(1, 'TV Ulm'), tm(2, 'SV Ulm'), '2026-12-01'), }]);
    doc.tabelle = [{ rang: 1, team: tm(1, 'TV Ulm'), anzspiele: 0 }];
    const out = buildSite([a, b], {}, BASE, '2026-10-03', { docs: [doc] });
    expect(out.files.get('bayern/ulm/index.html')).toContain('Lokalderbys in Ulm');
  });
});

describe('Teamseiten', () => {
  const tm = (id: number, clubId: number, name: string) => ({ teamPermanentId: id, clubId, teamname: name });
  const team = (id: number, ak: string, g: string, nr = 1) => ({ teamPermanentId: id, altersklasse: ak, geschlecht: g, teamNumber: nr, ligaId: 1, liganame: 'Kreisliga A', training: [] } as any);
  const c = club(7, 'TV Regensburg', 'Regensburg', '0200007', { teams: [team(70, 'Senioren', 'männlich'), team(71, 'U16', 'männlich'), team(72, 'Senioren', 'männlich', 2)] });
  const doc: LigaDoc = {
    ligaId: 1, liganame: 'Kreisliga A', verbandName: 'Bayern', fetchedAt: '2026-10-03T09:00:00Z',
    tabelle: [{ rang: 2, team: tm(70, 7, 'TV Regensburg'), anzspiele: 2, s: 1, n: 1 }],
    matches: [
      { matchId: 5, kickoffDate: '2026-10-10', kickoffTime: '18:00', homeTeam: tm(70, 7, 'TV Regensburg'), guestTeam: tm(99, 50, 'SV Fremd'), result: null },
      { matchId: 6, kickoffDate: '2026-09-20', kickoffTime: '18:00', homeTeam: tm(99, 50, 'SV Fremd'), guestTeam: tm(70, 7, 'TV Regensburg'), result: '60:70' },
      { matchId: 7, kickoffDate: '2026-10-17', homeTeam: tm(70, 7, 'TV Regensburg'), guestTeam: tm(99, 50, 'SV Fremd'), result: null }
    ],
    venues: { '5': 11 }, halls: { '11': { bezeichnung: 'Halle <1>', strasse: 'Weg 1', plz: '93047', ort: 'Regensburg' } }
  } as any;

  it('Slug aus dem Teamnamen, nummerierte Teams unterscheiden sich', () => {
    expect(teamSlug(team(1, 'Senioren', 'männlich'))).toBe('herren');
    expect(teamSlug(team(1, 'Senioren', 'weiblich'))).toBe('frauen');
    expect(teamSlug(team(1, 'U16', 'männlich'))).toBe('u16-maennlich');
    expect(teamSlug(team(1, 'Senioren', 'männlich', 2))).toBe('herren-2');
  });

  it('Pfadwünsche: unter dem Vereinspfad, ein Team nur einmal', () => {
    const w = teamWishes([
      { club: c, team: c.teams[0] as any, clubPath: 'bayern/regensburg/tv-regensburg/' },
      { club: club(8, 'TV Regensburg', 'Regensburg'), team: c.teams[0] as any, clubPath: 'bayern/regensburg/tv-regensburg-8/' }
    ]);
    expect(w).toEqual([{ key: '70', desired: 'bayern/regensburg/tv-regensburg/herren/' }]);
  });

  it('teamLigen und primaryLiga', () => {
    const m = teamLigen([doc]);
    expect([...m.keys()].sort()).toEqual([70, 99]);
    expect(primaryLiga(m.get(70)!, 70)).toBe(doc);
  });

  it('Seite: Platz, Spiele mit Halle, vs./@, Verlinkung und strukturierte Daten', () => {
    const html = renderTeamPage({
      base: BASE, ref: { club: c, team: c.teams[0] as any, clubPath: 'bayern/regensburg/tv-regensburg/' }, path: 'bayern/regensburg/tv-regensburg/herren/',
      docs: [doc], clubPaths: { '7': 'bayern/regensburg/tv-regensburg/' }, ligaPaths: { 1: 'liga/bayern/kreisliga-a/' },
      teamPaths: { '70': 'bayern/regensburg/tv-regensburg/herren/' }, today: '2026-10-03', cp: placeOf(c), clubUrl: 'bayern/regensburg/tv-regensburg/'
    });
    expect(html).toContain('<base href="../../../../">');
    expect(html).toContain('<meta name="team-id" content="70">');
    expect(html).toContain('id="team-content"');
    expect(html).toContain('Platz 2 (2 Spiele, 1 Siege, 1 Niederlagen)');
    expect(html).toContain('Halle &lt;1&gt;, Regensburg');
    expect(html).toContain('<span aria-hidden="true">vs.</span><span class="dss-sr-only">Heimspiel gegen</span>');
    expect(html).toContain('<span aria-hidden="true">@</span><span class="dss-sr-only">Auswärtsspiel bei</span>');
    expect(html).toContain('<div class="dss-rows">');
    expect(html).toContain('dss-row dss-row--match');
    expect(html).toContain('<a href="liga/bayern/kreisliga-a/">Kreisliga A</a>');
    expect(html).toContain('"@type":"SportsTeam"');
    expect((html.match(/"@type":"SportsEvent"/g) ?? []).length).toBe(1);       // nur das Spiel mit bestätigter Halle
    expect(html).toContain('60:70');
  });

  it('buildSite: Team-, Vereins- und Ligaseite verlinken sich, Umzug erzeugt Weiterleitung', () => {
    const before = buildSite([club(7, 'TV Regensburg', 'Passau', '0200007', { teams: c.teams })], {}, BASE, '2026-10-03', { docs: [doc] });
    const moved = buildSite([c], before.urlMap, BASE, '2026-10-03', { docs: [doc], previousTeams: before.teamMap });
    expect(moved.files.get('bayern/regensburg/tv-regensburg/herren/index.html')).toContain('SportsTeam');
    expect(moved.files.get('bayern/passau/tv-regensburg/herren/index.html')).toContain('http-equiv="refresh"');
    expect(moved.files.get('bayern/regensburg/tv-regensburg/index.html')).toContain('<a href="bayern/regensburg/tv-regensburg/herren/">Herren</a>');
    expect(moved.files.get('liga/bayern/kreisliga-a/index.html')).toContain('href="bayern/regensburg/tv-regensburg/herren/"');
    expect(moved.files.get('sitemap.xml')).toContain('/bayern/regensburg/tv-regensburg/herren/<');
    expect(moved.files.get('sitemap.xml')).not.toContain('passau/tv-regensburg/herren');
    expect(moved.teamMap['70'].history).toEqual(['bayern/passau/tv-regensburg/herren/']);
  });

  it('ohne Live-Daten entstehen keine Teamseiten', () => {
    const out = buildSite([c], {}, BASE, '2026-10-03');
    expect([...out.files.keys()].some(k => k.endsWith('/herren/index.html'))).toBe(false);
  });
});

describe('Hallenseiten', () => {
  const clubA = club(1, 'TV Ulm', 'Ulm', '0100001', { halls: [{ id: 1, dbbSpielfeldId: 500, bezeichnung: 'Sporthalle Ost', strasse: 'Weg 1', plz: '89073', ort: 'Ulm' } as any] });
  const clubB = club(2, 'SV Neu-Ulm', 'Neu-Ulm', '0200002', { halls: [{ id: 1, dbbSpielfeldId: 500, bezeichnung: 'Sporthalle Ost', strasse: 'Weg 1', plz: '89073', ort: 'Ulm' } as any, { id: 2, dbbSpielfeldId: 600, bezeichnung: 'Halle Leer', ort: null } as any] });
  const tm = (id: number, clubId: number, name: string) => ({ teamPermanentId: id, clubId, teamname: name });
  const mk = (id: number, home: any, guest: any, date: string, result: string | null = null, extra: any = {}) => ({ matchId: id, kickoffDate: date, kickoffTime: '18:00', homeTeam: home, guestTeam: guest, result, ...extra });
  const doc = (matches: any[], venues: Record<string, number>, halls: any = {}): LigaDoc => ({
    ligaId: 5, liganame: 'Liga <5>', verbandName: 'Bayern', tabelle: [], matches, venues, halls, fetchedAt: '2026-10-03T00:00:00Z'
  } as any);

  it('führt Hallen aus clubs.json und matchInfo über die Spielfeld-ID zusammen und lässt unvollständige weg', () => {
    const d = doc([mk(1, tm(1, 1, 'TV Ulm'), tm(9, 9, 'Gast'), '2026-10-10'), mk(2, tm(9, 9, 'Gast'), tm(1, 1, 'TV Ulm'), '2026-10-11')], { '1': 500, '2': 777 },
      { '777': { bezeichnung: 'Nur matchInfo', strasse: 'X 2', plz: '80331', ort: 'München' } });
    const h = collectHalls([clubA, clubB], [d]);
    expect([...h.keys()].sort()).toEqual(['500', '777']);              // 600 hat keinen Ort
    expect([...h.get('500')!.clubIds].sort()).toEqual([1, 2]);
    expect(h.get('500')!.games).toHaveLength(1);
    expect(h.get('777')!.games).toHaveLength(1);
    expect(h.get('777')!.clubIds.size).toBe(0);
  });

  it('Land nach den meldenden Vereinen, sonst nach den Gastgebern, sonst "weitere"', () => {
    const byId = new Map([[1, clubA], [2, clubB]]);
    const h = collectHalls([clubA, clubB], []);
    expect(hallState(h.get('500')!, byId).slug).toBe('baden-wuerttemberg');     // zwei Stimmen: BW (Ulm) und Bayern (Neu-Ulm) → alphabetisch BW
    const only = collectHalls([], [doc([mk(1, tm(1, 1, 'TV Ulm'), tm(9, 9, 'G'), '2026-10-10')], { '1': 777 }, { '777': { bezeichnung: 'H', ort: 'Ulm' } })]);
    expect(hallState(only.get('777')!, byId).slug).toBe('baden-wuerttemberg');
    expect(hallState(only.get('777')!, new Map()).slug).toBe('weitere');
  });

  it('Pfad halle/<land>/<ort>/<halle>/, gleiche Namen im selben Ort mit ID', () => {
    const c = club(3, 'Dritter', 'Ulm', '0100003', { halls: [{ id: 1, dbbSpielfeldId: 501, bezeichnung: 'Sporthalle Ost', ort: 'Ulm - Wiblingen' } as any] });
    const h = collectHalls([clubA, c], []);
    const w = hallWishes(h, new Map([[1, clubA], [3, c]]), knownOrte([clubA, c]));
    expect(w.map(x => x.desired)).toEqual(['halle/baden-wuerttemberg/ulm/sporthalle-ost/', 'halle/baden-wuerttemberg/ulm/sporthalle-ost/']);
    const m = assignKeyed(w);
    expect(m['500'].path).toBe('halle/baden-wuerttemberg/ulm/sporthalle-ost/');
    expect(m['501'].path).toBe('halle/baden-wuerttemberg/ulm/sporthalle-ost-501/');
  });

  it('Seite: Zähler, nächste Spiele, Vereine mit Heimspielen, Fehler-melden-Link, strukturierte Daten', () => {
    const d = doc([
      mk(1, tm(1, 1, 'TV Ulm'), tm(9, 9, 'Gast <b>'), '2026-10-10'),
      mk(2, tm(1, 1, 'TV Ulm'), tm(9, 9, 'Gast <b>'), '2026-09-20', '80:70'),
      mk(3, tm(1, 1, 'TV Ulm'), tm(9, 9, 'Gast <b>'), '2026-11-01', null, { abgesagt: true })
    ], { '1': 500, '2': 500, '3': 500 });
    const hall = collectHalls([clubA, clubB], [d]).get('500')!;
    const html = renderHallPage({
      base: BASE, hall, path: 'halle/baden-wuerttemberg/ulm/sporthalle-ost/', today: '2026-10-03', clubById: new Map([[1, clubA], [2, clubB]]),
      clubPaths: { '1': 'baden-wuerttemberg/ulm/tv-ulm/' }, teamPaths: {}, ligaPaths: { 5: 'liga/bayern/liga-5/' },
      state: { slug: 'baden-wuerttemberg', name: 'Baden-Württemberg' }, placePage: { name: 'Ulm', path: 'baden-wuerttemberg/ulm/' }
    });
    expect(html).toContain('<base href="../../../../">');
    expect(html).toContain('<h1>Sporthalle Ost</h1>');
    expect(html).toContain('<address>Weg 1, 89073 Ulm</address>');
    expect(html).toContain('2 Spiele mit dieser Halle gemeldet: 1 gespielt, 1 anstehend');   // abgesagtes Spiel zählt nicht
    expect(html).toContain('Gast &lt;b&gt;');
    expect(html).toContain('<a href="baden-wuerttemberg/ulm/tv-ulm/">TV Ulm</a> <span class="seo-note">2 Heimspiele hier</span>');
    expect(html).toContain('SV Neu-Ulm');                                           // meldet die Halle, ohne Heimspiel hier
    expect(html).toContain('openstreetmap.org/search?query=');                       // ohne Koordinaten
    expect(html).toContain('issues/new?template=datenfehler.yml');
    expect(html).toContain('"@type":"SportsActivityLocation"');
    expect(html).toContain('baden-wuerttemberg/ulm/">Ulm</a>');                      // Brotkrumen
  });

  it('Halle ohne Spiele: ehrlicher Hinweis; mit Koordinaten Karte und geo', () => {
    const c = club(7, 'TV Test', 'Ulm', '0100007', { halls: [{ id: 1, dbbSpielfeldId: 9, bezeichnung: 'Halle', plz: '89073', ort: 'Ulm', lat: 48.4, lng: 9.99 } as any] });
    const hall = collectHalls([c], []).get('9')!;
    const html = renderHallPage({ base: BASE, hall, path: 'halle/baden-wuerttemberg/ulm/halle/', today: '2026-10-03', clubById: new Map([[7, c]]), clubPaths: {}, teamPaths: {}, ligaPaths: {}, state: { slug: 'baden-wuerttemberg', name: 'BW' } });
    expect(html).toContain('noch kein Spiel gemeldet');
    expect(html).toContain('mlat=48.4&amp;mlon=9.99');
    expect(html).toContain('"geo":{"@type":"GeoCoordinates","latitude":48.4,"longitude":9.99}');
  });

  it('buildSite: Hallenseite, Link von Vereins- und Ortsseite, Weiterleitung bei Umzug, Sitemap', () => {
    const d = doc([mk(1, tm(1, 1, 'TV Ulm'), tm(9, 9, 'G'), '2026-10-10')], { '1': 500 });
    const before = buildSite([clubA], {}, BASE, '2026-10-03', { docs: [d] });
    expect(before.hallMap['500'].path).toBe('halle/baden-wuerttemberg/ulm/sporthalle-ost/');
    expect(before.files.get('baden-wuerttemberg/ulm/tv-ulm/index.html')).toContain('<a href="halle/baden-wuerttemberg/ulm/sporthalle-ost/">Sporthalle Ost</a>');
    const ort = before.files.get('baden-wuerttemberg/ulm/index.html')!;
    expect(ort).toContain('Hallen in Ulm');
    expect(ort).toContain('Weg 1, 89073 Ulm · 1 Spiel gemeldet');
    expect(before.files.get('sitemap.xml')).toContain('/halle/baden-wuerttemberg/ulm/sporthalle-ost/<');

    // Übersichten: /halle/ → Land → Ort, mit Brotkrumen und in der Sitemap
    const hub = before.files.get('halle/index.html')!;
    expect(hub).toContain('<h1>Basketballhallen in Deutschland</h1>');
    expect(hub).toContain('href="halle/baden-wuerttemberg/"');
    expect(before.files.get('halle/baden-wuerttemberg/index.html')).toContain('href="halle/baden-wuerttemberg/ulm/"');
    const ortHallen = before.files.get('halle/baden-wuerttemberg/ulm/index.html')!;
    expect(ortHallen).toContain('<a href="halle/baden-wuerttemberg/ulm/sporthalle-ost/">Sporthalle Ost</a>');
    expect(ortHallen).toContain('<li><a href="halle/">Hallen</a></li>');
    expect(before.files.get('sitemap.xml')).toContain('/halle/<');
    expect(before.hasHalls).toBe(true);

    const renamed = { ...clubA, halls: [{ ...clubA.halls[0], bezeichnung: 'Neue Halle Ost' }] } as ClubEntry;
    const after = buildSite([renamed], before.urlMap, BASE, '2026-10-03', { docs: [{ ...d, halls: {} } as any], previousHalls: before.hallMap });
    expect(after.hallMap['500'].path).toBe('halle/baden-wuerttemberg/ulm/neue-halle-ost/');
    expect(after.files.get('halle/baden-wuerttemberg/ulm/sporthalle-ost/index.html')).toContain('http-equiv="refresh"');
  });
});

describe('Hallenkarte', () => {
  const c = club(7, 'TV Test', 'Ulm', '0100007', { halls: [{ id: 1, dbbSpielfeldId: 9, bezeichnung: 'Halle', strasse: 'Weg 1', plz: '89073', ort: 'Ulm' } as any] });
  const render = (geo: any) => {
    const hall = collectHalls([c], [], geo).get('9')!;
    return renderHallPage({ base: BASE, hall, path: 'halle/baden-wuerttemberg/ulm/halle/', today: '2026-10-03', clubById: new Map([[7, c]]), clubPaths: {}, teamPaths: {}, ligaPaths: {}, state: { slug: 'baden-wuerttemberg', name: 'BW' } });
  };

  it('Koordinate auf die Adresse: Karte, genauer OSM-Link und geo', () => {
    const html = render({ '9': { lat: 48.4, lng: 9.99, precision: 'adresse' } });
    expect(html).toContain('<script src="map-tiles.js"></script>\n  <script src="hall.js"></script>');
    expect(html).toContain('id="hall-map"');
    expect(html).toContain('data-lat="48.4" data-lng="9.99" data-zoom="16"');
    expect(html).toContain('<script src="hall.js"></script>');
    expect(html).toContain('mlat=48.4');
    expect(html).toContain('"geo":{"@type":"GeoCoordinates","latitude":48.4,"longitude":9.99}');
    expect(html).not.toContain('nur ungefähr');
  });

  it('Koordinate nur auf den Ort: Karte mit Hinweis, Suchlink statt Pin, kein geo', () => {
    const html = render({ '9': { lat: 48.4, lng: 9.99, precision: 'ort' } });
    expect(html).toContain('data-zoom="13"');
    expect(html).toContain('nur ungefähr');
    expect(html).toContain('openstreetmap.org/search?query=');
    expect(html).not.toContain('"geo"');
  });

  it('ohne Koordinate der Halle: ungefähre Lage aus der Ortsposition des meldenden Vereins, mit Hinweis', () => {
    const html = render({});
    expect(html).toContain('id="hall-map"');
    expect(html).toContain('data-lat="49" data-lng="12" data-zoom="13"');
    expect(html).toContain('nur ungefähr');
    expect(html).not.toContain('"geo"');
  });

  it('weder Koordinate noch Verein mit Position: keine Karte und kein Leaflet', () => {
    const lonely = club(7, 'TV Test', 'Ulm', '0100007', { lat: undefined, lng: undefined, halls: [{ id: 1, dbbSpielfeldId: 9, bezeichnung: 'Halle', strasse: 'Weg 1', plz: '89073', ort: 'Ulm' } as any] } as any);
    const hall = collectHalls([lonely], [], {}).get('9')!;
    const html = renderHallPage({ base: BASE, hall, path: 'halle/baden-wuerttemberg/ulm/halle/', today: '2026-10-03', clubById: new Map([[7, lonely]]), clubPaths: {}, teamPaths: {}, ligaPaths: {}, state: { slug: 'baden-wuerttemberg', name: 'BW' } });
    expect(html).not.toContain('hall-map');
    expect(html).not.toContain('leaflet');
  });

  it('die geokodierte Koordinate hat Vorrang vor der Position des Vereins', () => {
    const hall = collectHalls([c], [], { '9': { lat: 48.4, lng: 9.99, precision: 'adresse' } }).get('9')!;
    expect([hall.lat, hall.lng, hall.precision]).toEqual([48.4, 9.99, 'adresse']);
  });
});

describe('Spielplan-Zeile', () => {
  const m = { kickoffDate: '2026-10-10', kickoffTime: '18:00', result: null };
  it('Datum wie auf der Teamseite: Wochentag, Datum, Uhrzeit', () => {
    expect(kickoffText('2026-10-10', '18:00')).toBe('Sa, 10.10.2026 · 18:00');
    expect(kickoffText('2026-10-10')).toBe('Sa, 10.10.2026');
    expect(kickoffText(undefined, '18:00')).toBe('18:00');
  });
  it('immer Zeit | Paarung | Ergebnis in einem dss-rows-Rahmen', () => {
    const html = scheduleRows([{ match: m, teams: 'A – B', meta: ['Liga 1'] }]);
    expect(html).toBe('<div class="dss-rows"><div class="dss-row dss-row--match"><div class="dss-row-when">Sa, 10.10.2026 · 18:00</div><div class="dss-row-main"><span class="dss-row-teams">A – B</span><span class="dss-row-meta">Liga 1</span></div><div class="dss-row-score">–</div></div></div>');
  });
  it('abgesagt und Verzicht stehen im Ergebnisfeld', () => {
    expect(scheduleRows([{ match: { ...m, abgesagt: true }, teams: 'A – B' }])).toContain('<div class="dss-row-score">abgesagt</div>');
    expect(scheduleRows([{ match: { ...m, verzicht: true }, teams: 'A – B' }])).toContain('<div class="dss-row-score">Verzicht</div>');
  });
});
