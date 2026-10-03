import { assignKeyed, ligaWishes, top3, top3Text, renderLigaPage, buildLigaPages, LigaDoc, slugify, clubSlug, mainPlace, letterOf, knownOrte, renderListPage, ALPHABET_MIN, placeOf, assignPaths, buildSite, renderClubPage, renderRedirect, injectRegionLinks, depthPrefix, UrlMap } from '../crawler/seo';
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

  it('Regionsliste für die Startseite', () => {
    expect(b.regions.map(r => r.slug)).toEqual(['bayern', 'bundesweit']);
    const out = injectRegionLinks('<nav><!--REGION-LINKS--></nav>', b.regions);
    expect(out).toContain('<a href="bayern/">Bayern</a>');
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
    expect(long).toContain('<h2 id="buchstabe-a">A</h2>');
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
    expect(html).toContain('26.09.2026 18:30');
    expect(html).toContain('<strong>74:89</strong>');
    expect(html).toContain('Nächste Spiele');
    expect(html).not.toContain('11.10.2026');     // abgesagt
    expect(html).toContain('<th scope="col">Platz</th>');
    expect(html).toContain('Aktuell: 1. TV Regensburg');
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
    expect(b.files.get('bayern/index.html')).toContain('Alle 1 Ligen in Bayern');
    const ort = b.files.get('bayern/regensburg/index.html')!;
    expect(ort).toContain('Ligen in Regensburg');
    expect(ort).toContain('TV Regensburg: Platz 1');
    expect(b.files.get('bayern/regensburg/tv-regensburg/index.html')).toContain('<a href="liga/bayern/kreisliga-a/">Kreisliga A</a>');
    expect(b.files.get('sitemap.xml')).toContain('/liga/bayern/kreisliga-a/<');
    expect(b.hasLiga).toBe(true);
    expect(injectRegionLinks('<!--REGION-LINKS-->', b.regions, true)).toContain('href="liga/"');
  });
});
