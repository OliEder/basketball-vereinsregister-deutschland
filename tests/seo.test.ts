import { slugify, clubSlug, placeOf, assignPaths, buildSite, renderClubPage, renderRedirect, injectRegionLinks, depthPrefix, UrlMap } from '../crawler/seo';
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
