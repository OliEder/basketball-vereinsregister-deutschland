// Statische Seiten für Suchmaschinen: Vereinsseiten unter /<bundesland>/<ort>/<verein>/, Regionsseiten,
// sitemap.xml, robots.txt und Weiterleitungsseiten für Pfade, die sich geändert haben.
//
//   npx ts-node crawler/seo.ts --site=_site [--store=url-store] [--clubs=data/clubs.json] [--coords=data-store/hall-coords.json] [--base=https://…]
//
// Die URL-Zuordnung (clubId → Pfad + frühere Pfade) liegt in url-map.json und wird vom Pages-Workflow im
// Branch "url-store" dauerhaft aufbewahrt. Wandert ein Verein (z. B. weil sich der Ort ändert), bleibt der
// alte Pfad als Weiterleitung (meta refresh + canonical) bestehen.
import fs from 'fs';
import path from 'path';
import { chooseHomeHall } from './club-geocoder';
import { loadExistingClubs } from './writer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Report: { url(o: { kind: string; id: string | number; name: string; page: string }): string } = require('../portal/report.js');
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
  const known = knownOrte(clubs);
  return assignKeyed(sorted.map(c => {
    const { state, place } = placeOf(c, known);
    const slug = clubSlug(c.name) || `verein-${c.clubId}`;
    return { key: String(c.clubId), desired: `${state.slug}/${place.slug}/${slug}/` };
  }), previous);
}

export interface PathWish { key: string; desired: string }

/**
 * Gemeinsame Pfadvergabe für Vereine und Ligen: `wishes` in fester Reihenfolge (Schlüssel aufsteigend).
 * Bestehende Zuordnungen bleiben, solange der Wunschpfad passt; sonst wandert der Eintrag und der alte
 * Pfad kommt in "history". Gleiche Wunschpfade werden durch den Schlüssel unterschieden.
 */
export function assignKeyed(wishes: PathWish[], previous: UrlMap = {}): UrlMap {
  const taken = new Set<string>();
  const result = new Map<string, string>();
  // 1. Einträge, die ihren Pfad schon haben, behalten ihn (auch wenn ein anderer später denselben Namen bekommt)
  for (const w of wishes) {
    const prev = previous[w.key];
    if (prev && (prev.path === w.desired || prev.path === withId(w.desired, w.key)) && !taken.has(prev.path)) {
      result.set(w.key, prev.path);
      taken.add(prev.path);
    }
  }
  // 2. alle anderen in der Reihenfolge der Schlüssel
  for (const w of wishes) {
    if (result.has(w.key)) continue;
    let p = w.desired;
    if (taken.has(p)) p = withId(p, w.key);
    result.set(w.key, p);
    taken.add(p);
  }

  const out: UrlMap = {};
  const current = new Set(result.values());
  for (const w of wishes) {
    const p = result.get(w.key)!;
    const old = previous[w.key];
    const history = new Set(old?.history ?? []);
    if (old && old.path !== p) history.add(old.path);
    history.delete(p);
    for (const h of [...history]) if (current.has(h)) history.delete(h);   // Pfad gehört jetzt einem anderen Eintrag
    out[w.key] = { path: p, history: [...history].sort() };
  }
  // Einträge, die aus den Daten verschwunden sind, behalten ihre Zuordnung (der Pfad wird nicht neu vergeben)
  for (const [id, entry] of Object.entries(previous)) {
    if (out[id] || current.has(entry.path)) continue;
    out[id] = entry;
  }
  return out;
}

function withId(p: string, id: string | number): string {
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
${o.scripts ?? ''}  <script src="pagenav.js"></script>
</body>
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
  return `    <nav class="dss-crumbs" aria-label="Brotkrumen"><ol>${parts.join('')}</ol></nav>`;
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

export interface ClubPageContext { base: string; club: ClubEntry; urlPath: string; cp: ClubPlace; canonicalPath?: string; ligaPaths?: Record<number, string>; teamPaths?: Record<string, string>; hallPaths?: Record<string, string> }

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

  const ligaLink = (t: ClubEntry['teams'][number]): string => {
    if (!t.liganame) return '';
    const lp = t.ligaId != null ? ctx.ligaPaths?.[t.ligaId] : undefined;
    return ` – ${lp ? `<a href="${lp}">${esc(t.liganame)}</a>` : esc(t.liganame)}`;
  };
  const teamItems = teams.map(t => {
    const tp = ctx.teamPaths?.[String(t.teamPermanentId)];
    return `<li>${tp ? `<a href="${tp}">${esc(teamLabel(t))}</a>` : esc(teamLabel(t))}${ligaLink(t)}</li>`;
  }).join('');
  const hallItems = (club.halls ?? []).map(h => {
    const addr = [h.strasse, [h.plz, h.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const hp = h.dbbSpielfeldId ? ctx.hallPaths?.[String(h.dbbSpielfeldId)] : undefined;
    return `<li>${hp ? `<a href="${hp}">${esc(h.bezeichnung)}</a>` : esc(h.bezeichnung)}${addr ? ` – ${esc(addr)}` : ''}</li>`;
  }).join('');

  // Der Inhalt von #verein-content ist die statische Fassung für Suchmaschinen; verein.js ersetzt ihn.
  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(crumbs)}
    <div id="verein-content">
      <h1>${esc(club.name)}</h1>
      ${where ? `<p>${esc(where)}</p>` : ''}
      ${teamItems ? `<h2>Teams (${teams.length})</h2>${card(`<ul class="seo-list">${teamItems}</ul>`)}` : ''}
      ${hallItems ? `<h2>Hallen</h2>${card(`<ul class="seo-list">${hallItems}</ul>`)}` : ''}
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
  <script src="map-tiles.js"></script>
  <script src="favorites.js"></script>
  <script src="report.js"></script>
  <script src="team-logic.js"></script>
  <script src="team-stats.js"></script>
  <script src="verein.js"></script>
`
  });
}

export interface ListGroup { heading?: string; items: ListItem[]; alphabetic?: boolean }

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
  const nav = `      <nav class="seo-alphabet" aria-label="Alphabet"><ul class="dss-tabs dss-tabs--pills">${letters.map(l => `<li><a class="dss-tab" href="${pagePath}#buchstabe-${l === '#' ? 'sonst' : l.toLowerCase()}">${l}</a></li>`).join('')}</ul></nav>`;
  return { nav, groups: letters.map(l => ({ heading: l, id: `buchstabe-${l === '#' ? 'sonst' : l.toLowerCase()}`, items: byLetter.get(l)! })) };
}

export function renderListPage(opts: {
  base: string; pagePath: string; title: string; heading: string; intro: string;
  crumbs: { name: string; path: string }[]; groups: ListGroup[]; extraHtml?: string;
}): string {
  let alphabet = '';
  let source: { heading?: string; id?: string; items: ListItem[] }[] = [];
  for (const g of opts.groups) {
    if (g.alphabetic && g.items.length >= ALPHABET_MIN) {
      const a = alphabetGroups(opts.pagePath, g.items);
      alphabet += a.nav + '\n';
      source.push(...a.groups);
    } else source.push(g);
  }
  const groups = source.map(g => `      ${g.heading ? `<h2${g.id ? ` id="${g.id}"` : ''}>${esc(g.heading)}</h2>` : ''}
      ${card(`<ul class="seo-list">${g.items.map(i => `<li><a href="${i.href}">${esc(i.name)}</a>${i.note ? ` <span class="seo-note">${esc(i.note)}</span>` : ''}</li>`).join('')}</ul>`)}`).join('\n');
  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(opts.crumbs)}
    <div id="verein-content" class="seo-list-page">
      <h1>${esc(opts.heading)}</h1>
      <p>${esc(opts.intro)}</p>
${alphabet}
${groups}
${opts.extraHtml ?? ''}
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


// ---- Ligaseiten --------------------------------------------------------------------------------

export interface LigaDoc {
  ligaId: number; liganame: string; verbandName: string; akName?: string; geschlecht?: string;
  fetchedAt?: string; tabelle: any[]; matches: any[];
  venues?: Record<string, number | string>;                                  // matchId → Hallen-ID (apply-venues)
  halls?: Record<string, { bezeichnung?: string; strasse?: string | null; plz?: string | null; ort?: string | null; lat?: number | null; lng?: number | null }>;
}

const hasContent = (d: LigaDoc): boolean => (d.tabelle?.length ?? 0) > 0 || (d.matches?.length ?? 0) > 0;
export const verbandSlug = (name: string): string => slugify(name) || 'sonstige';
const ligaSlug = (d: LigaDoc): string => slugify(d.liganame.replace(/\s*\([^)]*\)\s*$/, '')) || `liga-${d.ligaId}`;

export function ligaWishes(docs: LigaDoc[]): PathWish[] {
  return docs.filter(hasContent).sort((a, b) => a.ligaId - b.ligaId)
    .map(d => ({ key: String(d.ligaId), desired: `liga/${verbandSlug(d.verbandName)}/${ligaSlug(d)}/` }));
}

export interface TopTeam { rang: number; name: string; clubId?: number }

/** Die ersten drei der Tabelle, aber erst, wenn überhaupt gespielt wurde (am Saisonanfang sind alle 0:0). */
export function top3(d: LigaDoc): TopTeam[] {
  const rows = (d.tabelle ?? []).filter(e => e?.team);
  if (!rows.reduce((n, e) => n + (Number(e.anzspiele) || 0), 0)) return [];
  return rows.slice().sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99)).slice(0, 3)
    .map(e => ({ rang: Number(e.rang), name: String(e.team.teamname ?? ''), clubId: e.team.clubId }));
}
export const top3Text = (d: LigaDoc): string => top3(d).map(t => `${t.rang}. ${t.name}`).join(' · ');

const deDate = (iso?: string): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

interface LigaPageCtx { base: string; doc: LigaDoc; path: string; clubPaths: Record<string, string>; teamPaths?: Record<string, string> }

function teamCell(t: any, clubPaths: Record<string, string>, teamPaths: Record<string, string> = {}): string {
  const name = esc(String(t?.teamname ?? '–'));
  const p = (t?.teamPermanentId != null ? teamPaths[String(t.teamPermanentId)] : undefined)
    ?? (t?.clubId != null ? clubPaths[String(t.clubId)] : undefined);
  return p ? `<a href="${p}">${name}</a>` : name;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Wie TeamLogic.formatKickoff im Browser: "Sa, 12.10.2026 · 18:00". */
export function kickoffText(date?: string, time?: string): string {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!m) return time ?? '';
  const wd = WEEKDAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
  return `${wd}, ${m[3]}.${m[2]}.${m[1]}${time ? ` · ${time}` : ''}`;
}

function scoreText(m: any): string {
  if (m.verzicht) return 'Verzicht';
  if (m.abgesagt) return 'abgesagt';
  return m.result ? esc(String(m.result)) : '–';
}

/** Heim/Auswärts-Kürzel wie auf der Teamseite (team.js haBadge). */
function haChip(mark: 'vs.' | '@'): string {
  const home = mark === 'vs.';
  return `<span class="team-match-ha dss-chip dss-chip--mono ${home ? 'dss-chip--sky' : 'dss-chip--amber'}"><span aria-hidden="true">${mark}</span><span class="dss-sr-only">${home ? 'Heimspiel gegen' : 'Auswärtsspiel bei'}</span></span>`;
}

interface SchedRow { match: any; mark?: 'vs.' | '@'; teams: string; meta?: string[] }

/** Der eine Spielplan: gleiche Zeile (Zeit | Paarung | Ergebnis) auf Liga-, Orts-, Team- und Hallenseiten, wie auf der Teamseite. */
export function scheduleRows(rows: SchedRow[]): string {
  const items = rows.map(r => {
    const meta = (r.meta ?? []).filter(Boolean);
    return `<div class="dss-row dss-row--match"><div class="dss-row-when">${esc(kickoffText(r.match.kickoffDate, r.match.kickoffTime))}</div><div class="dss-row-main">${r.mark ? haChip(r.mark) : ''}<span class="dss-row-teams">${r.teams}</span>${meta.length ? `<span class="dss-row-meta">${meta.join(' · ')}</span>` : ''}</div><div class="dss-row-score">${scoreText(r.match)}</div></div>`;
  });
  return `<div class="dss-rows">${items.join('')}</div>`;
}

const pairing = (m: any, clubPaths: Record<string, string>, teamPaths: Record<string, string> = {}): string =>
  `${teamCell(m.homeTeam, clubPaths, teamPaths)} – ${teamCell(m.guestTeam, clubPaths, teamPaths)}`;

function matchList(matches: any[], clubPaths: Record<string, string>, teamPaths: Record<string, string> = {}): string {
  return scheduleRows(matches.map(m => ({ match: m, teams: pairing(m, clubPaths, teamPaths) })));
}

/** Kartenfläche für Listen und Kopfbereiche (DSS Card). */
const card = (inner: string, cls = ''): string => `<div class="dss-card dss-card--default dss-card--pad-md${cls ? ` ${cls}` : ''}"><div class="dss-card-body">${inner}</div></div>`;

export function renderLigaPage(ctx: LigaPageCtx): string {
  const { base, doc, path: urlPath, clubPaths } = ctx;
  const teamPaths = ctx.teamPaths ?? {};
  const vSlug = verbandSlug(doc.verbandName);
  const crumbs = [
    { name: 'Vereinsregister', path: '' },
    { name: 'Ligen', path: 'liga/' },
    { name: doc.verbandName, path: `liga/${vSlug}/` },
    { name: doc.liganame, path: urlPath }
  ];
  const rows = (doc.tabelle ?? []).filter(e => e?.team).slice().sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99));
  const table = rows.length ? `
      <h2>Tabelle</h2>
      <div class="dss-frame dss-table-scroll" role="region" aria-label="Tabelle ${esc(doc.liganame)}" tabindex="0">
        <table class="dss-tbl">
          <thead><tr><th scope="col" class="center">Platz</th><th scope="col" class="wrap">Mannschaft</th><th scope="col" class="num">Spiele</th><th scope="col" class="num">S</th><th scope="col" class="num">N</th><th scope="col" class="num">Körbe</th><th scope="col" class="num">Diff.</th><th scope="col" class="num">Punkte</th></tr></thead>
          <tbody>${rows.map(e => `<tr><td class="center num lead">${esc(String(e.rang ?? ''))}</td><td class="wrap">${teamCell(e.team, clubPaths, teamPaths)}</td><td class="num">${e.anzspiele ?? 0}</td><td class="num">${e.s ?? 0}</td><td class="num">${e.n ?? 0}</td><td class="num">${e.koerbe ?? 0}:${e.gegenKoerbe ?? 0}</td><td class="num">${e.korbdiff ?? 0}</td><td class="num lead">${e.anzGewinnpunkte ?? 0}:${e.anzVerlustpunkte ?? 0}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : '';

  const played = (doc.matches ?? []).filter(m => m.result && !m.abgesagt);
  const upcoming = (doc.matches ?? []).filter(m => !m.result && !m.abgesagt && !m.verzicht && m.kickoffDate)
    .sort((a, b) => `${a.kickoffDate} ${a.kickoffTime ?? ''}`.localeCompare(`${b.kickoffDate} ${b.kickoffTime ?? ''}`)).slice(0, 10);
  const recent = played.sort((a, b) => `${b.kickoffDate} ${b.kickoffTime ?? ''}`.localeCompare(`${a.kickoffDate} ${a.kickoffTime ?? ''}`)).slice(0, 10);

  const tile = (value: number, label: string): string => `<div class="dss-stat"><div class="dss-stat-value">${value}</div><div class="dss-stat-label">${label}</div></div>`;
  const all = (doc.matches ?? []).filter(m => !m.abgesagt && !m.verzicht);
  const stats = rows.length || all.length
    ? `\n      <div class="seo-stats">${tile(rows.length, 'Teams')}${tile(all.filter(m => m.result).length, 'Spiele gespielt')}${tile(all.filter(m => !m.result).length, 'Spiele offen')}</div>`
    : '';

  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(crumbs)}
    <div id="verein-content" class="seo-list-page">
      <h1>${esc(doc.liganame)}</h1>
      <p>${esc(doc.verbandName)}${doc.fetchedAt ? ` · Stand: ${esc(deDate(doc.fetchedAt))}` : ''}</p>${stats}${table}
      ${upcoming.length ? `<h2>Nächste Spiele</h2>${matchList(upcoming, clubPaths, teamPaths)}` : ''}
      ${recent.length ? `<h2>Letzte Ergebnisse</h2>${matchList(recent, clubPaths, teamPaths)}` : ''}
      ${!rows.length && !upcoming.length && !recent.length ? '<p class="dss-empty">Für diese Liga liegen noch keine Daten vor.</p>' : ''}
    </div>
  </main>`;

  const t3 = top3Text(doc);
  return shell({
    title: `${doc.liganame} – Tabelle und Spielplan | Basketball Vereinsregister`,
    description: `Tabelle, Spielplan und Ergebnisse: ${doc.liganame} (${doc.verbandName}).${t3 ? ` Aktuell: ${t3}.` : ''}`,
    pagePath: urlPath,
    base,
    styles: ['style.css', 'verein.css', 'seo.css'],
    head: breadcrumbLd(base, crumbs),
    body
  });
}

export interface LigaBuild {
  files: Map<string, string>;
  map: UrlMap;
  sitemap: string[];
  paths: Record<number, string>;                 // ligaId → Pfad
  byVerband: Map<string, { name: string; docs: LigaDoc[] }>;
  docs: Map<number, LigaDoc>;
}

export function buildLigaPages(docs: LigaDoc[], previous: UrlMap, base: string, clubPaths: Record<string, string>, teamPaths: Record<string, string> = {}): LigaBuild {
  const map = assignKeyed(ligaWishes(docs), previous);
  const files = new Map<string, string>();
  const sitemap: string[] = [];
  const paths: Record<number, string> = {};
  const byVerband = new Map<string, { name: string; docs: LigaDoc[] }>();
  const byId = new Map<number, LigaDoc>();

  for (const doc of docs.filter(hasContent)) {
    const entry = map[String(doc.ligaId)];
    paths[doc.ligaId] = entry.path;
    byId.set(doc.ligaId, doc);
    const v = byVerband.get(verbandSlug(doc.verbandName)) ?? { name: doc.verbandName, docs: [] };
    v.docs.push(doc);
    byVerband.set(verbandSlug(doc.verbandName), v);
    files.set(`${entry.path}index.html`, renderLigaPage({ base, doc, path: entry.path, clubPaths, teamPaths }));
    sitemap.push(entry.path);
    for (const old of entry.history) files.set(`${old}index.html`, renderRedirect(base, old, entry.path));
  }

  const ligaItem = (d: LigaDoc): ListItem => ({ name: d.liganame, href: paths[d.ligaId], note: top3Text(d) || undefined });
  const verbaende = [...byVerband.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'));
  for (const [slug, v] of verbaende) {
    const groups = new Map<string, LigaDoc[]>();
    for (const d of v.docs) {
      const key = [d.akName, d.geschlecht].filter(Boolean).join(' · ') || 'Weitere Ligen';
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    const pagePath = `liga/${slug}/`;
    files.set(`${pagePath}index.html`, renderListPage({
      base, pagePath,
      title: `Basketball-Ligen: ${v.name}`,
      heading: `Ligen: ${v.name}`,
      intro: `${v.docs.length} Basketball-Ligen im Bereich ${v.name} mit Tabelle, Spielplan und Ergebnissen.`,
      crumbs: [{ name: 'Vereinsregister', path: '' }, { name: 'Ligen', path: 'liga/' }, { name: v.name, path: pagePath }],
      groups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
        .map(([heading, ds]) => ({ heading, items: ds.sort((a, b) => a.liganame.localeCompare(b.liganame, 'de')).map(ligaItem) }))
    }));
    sitemap.push(pagePath);
  }
  files.set('liga/index.html', renderListPage({
    base, pagePath: 'liga/',
    title: 'Basketball-Ligen in Deutschland',
    heading: 'Basketball-Ligen in Deutschland',
    intro: `${byId.size} Ligen aus dem Spielbetrieb des DBB und seiner Landesverbände, mit Tabellen, Spielplänen und Ergebnissen.`,
    crumbs: [{ name: 'Vereinsregister', path: '' }, { name: 'Ligen', path: 'liga/' }],
    groups: [{ items: verbaende.map(([slug, v]) => ({ name: v.name, href: `liga/${slug}/`, note: `${v.docs.length} Ligen` })) }]
  }));
  sitemap.push('liga/');
  return { files, map, sitemap, paths, byVerband, docs: byId };
}

// ---- Lokalderbys -------------------------------------------------------------------------------

/** Ebene einer Liga: 0 Bundesligen, 1 Regionalliga, 2 Verband, 3 Bezirk, 4 Kreis (niedriger = höher). */
export function ligaLevel(doc: LigaDoc, ebene?: string): number {
  const v = doc.verbandName ?? '';
  if (/bundesliga|bundesligen|deutsche meisterschaft/i.test(v)) return 0;
  if (/^regionalliga/i.test(v)) return 1;
  if (/rollstuhl/i.test(v)) return 2;
  return ({ Verband: 2, Bezirk: 3, Kreis: 4 } as Record<string, number>)[ebene ?? ''] ?? 3;
}

export interface Derby { doc: LigaDoc; match: any; level: number }

/**
 * Spiele zweier verschiedener Vereine desselben Ortes. Berücksichtigt werden nur die beiden höchsten Ebenen,
 * in denen der Ort überhaupt Derbys hat (ein Kreisliga-Derby neben einem Regionalliga-Derby zählt nicht).
 */
export function localDerbies(
  docs: Iterable<LigaDoc>, placeKeyOf: (clubId: unknown) => string | null, slugOf: (clubId: unknown) => string | null,
  levelOf: (doc: LigaDoc) => number
): Map<string, Derby[]> {
  const perPlace = new Map<string, Derby[]>();
  for (const doc of docs) {
    const level = levelOf(doc);
    for (const m of doc.matches ?? []) {
      const h = m?.homeTeam?.clubId, g = m?.guestTeam?.clubId;
      if (h == null || g == null || h === g) continue;
      const pk = placeKeyOf(h);
      if (!pk || pk.endsWith(`/${NO_PLACE.slug}/`) || pk !== placeKeyOf(g)) continue;
      if (slugOf(h) === slugOf(g)) continue;                  // derselbe Verein unter zwei Vereins-IDs
      perPlace.set(pk, [...(perPlace.get(pk) ?? []), { doc, match: m, level }]);
    }
  }
  for (const [pk, list] of perPlace) {
    const levels = [...new Set(list.map(d => d.level))].sort((a, b) => a - b).slice(0, 2);
    perPlace.set(pk, list.filter(d => levels.includes(d.level)));
  }
  return perPlace;
}

export function renderDerbies(derbies: Derby[], today: string, clubPaths: Record<string, string>, ligaPaths: Record<number, string>, placeName: string): string {
  const key = (m: any) => `${m.kickoffDate ?? ''} ${m.kickoffTime ?? ''}`;
  const open = derbies.filter(d => !d.match.result && !d.match.abgesagt && !d.match.verzicht && d.match.kickoffDate && d.match.kickoffDate >= today)
    .sort((a, b) => key(a.match).localeCompare(key(b.match)) || a.level - b.level).slice(0, 10);
  const done = derbies.filter(d => d.match.result && !d.match.abgesagt)
    .sort((a, b) => key(b.match).localeCompare(key(a.match)) || a.level - b.level).slice(0, 5);
  if (!open.length && !done.length) return '';
  const list = (ds: Derby[]): string => scheduleRows(ds.map(d => {
    const lp = ligaPaths[d.doc.ligaId];
    return { match: d.match, teams: pairing(d.match, clubPaths), meta: [lp ? `<a href="${lp}">${esc(d.doc.liganame)}</a>` : esc(d.doc.liganame)] };
  }));
  return `      <h2>Lokalderbys in ${esc(placeName)}</h2>
      <p>Spiele zweier Vereine aus ${esc(placeName)} in den höchsten Ligen des Ortes.</p>
${open.length ? `      <h3>Nächste Derbys</h3>${list(open)}\n` : ''}${done.length ? `      <h3>Letzte Derbys</h3>${list(done)}\n` : ''}`;
}

// ---- Teamseiten --------------------------------------------------------------------------------

type ClubTeam = ClubEntry['teams'][number];
export interface TeamRef { club: ClubEntry; team: ClubTeam; clubPath: string }

export function teamSlug(t: ClubTeam): string {
  return slugify(teamLabel(t)) || 'team';
}

/** Teams, die in den Live-Daten vorkommen: teamPermanentId → Ligen. */
export function teamLigen(docs: Iterable<LigaDoc>): Map<number, LigaDoc[]> {
  const out = new Map<number, LigaDoc[]>();
  const add = (id: unknown, doc: LigaDoc) => {
    const n = Number(id);
    if (!n) return;
    const list = out.get(n) ?? [];
    if (!list.includes(doc)) list.push(doc);
    out.set(n, list);
  };
  for (const doc of docs) {
    for (const e of doc.tabelle ?? []) add(e?.team?.teamPermanentId, doc);
    for (const m of doc.matches ?? []) { add(m?.homeTeam?.teamPermanentId, doc); add(m?.guestTeam?.teamPermanentId, doc); }
  }
  return out;
}

/** Pfadwünsche der Teams: Pfad des Vereins + Teamname; ein Team kommt nur einmal vor (erste Vereinsseite gewinnt). */
export function teamWishes(refs: TeamRef[]): PathWish[] {
  const seen = new Set<number>();
  const wishes: PathWish[] = [];
  for (const r of [...refs].sort((a, b) => a.team.teamPermanentId - b.team.teamPermanentId || a.club.clubId - b.club.clubId)) {
    if (seen.has(r.team.teamPermanentId)) continue;
    seen.add(r.team.teamPermanentId);
    wishes.push({ key: String(r.team.teamPermanentId), desired: `${r.clubPath}${teamSlug(r.team)}/` });
  }
  return wishes;
}

const sameTeam = (t: any, id: number): boolean => t != null && Number(t.teamPermanentId) === id;
const involves = (m: any, id: number): boolean => sameTeam(m?.homeTeam, id) || sameTeam(m?.guestTeam, id);

export function primaryLiga(docs: LigaDoc[], id: number): LigaDoc | null {
  return docs.find(d => (d.tabelle ?? []).some(e => sameTeam(e?.team, id)))
    ?? docs.find(d => (d.matches ?? []).some(m => involves(m, id)))
    ?? docs[0] ?? null;
}

interface TeamPageCtx {
  base: string; ref: TeamRef; path: string; docs: LigaDoc[];
  clubPaths: Record<string, string>; ligaPaths: Record<number, string>; teamPaths: Record<string, string>;
  today: string; cp: ClubPlace; clubUrl: string;
}

function hallOf(doc: LigaDoc, m: any): { bezeichnung: string; strasse?: string; plz?: string; ort?: string } | null {
  const hallId = (doc as any).venues?.[String(m.matchId)];
  return hallId != null ? (doc as any).halls?.[String(hallId)] ?? null : null;
}

export function renderTeamPage(ctx: TeamPageCtx): string {
  const { base, ref, path: urlPath, docs, clubPaths, ligaPaths, teamPaths, today, cp } = ctx;
  const id = ref.team.teamPermanentId;
  const doc = primaryLiga(docs, id);
  const entry = doc ? (doc.tabelle ?? []).find(e => sameTeam(e?.team, id)) : undefined;
  const any = entry?.team ?? doc?.matches.map(m => (sameTeam(m?.homeTeam, id) ? m.homeTeam : sameTeam(m?.guestTeam, id) ? m.guestTeam : null)).find(Boolean);
  const name = String(any?.teamname ?? ref.club.name);
  const label = teamLabel(ref.team);

  const mine = (doc?.matches ?? []).filter(m => involves(m, id));
  const key = (m: any) => `${m.kickoffDate ?? ''} ${m.kickoffTime ?? ''}`;
  const upcoming = mine.filter(m => !m.result && !m.abgesagt && !m.verzicht && m.kickoffDate && m.kickoffDate >= today).sort((a, b) => key(a).localeCompare(key(b))).slice(0, 5);
  const recent = mine.filter(m => m.result && !m.abgesagt).sort((a, b) => key(b).localeCompare(key(a))).slice(0, 5);

  const schedule = (list: any[], withHall: boolean): string => scheduleRows(list.map(m => {
    const home = sameTeam(m.homeTeam, id);
    const hall = withHall && doc ? hallOf(doc, m) : null;
    return { match: m, mark: home ? 'vs.' : '@', teams: teamCell(home ? m.guestTeam : m.homeTeam, clubPaths, teamPaths), meta: hall ? [esc([hall.bezeichnung, hall.ort].filter(Boolean).join(', '))] : [] };
  }));

  const crumbs = [
    { name: 'Vereinsregister', path: '' },
    { name: cp.state.name, path: `${cp.state.slug}/` },
    ...(cp.place === NO_PLACE ? [] : [{ name: cp.place.name, path: `${cp.state.slug}/${cp.place.slug}/` }]),
    { name: ref.club.name, path: ref.clubPath },
    { name: label, path: urlPath }
  ];

  const standing = entry ? `Platz ${entry.rang} (${entry.anzspiele ?? 0} Spiele, ${entry.s ?? 0} Siege, ${entry.n ?? 0} Niederlagen)` : '';
  const ligaLine = doc ? `<a href="${ligaPaths[doc.ligaId] ?? ''}">${esc(doc.liganame)}</a>` : '';
  const others = docs.filter(d => d !== doc && ligaPaths[d.ligaId]);

  const next = upcoming[0];
  const description = [
    `${name} (${label})${doc ? ` – ${doc.liganame}` : ''}.`,
    standing ? `${standing.split(' (')[0]} in der Tabelle.` : '',
    next ? `Nächstes Spiel: ${deDate(next.kickoffDate)} ${sameTeam(next.homeTeam, id) ? 'gegen' : 'bei'} ${(sameTeam(next.homeTeam, id) ? next.guestTeam : next.homeTeam)?.teamname ?? ''}.` : 'Tabelle, Spielplan und Ergebnisse.'
  ].filter(Boolean).join(' ');

  const team: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'SportsTeam', name, sport: 'Basketball', url: `${base}/${urlPath}`,
    parentOrganization: { '@type': 'SportsOrganization', name: ref.club.name, url: `${base}/${ref.clubPath}` }
  };
  if (doc) team.memberOf = { '@type': 'SportsOrganization', name: doc.liganame, url: ligaPaths[doc.ligaId] ? `${base}/${ligaPaths[doc.ligaId]}` : undefined };
  // Nur Spiele mit bestätigter Halle: Suchmaschinen verlangen einen Ort
  const events = doc ? upcoming.map(m => ({ m, hall: hallOf(doc, m) })).filter(x => x.hall).slice(0, 3).map(({ m, hall }) => ({
    '@context': 'https://schema.org', '@type': 'SportsEvent', sport: 'Basketball',
    name: `${m.homeTeam?.teamname} – ${m.guestTeam?.teamname}`,
    startDate: `${m.kickoffDate}${m.kickoffTime ? `T${m.kickoffTime}:00` : ''}`,
    homeTeam: { '@type': 'SportsTeam', name: m.homeTeam?.teamname }, awayTeam: { '@type': 'SportsTeam', name: m.guestTeam?.teamname },
    location: { '@type': 'Place', name: hall!.bezeichnung, address: { '@type': 'PostalAddress', ...(hall!.strasse ? { streetAddress: hall!.strasse } : {}), ...(hall!.plz ? { postalCode: hall!.plz } : {}), ...(hall!.ort ? { addressLocality: hall!.ort } : {}), addressCountry: 'DE' } }
  })) : [];

  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(crumbs)}
    <div id="team-content" class="seo-list-page">
      <h1>${esc(name)}</h1>
      <p>${esc(label)}${ligaLine ? ` · ${ligaLine}` : ''} · <a href="${ref.clubPath}">${esc(ref.club.name)}</a>${standing ? ` · ${esc(standing)}` : ''}</p>
      ${upcoming.length ? `<h2>Nächste Spiele</h2>${schedule(upcoming, true)}` : ''}
      ${recent.length ? `<h2>Letzte Ergebnisse</h2>${schedule(recent, false)}` : ''}
      ${others.length ? `<h2>Weitere Wettbewerbe</h2>${card(`<ul class="seo-list">${others.map(d => `<li><a href="${ligaPaths[d.ligaId]}">${esc(d.liganame)}</a></li>`).join('')}</ul>`)}` : ''}
      <noscript><p>Tabelle und Spielplan werden mit JavaScript geladen.</p></noscript>
    </div>
  </main>`;

  return shell({
    title: `${name} – ${label}${doc ? `, ${doc.liganame}` : ''} | Basketball Vereinsregister`,
    description,
    pagePath: urlPath,
    base,
    styles: ['style.css', 'verein.css', 'team.css', 'seo.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
    head: `  <meta name="team-id" content="${id}">\n  <script type="application/ld+json">${jsonLd(team)}</script>\n${events.map(e => `  <script type="application/ld+json">${jsonLd(e)}</script>\n`).join('')}${breadcrumbLd(base, crumbs)}`,
    body,
    scripts: `  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script src="map-tiles.js"></script>
  <script src="favorites.js"></script>
  <script src="report.js"></script>
  <script src="team-logic.js"></script>
  <script src="team-stats.js"></script>
  <script src="team.js"></script>
`
  });
}

// ---- Hallenseiten ------------------------------------------------------------------------------

export interface HallGame { doc: LigaDoc; match: any }
export interface HallRec {
  id: string;                       // Spielfeld-ID (dbbSpielfeldId bzw. matchInfo spielfeld)
  name: string; strasse?: string; plz?: string; ort?: string; lat?: number; lng?: number;
  precision?: 'adresse' | 'ort';    // Genauigkeit der Koordinate (hall-coords.json); Koordinaten aus clubs.json gelten als genau
  clubIds: Set<number>;             // Vereine, bei denen die Halle gemeldet ist (clubs.json)
  games: HallGame[];                // Spiele mit gemeldeter Halle aus matchInfo
}

const clean = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined);

/** Hallen aus clubs.json und matchInfo, über die Spielfeld-ID zusammengeführt; Spiele pro Halle gezählt. */
export function collectHalls(clubs: ClubEntry[], docs: LigaDoc[], geocoded: Record<string, { lat: number; lng: number; precision?: 'adresse' | 'ort' }> = {}): Map<string, HallRec> {
  const out = new Map<string, HallRec>();
  const clubXY = new Map<number, { lat: number; lng: number }>();
  for (const c of clubs) if (typeof c.lat === 'number' && typeof c.lng === 'number') clubXY.set(c.clubId, { lat: c.lat, lng: c.lng });
  const get = (id: string): HallRec => {
    let h = out.get(id);
    if (!h) { h = { id, name: '', clubIds: new Set(), games: [] }; out.set(id, h); }
    return h;
  };
  const fill = (h: HallRec, src: { bezeichnung?: unknown; strasse?: unknown; plz?: unknown; ort?: unknown; lat?: unknown; lng?: unknown }): void => {
    h.name = h.name || clean(src.bezeichnung) || '';
    h.strasse = h.strasse ?? clean(src.strasse);
    h.plz = h.plz ?? clean(src.plz);
    h.ort = h.ort ?? clean(src.ort);
    if (h.lat === undefined && typeof src.lat === 'number' && typeof src.lng === 'number') { h.lat = src.lat; h.lng = src.lng; }
  };
  for (const c of clubs) {
    for (const hall of c.halls ?? []) {
      if (!hall.dbbSpielfeldId) continue;
      const h = get(String(hall.dbbSpielfeldId));
      fill(h, hall);
      h.clubIds.add(c.clubId);
    }
  }
  for (const doc of docs) {
    for (const m of doc.matches ?? []) {
      const hallId = doc.venues?.[String(m.matchId)];
      if (hallId == null) continue;
      const rec = doc.halls?.[String(hallId)];
      const h = get(String(hallId));
      if (rec) fill(h, rec);
      h.games.push({ doc, match: m });
    }
  }
  for (const [id, h] of out) {
    if (!h.name || !h.ort || (!h.clubIds.size && !h.games.length)) { out.delete(id); continue; }
    const g = geocoded[id];
    if (h.lat !== undefined) h.precision = 'adresse';
    else if (g && typeof g.lat === 'number' && typeof g.lng === 'number') { h.lat = g.lat; h.lng = g.lng; h.precision = g.precision ?? 'adresse'; }
    else {
      // Ohne eigene Koordinate: die (geprüfte) Ortsposition eines Vereins, der die Halle meldet, nur als ungefähre Lage
      const anchor = [...h.clubIds].map(cid => clubXY.get(cid)).find(Boolean);
      if (anchor) { h.lat = anchor.lat; h.lng = anchor.lng; h.precision = 'ort'; }
    }
  }
  return out;
}

/** Land der Halle: häufigstes Land der Vereine, die sie melden, sonst der gastgebenden Vereine ("weitere", wenn unbekannt). */
export function hallState(h: HallRec, clubById: Map<number, ClubEntry>): { slug: string; name: string } {
  const votes = new Map<string, { slug: string; name: string; n: number }>();
  const vote = (c: ClubEntry | undefined): void => {
    if (!c) return;
    const st = placeOf(c).state;
    const v = votes.get(st.slug) ?? { ...st, n: 0 };
    v.n++;
    votes.set(st.slug, v);
  };
  h.clubIds.forEach(id => vote(clubById.get(id)));
  if (!votes.size) h.games.forEach(g => vote(clubById.get(Number(g.match.homeTeam?.clubId))));
  const best = [...votes.values()].sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug))[0];
  return best ? { slug: best.slug, name: best.name } : { slug: NO_PLACE.slug, name: NO_PLACE.name };
}

export function hallWishes(halls: Map<string, HallRec>, clubById: Map<number, ClubEntry>, known: Set<string>): PathWish[] {
  return [...halls.values()].sort((a, b) => Number(a.id) - Number(b.id)).map(h => {
    const st = hallState(h, clubById);
    const place = slugify(mainPlace(h.ort!, known)) || NO_PLACE.slug;
    return { key: h.id, desired: `halle/${st.slug}/${place}/${slugify(h.name) || `halle-${h.id}`}/` };
  });
}

const hallAddress = (h: HallRec): string => [h.strasse, [h.plz, h.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');

interface HallPageCtx {
  base: string; hall: HallRec; path: string; today: string;
  clubById: Map<number, ClubEntry>; clubPaths: Record<string, string>; teamPaths: Record<string, string>; ligaPaths: Record<number, string>;
  state: { slug: string; name: string }; placePage?: { name: string; path: string };
}

export function renderHallPage(ctx: HallPageCtx): string {
  const { base, hall, path: urlPath, today, clubById, clubPaths, teamPaths, ligaPaths } = ctx;
  const addr = hallAddress(hall);
  const crumbs = [
    { name: 'Vereinsregister', path: '' },
    ...(ctx.state.slug !== NO_PLACE.slug ? [{ name: ctx.state.name, path: `${ctx.state.slug}/` }] : []),
    ...(ctx.placePage ? [{ name: ctx.placePage.name, path: ctx.placePage.path }] : []),
    { name: hall.name, path: urlPath }
  ];

  const key = (m: any): string => `${m.kickoffDate ?? ''} ${m.kickoffTime ?? ''}`;
  const games = hall.games.filter(g => !g.match.abgesagt && !g.match.verzicht);
  const played = games.filter(g => g.match.result).length;
  const upcoming = games.filter(g => !g.match.result && g.match.kickoffDate && g.match.kickoffDate >= today)
    .sort((a, b) => key(a.match).localeCompare(key(b.match)));

  // Vereine: gemeldet in clubs.json und/oder Gastgeber von Spielen hier, mit Zahl der Heimspiele
  const hosts = new Map<number, number>();
  for (const g of games) {
    const id = Number(g.match.homeTeam?.clubId);
    if (id) hosts.set(id, (hosts.get(id) ?? 0) + 1);
  }
  const clubIds = new Set<number>([...hall.clubIds, ...hosts.keys()]);
  const clubRows = [...clubIds].map(id => ({ id, club: clubById.get(id), n: hosts.get(id) ?? 0 }))
    .filter(r => r.club)
    .sort((a, b) => b.n - a.n || a.club!.name.localeCompare(b.club!.name, 'de'));
  const clubItems = clubRows.map(r => {
    const p = clubPaths[String(r.id)];
    const name = p ? `<a href="${p}">${esc(r.club!.name)}</a>` : esc(r.club!.name);
    return `<li>${name}${r.n ? ` <span class="seo-note">${r.n} ${r.n === 1 ? 'Heimspiel' : 'Heimspiele'} hier</span>` : ''}</li>`;
  }).join('');

  const matchRows = scheduleRows(upcoming.slice(0, 10).map(({ doc, match: m }) => {
    const lp = ligaPaths[doc.ligaId];
    return { match: m, teams: pairing(m, clubPaths, teamPaths), meta: [lp ? `<a href="${lp}">${esc(doc.liganame)}</a>` : esc(doc.liganame)] };
  }));

  const exact = hall.lat !== undefined && hall.precision !== 'ort';
  const osm = exact
    ? `https://www.openstreetmap.org/?mlat=${hall.lat}&mlon=${hall.lng}#map=17/${hall.lat}/${hall.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(addr)}`;
  const report = Report.url({ kind: 'hall', id: hall.id, name: hall.name, page: `${base}/${urlPath}` });

  const counter = games.length
    ? `In dieser Saison sind bisher ${games.length} ${games.length === 1 ? 'Spiel' : 'Spiele'} mit dieser Halle gemeldet: ${played} gespielt, ${upcoming.length} anstehend.`
    : 'Für diese Halle ist noch kein Spiel gemeldet. Die Spielorte werden nach und nach aus den Spielinformationen übernommen.';

  const body = `${topbar()}
  <main class="verein-main">
${crumbNav(crumbs)}
    <div id="verein-content" class="seo-list-page">
      <h1>${esc(hall.name)}</h1>
      ${card(`<address>${esc(addr)}</address>
      ${hall.lat !== undefined ? `<div id="hall-map" class="hall-map" role="region" aria-label="Karte: ${esc(hall.name)}" data-lat="${hall.lat}" data-lng="${hall.lng}" data-zoom="${exact ? 16 : 13}" data-name="${esc(hall.name)}"></div>
      ${exact ? '' : '<p class="seo-note">Die Position ist nur ungefähr, die genaue Lage ist noch nicht erfasst.</p>'}` : ''}
      <p><a class="seo-block-link dss-link" href="${esc(osm)}" target="_blank" rel="noopener">Auf OpenStreetMap ${exact ? 'ansehen' : 'suchen'}<span class="dss-sr-only"> (öffnet in einem neuen Tab)</span></a></p>`)}
      <h2>Spiele in dieser Halle</h2>
      <p>${esc(counter)}</p>
      ${upcoming.length ? `<h3>Nächste Spiele</h3>${matchRows}` : ''}
      ${clubItems ? `<h2>Vereine in dieser Halle</h2>${card(`<ul class="seo-list">${clubItems}</ul>`)}` : ''}
      <p class="report-row">Stimmt etwas nicht? <a class="report-link dss-link" href="${esc(report)}" target="_blank" rel="noopener">Fehler melden<span class="dss-sr-only"> (öffnet GitHub in einem neuen Tab)</span></a></p>
    </div>
  </main>`;

  const place: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'SportsActivityLocation', name: hall.name, url: `${base}/${urlPath}`,
    address: { '@type': 'PostalAddress', ...(hall.strasse ? { streetAddress: hall.strasse } : {}), ...(hall.plz ? { postalCode: hall.plz } : {}), addressLocality: hall.ort, addressCountry: 'DE' }
  };
  if (exact) place.geo = { '@type': 'GeoCoordinates', latitude: hall.lat, longitude: hall.lng };

  return shell({
    title: `${hall.name}, ${hall.ort} – Basketball | Basketball Vereinsregister`,
    description: `${hall.name}, ${addr}: Basketball-Spielstätte. ${games.length ? `${games.length} Spiele gemeldet, ` : ''}${clubRows.length ? `${clubRows.length} ${clubRows.length === 1 ? 'Verein' : 'Vereine'}.` : 'Vereine und Spiele.'}`.replace(/, \./, '.'),
    pagePath: urlPath,
    base,
    styles: hall.lat !== undefined ? ['style.css', 'verein.css', 'seo.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'] : ['style.css', 'verein.css', 'seo.css'],
    head: `  <script type="application/ld+json">${jsonLd(place)}</script>\n${breadcrumbLd(base, crumbs)}`,
    body,
    scripts: hall.lat !== undefined ? `  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>\n  <script src="map-tiles.js"></script>\n  <script src="hall.js"></script>\n` : undefined
  });
}

/** Kennzahlen eines Landes für die Startseite: Vereine, Teams mit Liga, Orte, Ligen und Hallen. */
export interface RegionInfo { state: string; slug: string; clubs: number; teams: number; orte: number; ligen: number; hallen: number }

export interface SiteBuild { files: Map<string, string>; urlMap: UrlMap; ligaMap: UrlMap; teamMap: UrlMap; hallMap: UrlMap; regions: RegionInfo[]; hasLiga: boolean; hasHalls: boolean }

export function buildSite(
  clubs: ClubEntry[], previous: UrlMap, base: string, lastmod: string,
  liga: { docs: LigaDoc[]; previous?: UrlMap; previousTeams?: UrlMap; previousHalls?: UrlMap; hallCoords?: Record<string, { lat: number; lng: number; precision?: 'adresse' | 'ort' }> } = { docs: [] }
): SiteBuild {
  const urlMap = assignPaths(clubs, previous);
  const clubPaths: Record<string, string> = Object.fromEntries(Object.entries(urlMap).map(([id, e]) => [id, e.path]));

  // Teamseiten: nur Teams mit Live-Daten, nur auf Hauptseiten (nicht auf Dubletten-Vereinsseiten)
  const isDuplicate = (club: ClubEntry): boolean => {
    const p = urlMap[String(club.clubId)].path;
    const main = p.replace(new RegExp(`-${club.clubId}/$`), '/');
    return main !== p && Object.values(urlMap).some(e => e.path === main);
  };
  const ligenOfTeam = teamLigen(liga.docs.filter(hasContent));
  const refs: TeamRef[] = [];
  for (const club of clubs) {
    if (isDuplicate(club)) continue;
    for (const team of club.teams ?? []) {
      if (team.teamPermanentId && ligenOfTeam.has(team.teamPermanentId)) refs.push({ club, team, clubPath: urlMap[String(club.clubId)].path });
    }
  }
  const wishes = teamWishes(refs);
  const teamMap = assignKeyed(wishes, liga.previousTeams ?? {});
  const teamPaths: Record<string, string> = Object.fromEntries(wishes.map(w => [w.key, teamMap[w.key].path]));
  const lb = buildLigaPages(liga.docs, liga.previous ?? {}, base, clubPaths, teamPaths);

  // Hallen: Spielfeld-ID → Seite, aus clubs.json und den Spielorten der Live-Daten
  const clubById = new Map(clubs.map(c => [c.clubId, c]));
  const knownPlaces = knownOrte(clubs);
  const halls = collectHalls(clubs, liga.docs.filter(hasContent), liga.hallCoords ?? {});
  const hallMap = assignKeyed(hallWishes(halls, clubById, knownPlaces), liga.previousHalls ?? {});
  const hallPaths: Record<string, string> = Object.fromEntries([...halls.keys()].map(id => [id, hallMap[id].path]));
  const hallsByPlace = new Map<string, HallRec[]>();
  for (const h of halls.values()) {
    const key = hallMap[h.id].path.split('/').slice(1, 3).join('/') + '/';      // <land>/<ort>/
    hallsByPlace.set(key, [...(hallsByPlace.get(key) ?? []), h]);
  }
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
    files.set(`${entry.path}index.html`, renderClubPage({ base, club, urlPath: entry.path, cp, canonicalPath, ligaPaths: lb.paths, teamPaths, hallPaths }));
    if (!canonicalPath) sitemapPaths.push(entry.path);
    for (const old of entry.history) files.set(`${old}index.html`, renderRedirect(base, old, entry.path));
  }

  // Ligen je Ort: in welchen Ligen spielen Vereine dieses Ortes, und auf welchem Platz
  const placeLigen = new Map<string, Map<number, string[]>>();
  const placeKeyOfClub = (clubId: unknown): string | null => {
    const p = clubPaths[String(clubId)];
    return p ? p.split('/').slice(0, 2).join('/') + '/' : null;
  };
  for (const doc of lb.docs.values()) {
    for (const e of doc.tabelle ?? []) {
      const key = e?.team ? placeKeyOfClub(e.team.clubId) : null;
      if (!key) continue;
      const perLiga = placeLigen.get(key) ?? new Map<number, string[]>();
      placeLigen.set(key, perLiga);
      perLiga.set(doc.ligaId, [...(perLiga.get(doc.ligaId) ?? []), `${e.team.teamname}: Platz ${e.rang}`]);
    }
  }

  const ebeneByLiga = new Map<number, Map<string, number>>();
  for (const c of clubs) for (const t of c.teams ?? []) {
    if (t.ligaId == null || !t.ebene) continue;
    const m = ebeneByLiga.get(t.ligaId) ?? new Map<string, number>();
    m.set(t.ebene, (m.get(t.ebene) ?? 0) + 1);
    ebeneByLiga.set(t.ligaId, m);
  }
  const ebeneOf = (id: number): string | undefined => [...(ebeneByLiga.get(id) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  const slugById = new Map(clubs.map(c => [String(c.clubId), clubSlug(c.name)]));
  const derbies = localDerbies(lb.docs.values(), placeKeyOfClub, id => slugById.get(String(id)) ?? null, d => ligaLevel(d, ebeneOf(d.ligaId)));

  const placeLigaGroup = (placeKey: string, placeName: string): ListGroup[] => {
    const perLiga = placeLigen.get(placeKey);
    if (!perLiga || !perLiga.size) return [];
    const items = [...perLiga.entries()]
      .map(([id, notes]) => ({ doc: lb.docs.get(id)!, notes }))
      .sort((a, b) => a.doc.liganame.localeCompare(b.doc.liganame, 'de'))
      .map(({ doc, notes }) => ({ name: doc.liganame, href: lb.paths[doc.ligaId], note: notes.join(' · ') }));
    return [{ heading: `Ligen in ${placeName}`, items }];
  };
  const placeHallGroup = (placeKey: string, placeName: string): ListGroup[] => {
    const list = hallsByPlace.get(placeKey);
    if (!list || !list.length) return [];
    const items = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(h => ({
      name: h.name, href: hallPaths[h.id],
      note: [hallAddress(h), h.games.length ? `${h.games.length} ${h.games.length === 1 ? 'Spiel' : 'Spiele'} gemeldet` : ''].filter(Boolean).join(' · ')
    }));
    return [{ heading: `Hallen in ${placeName}`, items }];
  };
  const stateLigaGroup = (stateSlug: string, stateName: string): ListGroup[] => {
    const v = lb.byVerband.get(stateSlug);
    if (!v) return [];
    const senior = v.docs.filter(d => /senioren/i.test(d.akName ?? '')).sort((a, b) => a.liganame.localeCompare(b.liganame, 'de'));
    const items: ListItem[] = [
      { name: `Alle ${v.docs.length} Ligen in ${stateName}`, href: `liga/${stateSlug}/` },
      ...senior.map(d => ({ name: d.liganame, href: lb.paths[d.ligaId], note: top3Text(d) || undefined }))
    ];
    return [{ heading: `Ligen in ${stateName}`, items }];
  };

  const hallenByState = new Map<string, number>();
  for (const [key, list] of hallsByPlace) hallenByState.set(key.split('/')[0], (hallenByState.get(key.split('/')[0]) ?? 0) + list.length);
  const regions: SiteBuild['regions'] = [];
  const sortedStates = [...states.entries()].sort((a, b) => a[1].state.name.localeCompare(b[1].state.name, 'de'));
  for (const [stateSlug, sg] of sortedStates) {
    const places = [...sg.places.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'));
    const total = places.reduce((n, [, p]) => n + p.clubs.length, 0);
    const teams = places.reduce((n, [, p]) => n + p.clubs.reduce((m, { club }) => m + (club.teams ?? []).filter(t => t.ligaId != null).length, 0), 0);
    regions.push({ state: sg.state.name, slug: stateSlug, clubs: total, teams, orte: places.length, ligen: lb.byVerband.get(stateSlug)?.docs.length ?? 0, hallen: hallenByState.get(stateSlug) ?? 0 });

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
        groups: [
          { items, alphabetic: true },
          ...placeLigaGroup(`${stateSlug}/${placeSlug}/`, pg.name),
          ...placeHallGroup(`${stateSlug}/${placeSlug}/`, pg.name)
        ],
        extraHtml: renderDerbies(derbies.get(`${stateSlug}/${placeSlug}/`) ?? [], lastmod, clubPaths, lb.paths, pg.name)
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
      groups: [
        { alphabetic: true, items: places.map(([slug, p]) => ({ name: p.name, href: `${stateSlug}/${slug}/`, note: `${p.clubs.length} ${p.clubs.length === 1 ? 'Verein' : 'Vereine'}` })) },
        ...stateLigaGroup(stateSlug, sg.state.name)
      ]
    }));
    sitemapPaths.push(pagePath);
  }

  const placeOfClub = new Map(clubs.map(c => [c.clubId, placeOf(c, known)]));
  // Ein Team gehört zur Vereinsseite mit der kleinsten Vereins-ID (wie in teamWishes)
  const owners = new Map<number, TeamRef>();
  for (const r of [...refs].sort((x, y) => x.club.clubId - y.club.clubId)) if (!owners.has(r.team.teamPermanentId)) owners.set(r.team.teamPermanentId, r);
  for (const r of owners.values()) {
    const entry = teamMap[String(r.team.teamPermanentId)];
    files.set(`${entry.path}index.html`, renderTeamPage({
      base, ref: r, path: entry.path, docs: ligenOfTeam.get(r.team.teamPermanentId)!, clubPaths, ligaPaths: lb.paths, teamPaths,
      today: lastmod, cp: placeOfClub.get(r.club.clubId)!, clubUrl: r.clubPath
    }));
    sitemapPaths.push(entry.path);
    for (const old of entry.history) files.set(`${old}index.html`, renderRedirect(base, old, entry.path));
  }
  for (const h of halls.values()) {
    const entry = hallMap[h.id];
    const [, stateSlug, placeSlug] = entry.path.split('/');
    const sg = states.get(stateSlug);
    const pg = sg?.places.get(placeSlug);
    files.set(`${entry.path}index.html`, renderHallPage({
      base, hall: h, path: entry.path, today: lastmod, clubById, clubPaths, teamPaths, ligaPaths: lb.paths,
      state: hallState(h, clubById), placePage: pg ? { name: pg.name, path: `${stateSlug}/${placeSlug}/` } : undefined
    }));
    sitemapPaths.push(entry.path);
    for (const old of entry.history) files.set(`${old}index.html`, renderRedirect(base, old, entry.path));
  }
  // Übersichten der Hallen: /halle/ → Land → Ort (die Hallenseiten selbst liegen darunter)
  if (halls.size) {
    const hubBase = [{ name: 'Vereinsregister', path: '' }, { name: 'Hallen', path: 'halle/' }];
    const byState = new Map<string, Map<string, HallRec[]>>();
    for (const [key, list] of hallsByPlace) {
      const [stateSlug, placeSlug] = key.split('/');
      const places = byState.get(stateSlug) ?? new Map<string, HallRec[]>();
      places.set(placeSlug, list);
      byState.set(stateSlug, places);
    }
    const nHallen = (n: number): string => `${n} ${n === 1 ? 'Halle' : 'Hallen'}`;
    const stateName = (slug: string): string => states.get(slug)?.state.name ?? (slug === NO_PLACE.slug ? NO_PLACE.name : hallState(byState.get(slug)!.values().next().value![0], clubById).name);
    const placeName = (stateSlug: string, placeSlug: string, list: HallRec[]): string => states.get(stateSlug)?.places.get(placeSlug)?.name || mainPlace(list[0].ort ?? '') || placeSlug;
    const stateItems: ListItem[] = [];
    for (const [stateSlug, places] of [...byState].sort((a, b) => stateName(a[0]).localeCompare(stateName(b[0]), 'de'))) {
      const total = [...places.values()].reduce((n, l) => n + l.length, 0);
      const sName = stateName(stateSlug);
      stateItems.push({ name: sName, href: `halle/${stateSlug}/`, note: nHallen(total) });
      const placeItems: ListItem[] = [];
      for (const [placeSlug, list] of [...places].sort((a, b) => placeName(stateSlug, a[0], a[1]).localeCompare(placeName(stateSlug, b[0], b[1]), 'de'))) {
        const pName = placeName(stateSlug, placeSlug, list);
        placeItems.push({ name: pName, href: `halle/${stateSlug}/${placeSlug}/`, note: nHallen(list.length) });
        const pagePath = `halle/${stateSlug}/${placeSlug}/`;
        files.set(`${pagePath}index.html`, renderListPage({
          base, pagePath, title: `Basketballhallen in ${pName} (${sName})`, heading: `Basketballhallen in ${pName}`,
          intro: `${nHallen(list.length)} in ${pName}, ${sName}, mit Adresse, Spielen und den Vereinen, die dort spielen.`,
          crumbs: [...hubBase, { name: sName, path: `halle/${stateSlug}/` }, { name: pName, path: pagePath }],
          groups: [{ items: list.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(h => ({ name: h.name, href: hallPaths[h.id], note: [hallAddress(h), h.games.length ? `${h.games.length} ${h.games.length === 1 ? 'Spiel' : 'Spiele'} gemeldet` : ''].filter(Boolean).join(' · ') })) }]
        }));
        sitemapPaths.push(pagePath);
      }
      const statePath = `halle/${stateSlug}/`;
      files.set(`${statePath}index.html`, renderListPage({
        base, pagePath: statePath, title: `Basketballhallen in ${sName}`, heading: `Basketballhallen in ${sName}`,
        intro: `${nHallen(total)} in ${sName}, nach Orten sortiert.`,
        crumbs: [...hubBase, { name: sName, path: statePath }],
        groups: [{ alphabetic: true, items: placeItems }]
      }));
      sitemapPaths.push(statePath);
    }
    const total = [...hallsByPlace.values()].reduce((n, l) => n + l.length, 0);
    files.set('halle/index.html', renderListPage({
      base, pagePath: 'halle/', title: 'Basketballhallen in Deutschland', heading: 'Basketballhallen in Deutschland',
      intro: `${nHallen(total)} in ${stateItems.length} ${stateItems.length === 1 ? 'Bundesland' : 'Bundesländern'}, mit Adresse, Karte und den Spielen, die dort stattfinden.`,
      crumbs: hubBase, groups: [{ items: stateItems }]
    }));
    sitemapPaths.push('halle/');
  }
  for (const [rel, content] of lb.files) files.set(rel, content);
  sitemapPaths.push(...lb.sitemap);
  files.set('sitemap.xml', renderSitemap(base, sitemapPaths, lastmod));
  files.set('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  return { files, urlMap, ligaMap: lb.map, teamMap, hallMap, regions, hasLiga: lb.docs.size > 0, hasHalls: halls.size > 0 };
}

const de = (n: number): string => n.toLocaleString('de-DE');

/**
 * Ersetzt in der Startseite den Platzhalter durch die Regionen als zweispaltige Karten (Vereine, Teams, Ligen, Hallen;
 * die ganze Karte ist der Link) und trägt ein, welche Übersichten es gibt (data-hubs, für die Top-Karten).
 */
export function injectRegionLinks(indexHtml: string, regions: SiteBuild['regions'], withLiga = false, withHalls = false): string {
  const tile = (value: number, label: string): string => `<div class="dss-stat dss-stat--compact"><div class="dss-stat-value">${de(value)}</div><div class="dss-stat-label">${label}</div></div>`;
  const cards = regions.map(r => {
    const tiles = [tile(r.clubs, r.clubs === 1 ? 'Verein' : 'Vereine'), r.teams ? tile(r.teams, r.teams === 1 ? 'Team' : 'Teams') : '', r.ligen ? tile(r.ligen, r.ligen === 1 ? 'Liga' : 'Ligen') : '', r.hallen ? tile(r.hallen, r.hallen === 1 ? 'Halle' : 'Hallen') : ''].join('');
    return `<li class="region-card dss-card dss-card--hoverable${r.state.length > 24 ? ' region-card--wide' : ''}"><a class="region-link" href="${r.slug}/">${esc(r.state)}</a><div class="dss-stats dss-stats--compact">${tiles}</div></li>`;
  }).join('');
  const more = (withLiga ? '<li><a class="dss-link" href="liga/">Alle Ligen mit Tabellen</a></li>' : '') + (withHalls ? '<li><a class="dss-link" href="halle/">Alle Hallen</a></li>' : '');
  const hubs = [withLiga ? 'liga' : '', withHalls ? 'halle' : ''].filter(Boolean).join(' ');
  return indexHtml
    .replace('<!--REGION-LINKS-->', `<ul class="region-cards">${cards}</ul>${more ? `\n      <ul class="region-more">${more}</ul>` : ''}`)
    .replace('<div id="stats-bar"></div>', `<div id="stats-bar" data-hubs="${hubs}"></div>`);
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

/** Liga-Dokumente des Live-Crawls (<dir>/liga/<id>.json); ohne Live-Daten entstehen keine Ligaseiten. */
export function loadLigen(liveDir: string): LigaDoc[] {
  const dir = path.join(liveDir, 'liga');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as LigaDoc)
    .filter(d => d && typeof d.ligaId === 'number' && typeof d.liganame === 'string');
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
  const liveDir = arg('live') ?? path.join(site, 'data', 'live');
  const ligaMapFile = store ? path.join(store, 'liga-map.json') : null;
  const previousLiga: UrlMap = ligaMapFile && fs.existsSync(ligaMapFile) ? JSON.parse(fs.readFileSync(ligaMapFile, 'utf-8')) : {};
  const teamMapFile = store ? path.join(store, 'team-map.json') : null;
  const previousTeams: UrlMap = teamMapFile && fs.existsSync(teamMapFile) ? JSON.parse(fs.readFileSync(teamMapFile, 'utf-8')) : {};
  const coordsFile = arg('coords');
  let hallCoords: Record<string, any> = {};
  try { if (coordsFile) hallCoords = JSON.parse(fs.readFileSync(coordsFile, 'utf-8')).coords ?? {}; } catch { /* ohne Koordinaten */ }
  const hallMapFile = store ? path.join(store, 'hall-map.json') : null;
  const previousHalls: UrlMap = hallMapFile && fs.existsSync(hallMapFile) ? JSON.parse(fs.readFileSync(hallMapFile, 'utf-8')) : {};
  const build = buildSite(clubs, previous, base, new Date().toISOString().slice(0, 10), { docs: loadLigen(liveDir), previous: previousLiga, previousTeams, previousHalls, hallCoords });
  writeAll(site, build.files);

  fs.mkdirSync(path.join(site, 'data'), { recursive: true });
  const publicMap = Object.fromEntries(Object.entries(build.urlMap).map(([id, e]) => [id, e.path]));
  fs.writeFileSync(path.join(site, 'data', 'url-map.json'), JSON.stringify(publicMap), 'utf-8');

  const indexFile = path.join(site, 'index.html');
  if (fs.existsSync(indexFile)) fs.writeFileSync(indexFile, injectRegionLinks(fs.readFileSync(indexFile, 'utf-8'), build.regions, build.hasLiga, build.hasHalls), 'utf-8');

  fs.writeFileSync(path.join(site, 'data', 'team-url-map.json'),
    JSON.stringify(Object.fromEntries(Object.entries(build.teamMap).map(([id, e]) => [id, e.path]))), 'utf-8');
  fs.writeFileSync(path.join(site, 'data', 'hall-url-map.json'),
    JSON.stringify(Object.fromEntries(Object.entries(build.hallMap).map(([id, e]) => [id, e.path]))), 'utf-8');
  if (hallMapFile) {
    fs.mkdirSync(store!, { recursive: true });
    fs.writeFileSync(hallMapFile, JSON.stringify(build.hallMap, null, 1) + '\n', 'utf-8');
  }
  if (teamMapFile && build.hasLiga) {
    fs.mkdirSync(store!, { recursive: true });
    fs.writeFileSync(teamMapFile, JSON.stringify(build.teamMap, null, 1) + '\n', 'utf-8');
  }
  if (ligaMapFile && build.hasLiga) {
    fs.mkdirSync(store!, { recursive: true });
    fs.writeFileSync(ligaMapFile, JSON.stringify(build.ligaMap, null, 1) + '\n', 'utf-8');
  }
  if (mapFile) {
    fs.mkdirSync(store!, { recursive: true });
    fs.writeFileSync(mapFile, JSON.stringify(build.urlMap, null, 1) + '\n', 'utf-8');
  }
  const moved = Object.values(build.urlMap).filter(e => e.history.length).length;
  console.log(`SEO: ${clubs.length} Vereinsseiten, ${build.regions.length} Regionen, ${moved} umgezogen, ${build.files.size} Dateien → ${site}`);
}

if (require.main === module) main();
