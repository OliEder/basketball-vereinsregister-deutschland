// Statische Seiten für Suchmaschinen: Vereinsseiten unter /<bundesland>/<ort>/<verein>/, Regionsseiten,
// sitemap.xml, robots.txt und Weiterleitungsseiten für Pfade, die sich geändert haben.
//
//   npx ts-node crawler/seo.ts --site=_site [--store=url-store] [--clubs=data/clubs.json] [--base=https://…]
//
// Die URL-Zuordnung (clubId → Pfad + frühere Pfade) liegt in url-map.json und wird vom Pages-Workflow im
// Branch "url-store" dauerhaft aufbewahrt. Wandert ein Verein (z. B. weil sich der Ort ändert), bleibt der
// alte Pfad als Weiterleitung (meta refresh + canonical) bestehen.
import fs from 'fs';
import path from 'path';
import { chooseHomeHall } from './club-geocoder';
import { loadExistingClubs } from './writer';
import { ClubEntry } from './types';

export const DEFAULT_BASE = 'https://olieder.github.io/basketball-vereinsregister-deutschland';

const STATES: Record<string, string> = {
  '01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Berlin', '04': 'Bremen', '05': 'Hamburg',
  '06': 'Hessen', '07': 'Niedersachsen', '08': 'Rheinland-Pfalz', '09': 'Saarland', '10': 'Schleswig-Holstein',
  '11': 'Nordrhein-Westfalen', '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen-Anhalt', '14': 'Brandenburg',
  '15': 'Sachsen', '16': 'Thüringen'
};
export const NATIONAL = { slug: 'bundesweit', name: 'Bundesweit (Bundesligen, Rollstuhl, Kooperationen)' };
export const NO_PLACE = { slug: 'weitere', name: 'Ort unbekannt' };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Vereinsname für den Pfad: ohne Rechtsform-Zusatz "e.V." / "e. V." */
export function clubSlug(name: string): string {
  return slugify(name.replace(/\s*\be\.\s?v\.?(?=\s|$|,)/gi, ''));
}

export interface ClubPlace {
  state: { slug: string; name: string };
  place: { slug: string; name: string };
}

/** Ort der Heimhalle (roh, wie gemeldet); ohne Heimhalle der häufigste Hallenort. */
export function rawOrt(club: ClubEntry): string | undefined {
  const home = chooseHomeHall(club)?.hall.ort;
  if (home) return home;
  const counts = new Map<string, number>();
  for (const h of club.halls ?? []) if (h.ort) counts.set(h.ort, (counts.get(h.ort) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Menge aller gemeldeten Orte (klein geschrieben): Grundlage, um Stadtteile "Stuttgart-Degerloch" zu erkennen. */
export function knownOrte(clubs: ClubEntry[]): Set<string> {
  const out = new Set<string>();
  for (const c of clubs) { const o = rawOrt(c); if (o) out.add(o.replace(/\s+/g, ' ').trim().toLowerCase()); }
  return out;
}

/**
 * Stadtteile gehören zur Stadt: "Köln - Porz" und "Pulheim ¿ Stommeln" werden zu "Köln" und "Pulheim";
 * "Stuttgart-Degerloch" nur, wenn "Stuttgart" selbst als Ort vorkommt (Garmisch-Partenkirchen bleibt).
 */
export function mainPlace(ort: string, known?: Set<string>): string {
  const t = ort.replace(/\s+/g, ' ').trim();
  const spaced = t.split(/\s[-–—¿]\s|\s?¿\s?/)[0].trim();
  if (spaced.length >= 3 && spaced !== t) return spaced;
  const i = t.indexOf('-');
  if (i >= 4 && known?.has(t.slice(0, i).toLowerCase())) return t.slice(0, i);
  return t;
}

export function placeOf(club: ClubEntry, known?: Set<string>): ClubPlace {
  const code = (club.vereinsnummer ?? '').slice(0, 2);
  const stateName = STATES[code];
  const state = stateName ? { slug: slugify(stateName), name: stateName } : NATIONAL;

  const raw = rawOrt(club);
  const ort = raw ? mainPlace(raw, known) : undefined;
  const slug = ort ? slugify(ort) : '';
  return { state, place: slug ? { slug, name: ort! } : NO_PLACE };
}

export interface UrlEntry { path: string; history: string[] }
export type UrlMap = Record<string, UrlEntry>;

/**
 * Weist jedem Verein einen Pfad "<bundesland>/<ort>/<slug>/" zu. Bestehende Zuordnungen bleiben, solange der
 * Pfad noch passt; ändert sich Ort oder Land, wandert der Verein und der alte Pfad kommt in "history".
 * Gleiche Pfade verschiedener Vereine werden durch die Vereins-ID unterschieden.
 */
export function assignPaths(clubs: ClubEntry[], previous: UrlMap = {}): UrlMap {
  const sorted = [...clubs].sort((a, b) => a.clubId - b.clubId);
  const desired = new Map<number, string>();
  const known = knownOrte(clubs);
  for (const c of sorted) {
    const { state, place } = placeOf(c, known);
    const slug = clubSlug(c.name) || `verein-${c.clubId}`;
    desired.set(c.clubId, `${state.slug}/${place.slug}/${slug}/`);
  }

  const taken = new Set<string>();
  const result = new Map<number, string>();
  // 1. Vereine, die ihren Pfad schon haben, behalten ihn (auch wenn ein anderer Verein später denselben Namen bekommt)
  for (const c of sorted) {
    const prev = previous[String(c.clubId)];
    const want = desired.get(c.clubId)!;
    if (prev && (prev.path === want || prev.path === withId(want, c.clubId)) && !taken.has(prev.path)) {
      result.set(c.clubId, prev.path);
      taken.add(prev.path);
    }
  }
  // 2. alle anderen in Reihenfolge der ID
  for (const c of sorted) {
    if (result.has(c.clubId)) continue;
    let p = desired.get(c.clubId)!;
    if (taken.has(p)) p = withId(p, c.clubId);
    result.set(c.clubId, p);
    taken.add(p);
  }

  const out: UrlMap = {};
  const current = new Set(result.values());
  for (const c of sorted) {
    const p = result.get(c.clubId)!;
    const old = previous[String(c.clubId)];
    const history = new Set(old?.history ?? []);
    if (old && old.path !== p) history.add(old.path);
    history.delete(p);
    for (const h of [...history]) if (current.has(h)) history.delete(h);   // Pfad gehört jetzt einem anderen Verein
    out[String(c.clubId)] = { path: p, history: [...history].sort() };
  }
  // Vereine, die aus clubs.json verschwunden sind, behalten ihre Zuordnung (der Pfad wird nicht neu vergeben)
  for (const [id, entry] of Object.entries(previous)) {
    if (out[id] || current.has(entry.path)) continue;
    out[id] = entry;
  }
  return out;
}

function withId(p: string, id: number): string {
  return p.replace(/\/$/, '') + `-${id}/`;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (o: unknown): string => JSON.stringify(o).replace(/</g, '\\u003c');

export function depthPrefix(p: string): string {
  const depth = p.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap';

interface PageOpts {
  title: string;
  description: string;
  canonicalPath?: string;
  pagePath: string;       // z. B. "bayern/regensburg/" ("" = Startseite)
  base: string;
  body: string;
  head?: string;
  scripts?: string;
  noindex?: boolean;
  styles?: string[];
}

function shell(o: PageOpts): string {
  const root = depthPrefix(o.pagePath);
  const url = `${o.base}/${o.canonicalPath ?? o.pagePath}`;
  const styles = (o.styles ?? ['style.css']).map(s => `  <link rel="stylesheet" href="${s}">`).join('\n');
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${root || './'}">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${esc(url)}">
${o.noindex ? '  <meta name="robots" content="noindex">\n' : ''}  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_DE">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:url" content="${esc(url)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="dss/tokens.css">
  <link rel="stylesheet" href="dss/components.css">
${styles}
${o.head ?? ''}  <script src="theme.js"></script>
  <script>initTheme();</script>
</head>
<body>
${o.body}
${o.scripts ?? ''}</body>
</html>
`;
}

function breadcrumbLd(base: string, items: { name: string; path: string }[]): string {
  return `  <script type="application/ld+json">${jsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${base}/${it.path}` }))
  })}</script>\n`;
}

function crumbNav(items: { name: string; path: string }[]): string {
  const parts = items.map((it, i) => i === items.length - 1
    ? `<li aria-current="page">${esc(it.name)}</li>`
    : `<li><a href="${it.path || 'index.html'}">${esc(it.name)}</a></li>`);
  return `    <nav class="seo-crumbs" aria-label="Brotkrumen"><ol>${parts.join('')}</ol></nav>`;
}

function topbar(): string {
  return `  <header class="verein-header dss-topbar">
    <div class="verein-header-inner">
      <a href="index.html" class="back-link">Basketball Vereinsregister</a>
      <button class="theme-toggle dss-btn dss-btn--ghost dss-btn--icon" id="theme-toggle-btn" onclick="toggleTheme()" aria-label="Zum Light-Modus wechseln" title="Theme wechseln">
        <svg id="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg id="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </header>`;
}

function teamLabel(t: ClubEntry['teams'][number]): string {
  const ak = t.altersklasse ?? '';
  const g = t.geschlecht ?? '';
  const num = t.teamNumber && t.teamNumber > 1 ? ` ${t.teamNumber}` : '';
  if (ak.toLowerCase() === 'senioren') return (g === 'weiblich' ? 'Frauen' : g === 'männlich' ? 'Herren' : ak) + num;
  return ak + (g ? ` (${g})` : '') + num;
}

export interface ClubPageContext { base: string; club: ClubEntry; urlPath: string; cp: ClubPlace; canonicalPath?: string }

export function renderClubPage(ctx: ClubPageContext): string {
  const { base, club, urlPath, cp } = ctx;
  const canonical = ctx.canonicalPath ?? urlPath;
  const home = chooseHomeHall(club)?.hall ?? club.halls?.[0];
  const ortText = cp.place === NO_PLACE ? '' : cp.place.name;
  const land = cp.state === NATIONAL ? '' : cp.state.name;
  const teams = (club.teams ?? []).slice().sort((a, b) => (a.altersklasse ?? '').localeCompare(b.altersklasse ?? '', 'de'));
  const where = [ortText, land].filter(Boolean).join(', ');

  const description = [
    `${club.name}${where ? ` – Basketballverein aus ${where}` : ' – Basketballverein'}.`,
    teams.length ? `${teams.length} ${teams.length === 1 ? 'Team' : 'Teams'}` + (teams.length > 0 ? ' mit Spielplänen, Tabellen und Hallen.' : '.') : 'Hallen und Kontakt.'
  ].join(' ');

  const crumbs = [
    { name: 'Vereinsregister', path: '' },
    { name: cp.state.name, path: `${cp.state.slug}/` },
    ...(cp.place === NO_PLACE ? [] : [{ name: cp.place.name, path: `${cp.state.slug}/${cp.place.slug}/` }]),
    { name: club.name, path: urlPath }
  ];

  const org: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: club.name,
    url: `${base}/${urlPath}`,
    sport: 'Basketball'
  };
  if (club.logoUrl) org.logo = club.logoUrl;
  if ((club as any).website) org.sameAs = [(club as any).website];
  if (home) {
    org.location = {
      '@type': 'Place',
      name: home.bezeichnung,
      address: {
        '@type': 'PostalAddress',
        ...(home.strasse ? { streetAddress: home.strasse } : {}),
        ...(home.plz ? { postalCode: home.plz } : {}),
        ...(home.ort ? { addressLocality: home.ort } : {}),
        addressCountry: 'DE'
      },
      ...(typeof club.lat === 'number' && typeof club.lng === 'number'
        ? { geo: { '@type': 'GeoCoordinates', latitude: club.lat, longitude: club.lng } }
        : {})
    };
  }

  const teamItems = teams.map(t => `<li>${esc(teamLabel(t))}${t.liganame ? ` – ${esc(t.liganame)}` : ''}</li>`).join('');
  const hallItems = (club.halls ?? []).map(h => {
    const addr = [h.strasse, [h.plz, h.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return `<li>${esc(h.bezeichnung)}${addr ? ` – ${esc(addr)}` : ''}</li>`;
  }).join('');

  // Der Inhalt von #verein-content ist die statische Fassung für Suchmaschinen; verein.js ersetzt ihn.
  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(crumbs)}
    <div id="verein-content">
      <h1>${esc(club.name)}</h1>
      ${where ? `<p>${esc(where)}</p>` : ''}
      ${teamItems ? `<h2>Teams (${teams.length})</h2><ul>${teamItems}</ul>` : ''}
      ${hallItems ? `<h2>Hallen</h2><ul>${hallItems}</ul>` : ''}
      <noscript><p>Spielpläne und Tabellen werden mit JavaScript geladen.</p></noscript>
    </div>
  </main>`;

  return shell({
    title: `${club.name}${ortText ? ` – ${ortText}` : ''} | Basketball Vereinsregister`,
    description,
    pagePath: urlPath,
    canonicalPath: canonical,
    base,
    styles: ['style.css', 'verein.css', 'seo.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
    head: `  <meta name="club-id" content="${club.clubId}">\n  <script type="application/ld+json">${jsonLd(org)}</script>\n${breadcrumbLd(base, crumbs)}`,
    body,
    scripts: `  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script src="team-logic.js"></script>
  <script src="verein.js"></script>
`
  });
}

export interface ListItem { name: string; href: string; note?: string }

export const ALPHABET_MIN = 30;

export function letterOf(name: string): string {
  const c = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

/** Bei langen Listen: Gruppen je Anfangsbuchstabe plus Sprungleiste A–Z (Ziele mit Seitenpfad, wegen <base>). */
function alphabetGroups(pagePath: string, items: ListItem[]): { nav: string; groups: { heading: string; id: string; items: ListItem[] }[] } {
  const byLetter = new Map<string, ListItem[]>();
  for (const it of items) {
    const l = letterOf(it.name);
    byLetter.set(l, [...(byLetter.get(l) ?? []), it]);
  }
  const letters = [...byLetter.keys()].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  const nav = `      <nav class="seo-alphabet" aria-label="Alphabet"><ul>${letters.map(l => `<li><a href="${pagePath}#buchstabe-${l === '#' ? 'sonst' : l.toLowerCase()}">${l}</a></li>`).join('')}</ul></nav>`;
  return { nav, groups: letters.map(l => ({ heading: l, id: `buchstabe-${l === '#' ? 'sonst' : l.toLowerCase()}`, items: byLetter.get(l)! })) };
}

export function renderListPage(opts: {
  base: string; pagePath: string; title: string; heading: string; intro: string;
  crumbs: { name: string; path: string }[]; groups: { heading?: string; items: ListItem[] }[];
}): string {
  let alphabet = '';
  let source: { heading?: string; id?: string; items: ListItem[] }[] = opts.groups;
  if (opts.groups.length === 1 && !opts.groups[0].heading && opts.groups[0].items.length >= ALPHABET_MIN) {
    const a = alphabetGroups(opts.pagePath, opts.groups[0].items);
    alphabet = a.nav;
    source = a.groups;
  }
  const groups = source.map(g => `      ${g.heading ? `<h2${g.id ? ` id="${g.id}"` : ''}>${esc(g.heading)}</h2>` : ''}
      <ul class="seo-list">${g.items.map(i => `<li><a href="${i.href}">${esc(i.name)}</a>${i.note ? ` <span class="seo-note">${esc(i.note)}</span>` : ''}</li>`).join('')}</ul>`).join('\n');
  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(opts.crumbs)}
    <div id="verein-content" class="seo-list-page">
      <h1>${esc(opts.heading)}</h1>
      <p>${esc(opts.intro)}</p>
${alphabet}
${groups}
    </div>
  </main>`;
  return shell({
    title: `${opts.title} | Basketball Vereinsregister`,
    description: opts.intro,
    pagePath: opts.pagePath,
    base: opts.base,
    styles: ['style.css', 'verein.css', 'seo.css'],
    head: breadcrumbLd(opts.base, opts.crumbs),
    body
  });
}

export function renderRedirect(base: string, from: string, to: string): string {
  const target = `${base}/${to}`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Weiterleitung</title>
  <link rel="canonical" href="${esc(target)}">
  <meta http-equiv="refresh" content="0; url=${esc(target)}">
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body><p>Diese Seite ist umgezogen: <a href="${esc(target)}">${esc(target)}</a></p></body>
</html>
`;
}

export function renderSitemap(base: string, paths: string[], lastmod: string): string {
  const urls = ['', ...paths].map(p => `  <url><loc>${esc(`${base}/${p}`)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export interface SiteBuild { files: Map<string, string>; urlMap: UrlMap; regions: { state: string; slug: string; clubs: number }[] }

export function buildSite(clubs: ClubEntry[], previous: UrlMap, base: string, lastmod: string): SiteBuild {
  const urlMap = assignPaths(clubs, previous);
  const files = new Map<string, string>();
  const sitemapPaths: string[] = [];
  const known = knownOrte(clubs);
  const currentPaths = new Set(Object.values(urlMap).map(e => e.path));

  type Group = { state: ClubPlace['state']; places: Map<string, { name: string; clubs: { club: ClubEntry; p: string }[] }> };
  const states = new Map<string, Group>();

  for (const club of clubs) {
    const entry = urlMap[String(club.clubId)];
    const cp = placeOf(club, known);
    // Stimmt der Pfad nicht mehr mit Land/Ort überein (Namens-ID-Variante), gehört der Verein trotzdem hierher.
    const [stateSlug, placeSlug] = entry.path.split('/');
    const sg = states.get(stateSlug) ?? { state: cp.state, places: new Map() };
    states.set(stateSlug, sg);
    const pg = sg.places.get(placeSlug) ?? { name: cp.place.name, clubs: [] };
    sg.places.set(placeSlug, pg);
    pg.clubs.push({ club, p: entry.path });

    // Dieselbe Mannschaft taucht in den Daten mehrfach auf (z. B. je Bundesliga-Spielklasse). Die Seiten mit
    // angehängter ID sind Dubletten: erreichbar, aber canonical auf die Hauptseite und nicht in der Sitemap.
    const dupOf = entry.path.replace(new RegExp(`-${club.clubId}/$`), '/');
    const canonicalPath = dupOf !== entry.path && currentPaths.has(dupOf) ? dupOf : undefined;
    files.set(`${entry.path}index.html`, renderClubPage({ base, club, urlPath: entry.path, cp, canonicalPath }));
    if (!canonicalPath) sitemapPaths.push(entry.path);
    for (const old of entry.history) files.set(`${old}index.html`, renderRedirect(base, old, entry.path));
  }

  const regions: SiteBuild['regions'] = [];
  const sortedStates = [...states.entries()].sort((a, b) => a[1].state.name.localeCompare(b[1].state.name, 'de'));
  for (const [stateSlug, sg] of sortedStates) {
    const places = [...sg.places.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'));
    const total = places.reduce((n, [, p]) => n + p.clubs.length, 0);
    regions.push({ state: sg.state.name, slug: stateSlug, clubs: total });

    for (const [placeSlug, pg] of places) {
      const items = pg.clubs.sort((a, b) => a.club.name.localeCompare(b.club.name, 'de'))
        .map(({ club, p }) => ({ name: club.name, href: p, note: `${club.teams?.length ?? 0} Teams` }));
      const pagePath = `${stateSlug}/${placeSlug}/`;
      files.set(`${pagePath}index.html`, renderListPage({
        base, pagePath,
        title: `Basketball in ${pg.name} (${sg.state.name})`,
        heading: `Basketballvereine in ${pg.name}`,
        intro: `${pg.clubs.length} ${pg.clubs.length === 1 ? 'Basketballverein' : 'Basketballvereine'} in ${pg.name}, ${sg.state.name}, mit Teams, Hallen, Spielplänen und Tabellen.`,
        crumbs: [{ name: 'Vereinsregister', path: '' }, { name: sg.state.name, path: `${stateSlug}/` }, { name: pg.name, path: pagePath }],
        groups: [{ items }]
      }));
      sitemapPaths.push(pagePath);
    }

    const pagePath = `${stateSlug}/`;
    files.set(`${pagePath}index.html`, renderListPage({
      base, pagePath,
      title: `Basketballvereine in ${sg.state.name}`,
      heading: `Basketballvereine in ${sg.state.name}`,
      intro: `${total} Basketballvereine in ${sg.state.name}, nach Orten sortiert, mit Teams, Hallen, Spielplänen und Tabellen.`,
      crumbs: [{ name: 'Vereinsregister', path: '' }, { name: sg.state.name, path: pagePath }],
      groups: [{ items: places.map(([slug, p]) => ({ name: p.name, href: `${stateSlug}/${slug}/`, note: `${p.clubs.length} ${p.clubs.length === 1 ? 'Verein' : 'Vereine'}` })) }]
    }));
    sitemapPaths.push(pagePath);
  }

  files.set('sitemap.xml', renderSitemap(base, sitemapPaths, lastmod));
  files.set('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  return { files, urlMap, regions };
}

/** Ersetzt in der Startseite den Platzhalter durch Links auf die Regionsseiten (Crawler erreichen so alle Seiten). */
export function injectRegionLinks(indexHtml: string, regions: SiteBuild['regions']): string {
  const links = regions.map(r => `<li><a href="${r.slug}/">${esc(r.state)}</a> <span class="seo-note">${r.clubs}</span></li>`).join('');
  return indexHtml.replace('<!--REGION-LINKS-->', `<ul class="seo-list seo-regions">${links}</ul>`);
}

function arg(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function writeAll(root: string, files: Map<string, string>): void {
  for (const [rel, content] of files) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
  }
}

function main(): void {
  const site = arg('site') ?? '_site';
  const store = arg('store');
  const base = (arg('base') ?? process.env.SITE_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
  const mapFile = store ? path.join(store, 'url-map.json') : null;
  const previous: UrlMap = mapFile && fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf-8')) : {};

  const clubsFile = arg('clubs');
  const clubs: ClubEntry[] = clubsFile
    ? JSON.parse(fs.readFileSync(clubsFile, 'utf-8'))
    : Array.from(loadExistingClubs().values());
  const build = buildSite(clubs, previous, base, new Date().toISOString().slice(0, 10));
  writeAll(site, build.files);

  fs.mkdirSync(path.join(site, 'data'), { recursive: true });
  const publicMap = Object.fromEntries(Object.entries(build.urlMap).map(([id, e]) => [id, e.path]));
  fs.writeFileSync(path.join(site, 'data', 'url-map.json'), JSON.stringify(publicMap), 'utf-8');

  const indexFile = path.join(site, 'index.html');
  if (fs.existsSync(indexFile)) fs.writeFileSync(indexFile, injectRegionLinks(fs.readFileSync(indexFile, 'utf-8'), build.regions), 'utf-8');

  if (mapFile) {
    fs.mkdirSync(store!, { recursive: true });
    fs.writeFileSync(mapFile, JSON.stringify(build.urlMap, null, 1) + '\n', 'utf-8');
  }
  const moved = Object.values(build.urlMap).filter(e => e.history.length).length;
  console.log(`SEO: ${clubs.length} Vereinsseiten, ${build.regions.length} Regionen, ${moved} umgezogen, ${build.files.size} Dateien → ${site}`);
}

if (require.main === module) main();
