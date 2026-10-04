const LIVE_BASE = 'data/live/';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const LOGO_BASE = 'https://www.basketball-bund.net/media/team/';

/** Teamlogo von basketball-bund.net; fehlt es, erscheint ein Kürzel. Dekorativ (der Name steht daneben). */
function logoEl(teamId, name, size) {
  const wrap = el('span', 'team-logo team-logo--' + (size || 'sm'));
  wrap.setAttribute('aria-hidden', 'true');
  const fallback = () => { wrap.textContent = ''; wrap.classList.add('team-logo--empty'); wrap.appendChild(document.createTextNode(TeamLogic.initials(name))); };
  if (teamId == null) { fallback(); return wrap; }
  const img = document.createElement('img');
  img.src = LOGO_BASE + encodeURIComponent(teamId) + '/logo';
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', fallback);
  wrap.appendChild(img);
  return wrap;
}

// Adresslisten der statischen Seiten (data/team-url-map.json, data/url-map.json); beide sind optional
let teamUrlMap = null;
let clubUrlMap = null;
let hallUrlMap = null;

async function loadUrlMaps() {
  const get = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  [teamUrlMap, clubUrlMap, hallUrlMap] = await Promise.all([get('data/team-url-map.json'), get('data/url-map.json'), get('data/hall-url-map.json')]);
}

function teamLink(teamId, ligaId, text) {
  const a = el('a', null, text);
  a.href = TeamLogic.teamHref(teamUrlMap, teamId, ligaId);
  return a;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' nicht ladbar (' + res.status + ')');
  return res.json();
}

function message(text) {
  const content = document.getElementById('team-content');
  content.textContent = '';
  content.appendChild(el('div', 'verein-error dss-empty', text));
}

function todayIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function stat(value, label) {
  const box = el('div', 'team-stat dss-stat');
  const v = el('div', 'team-stat-value dss-stat-value');
  if (value instanceof Node) v.appendChild(value); else v.textContent = value;
  box.appendChild(v);
  box.appendChild(el('div', 'team-stat-label dss-stat-label', label));
  return box;
}

function formChips(outcomes) {
  const wrap = el('span', 'team-form');
  if (!outcomes.length) { wrap.textContent = '–'; return wrap; }
  outcomes.forEach(o => wrap.appendChild(el('span', 'team-chip team-chip-' + o, o)));
  return wrap;
}

function renderStats(doc, teamId, list) {
  const standing = TeamLogic.standingFor(doc.tabelle, teamId);
  const rec = TeamLogic.record(list);
  const grid = el('div', 'team-stats');
  grid.appendChild(stat(standing ? standing.rang + '.' : '–', 'Tabellenplatz'));
  grid.appendChild(stat(rec.played ? rec.wins + ' – ' + rec.losses : '–', 'Bilanz (S – N)'));
  if (rec.played) {
    const diff = rec.pointsFor - rec.pointsAgainst;
    grid.appendChild(stat((diff > 0 ? '+' : '') + diff, 'Korbdifferenz'));
  }
  grid.appendChild(stat(formChips(TeamLogic.form(list, 5)), 'Form (letzte 5)'));
  return grid;
}

function mapsQuery(venue) {
  return encodeURIComponent([venue.bezeichnung, venue.strasse, [venue.plz, venue.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '));
}

function renderVenue(venue, isHome, confirmed) {
  const box = el('div', 'next-game-venue');
  const info = el('div', 'next-game-venue-info');
  info.appendChild(el('div', 'next-game-venue-label', confirmed ? 'Spielort' : (isHome ? 'Heimspiel in' : 'Spielort (Halle des Gastgebers)')));
  const nameEl = el('div', 'next-game-venue-name');
  const hallPath = hallUrlMap && venue.id ? hallUrlMap[String(venue.id)] : null;
  if (hallPath) {
    const a = el('a', null, venue.bezeichnung);
    a.href = hallPath;
    nameEl.appendChild(a);
  } else {
    nameEl.textContent = venue.bezeichnung;
  }
  info.appendChild(nameEl);
  const addr = [venue.strasse, [venue.plz, venue.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr) info.appendChild(el('div', 'next-game-venue-addr', addr));
  if (!confirmed) info.appendChild(el('div', 'next-game-venue-note', 'Voraussichtlich – die genaue Halle steht in der offiziellen Ansetzung.'));
  const links = el('div', 'next-game-nav');
  [['Route in Google Maps', 'https://www.google.com/maps/dir/?api=1&destination='], ['Route in Apple Karten', 'https://maps.apple.com/?daddr=']].forEach(([label, base]) => {
    const a = el('a', 'dss-btn dss-btn--secondary dss-btn--sm', label);
    a.href = base + mapsQuery(venue);
    a.target = '_blank';
    a.rel = 'noopener';
    links.appendChild(a);
  });
  info.appendChild(links);
  box.appendChild(info);
  return box;
}

function initVenueMap(mapEl, venue) {
  if (typeof L === 'undefined') { mapEl.remove(); return; }
  const map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([venue.lat, venue.lng], 15);
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark ? 'dark_all' : 'light_all') + '/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    maxZoom: 19
  }).addTo(map);
  const icon = L.divIcon({ className: '', html: '<div class="dss-map-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  L.marker([venue.lat, venue.lng], { icon, title: venue.bezeichnung, alt: venue.bezeichnung }).addTo(map);
}

/** Heim/Auswärts als farbiges Kürzel: "vs." (blau) bei Heimspielen, "@" (gelb) bei Auswärtsspielen; Farbe und Zeichen ergänzen sich. */
function haBadge(isHome) {
  const b = el('span', 'team-match-ha dss-chip dss-chip--mono ' + (isHome ? 'dss-chip--sky team-match-ha--home' : 'dss-chip--amber team-match-ha--away'));
  const sym = el('span', null, isHome ? 'vs.' : '@');
  sym.setAttribute('aria-hidden', 'true');
  b.appendChild(sym);
  b.appendChild(el('span', 'dss-sr-only', isHome ? 'Heimspiel gegen' : 'Auswärtsspiel bei'));
  return b;
}

function renderNext(list, doc, ownClubId, hallIndex) {
  const next = TeamLogic.nextMatch(list, todayIso());
  const section = el('section', 'next-game dss-card dss-card--default');
  section.appendChild(el('h2', 'next-game-title team-section-title', 'Nächstes Spiel'));
  if (!next) {
    if (!list.length) return null;
    section.appendChild(el('div', 'team-empty dss-empty', 'Aktuell sind keine weiteren Spiele geplant.'));
    return section;
  }

  const m = next.match;
  const matchup = el('div', 'next-game-matchup');
  const side = (team, cls) => {
    const box = el('div', 'next-game-team ' + cls);
    box.appendChild(logoEl(team && team.teamPermanentId, team && team.teamname, 'lg'));
    const name = el('div', 'next-game-team-name');
    if (team && next.opponent && team.teamPermanentId === next.opponent.teamPermanentId) {
      name.appendChild(teamLink(team.teamPermanentId, doc.ligaId, team.teamname));
    } else {
      name.textContent = team ? team.teamname : '?';
    }
    box.appendChild(name);
    return box;
  };
  matchup.appendChild(side(m.homeTeam, 'next-game-team--home'));
  const mid = el('div', 'next-game-vs');
  mid.appendChild(el('div', 'next-game-vs-label', 'vs.'));
  const when = TeamLogic.formatKickoff(m.kickoffDate, m.kickoffTime).split(' · ');
  mid.appendChild(el('div', 'next-game-kickoff', when[0]));
  if (when[1]) mid.appendChild(el('div', 'next-game-kickoff-time', when[1] + ' Uhr'));
  mid.appendChild(el('div', 'next-game-ha ' + (next.isHome ? 'next-game-ha--home' : 'next-game-ha--away'), next.isHome ? 'Heimspiel' : 'Auswärtsspiel'));
  matchup.appendChild(mid);
  matchup.appendChild(side(m.guestTeam, 'next-game-team--guest'));
  section.appendChild(matchup);

  if (doc.liganame) section.appendChild(el('div', 'next-game-competition', doc.liganame));

  const found = TeamLogic.venueForMatch(doc, next, ownClubId, hallIndex);
  const venue = found && found.venue;
  if (venue) {
    section.appendChild(renderVenue(venue, next.isHome, found.confirmed));
    if (typeof venue.lat === 'number' && typeof venue.lng === 'number') {
      const mapEl = el('div', 'next-game-map');
      mapEl.setAttribute('role', 'region');
      mapEl.setAttribute('aria-label', 'Karte: ' + venue.bezeichnung);
      section.appendChild(mapEl);
      setTimeout(() => initVenueMap(mapEl, venue), 0);
    }
  }
  return section;
}

function renderTable(doc, teamId) {
  const rows = doc.tabelle || [];
  const section = el('div');
  section.appendChild(el('div', 'team-section-title', 'Tabelle'));
  if (!rows.length) {
    section.appendChild(el('div', 'team-empty dss-empty', 'Für diesen Wettbewerb gibt es (noch) keine Tabelle.'));
    return section;
  }
  const wrap = el('div', 'team-table-wrap dss-frame dss-table-scroll');
  const table = el('table', 'team-table dss-tbl');
  const head = el('tr');
  ['#', 'Team', 'Sp', 'S', 'N', 'Körbe', 'Diff', 'Pkt'].forEach((h, i) => head.appendChild(el('th', i === 0 ? 'center' : i >= 2 ? 'num' : null, h)));
  const thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach(r => {
    const tr = el('tr', String(r.team.teamPermanentId) === String(teamId) ? 'team-own is-own' : '');
    tr.appendChild(el('td', 'center num lead', String(r.rang)));
    const nameCell = el('td');
    const nameWrap = el('span', 'team-name-cell');
    nameWrap.appendChild(logoEl(r.team.teamPermanentId, r.team.teamname, 'xs'));
    nameWrap.appendChild(teamLink(r.team.teamPermanentId, doc.ligaId, r.team.teamname));
    nameCell.appendChild(nameWrap);
    tr.appendChild(nameCell);
    tr.appendChild(el('td', 'num', String(r.anzspiele)));
    tr.appendChild(el('td', 'num', String(r.s)));
    tr.appendChild(el('td', 'num', String(r.n)));
    tr.appendChild(el('td', 'num', r.koerbe + ':' + r.gegenKoerbe));
    tr.appendChild(el('td', 'num', (r.korbdiff > 0 ? '+' : '') + r.korbdiff));
    tr.appendChild(el('td', 'num lead', String(r.anzGewinnpunkte)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return section;
}

function matchRow(d, ligaId) {
  const row = el('div', 'team-match dss-row dss-row--match' + (d.played ? ' team-match-past' : ''));
  row.appendChild(el('div', 'team-match-when dss-row-when', TeamLogic.formatKickoff(d.match.kickoffDate, d.match.kickoffTime)));

  const teams = el('div', 'team-match-teams dss-row-main');
  teams.appendChild(haBadge(d.isHome));
  if (d.opponent) teams.appendChild(logoEl(d.opponent.teamPermanentId, d.opponent.teamname, 'xs'));
  teams.appendChild(d.opponent ? teamLink(d.opponent.teamPermanentId, ligaId, d.opponent.teamname) : document.createTextNode('?'));
  row.appendChild(teams);

  const res = el('div', 'team-match-result dss-row-score');
  if (d.status === 'cancelled') {
    res.textContent = 'abgesagt';
  } else if (d.status === 'forfeit') {
    res.textContent = 'Verzicht';
  } else if (d.played) {
    const home = d.isHome ? d.own : d.opp;
    const guest = d.isHome ? d.opp : d.own;
    res.appendChild(el('span', 'team-chip team-chip-' + d.outcome, d.outcome));
    res.appendChild(document.createTextNode(' ' + home + ':' + guest));
    if (d.status === 'provisional') res.appendChild(el('span', 'team-match-note', 'vorläufig'));
  } else {
    res.textContent = '–';
  }
  row.appendChild(res);
  return row;
}

function renderSchedule(list, ligaId) {
  const section = el('div');
  section.appendChild(el('div', 'team-section-title', 'Spielplan'));
  if (!list.length) {
    section.appendChild(el('div', 'team-empty dss-empty', 'Keine Spiele gefunden.'));
    return section;
  }
  const tabs = el('div', 'team-tabs dss-tabs dss-tabs--segmented dss-tabs--md');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Spiele filtern');
  const matches = el('div', 'team-matches dss-rows');
  const filters = [['Alle', () => true], ['Heim', d => d.isHome], ['Auswärts', d => !d.isHome]];
  function show(i) {
    matches.textContent = '';
    list.filter(filters[i][1]).forEach(d => matches.appendChild(matchRow(d, ligaId)));
    Array.from(tabs.children).forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  filters.forEach((f, i) => {
    const b = el('button', 'team-liga-btn dss-tab', f[0]);
    b.type = 'button';
    b.onclick = () => show(i);
    tabs.appendChild(b);
  });
  section.appendChild(tabs);
  section.appendChild(matches);
  show(0);
  return section;
}

function renderLiga(docs, doc, teamId, container, hallIndex) {
  const list = TeamLogic.teamMatches(doc.matches, teamId);
  container.textContent = '';
  container.appendChild(renderStats(doc, teamId, list));
  const next = renderNext(list, doc, TeamLogic.clubIdOf(doc, teamId), hallIndex);
  if (next) container.appendChild(next);
  container.appendChild(renderTable(doc, teamId));
  container.appendChild(renderSchedule(list, doc.ligaId));
  container.appendChild(el('div', 'team-updated', 'Stand: ' + new Date(doc.fetchedAt).toLocaleString('de-DE') + ' · wird alle 6 Stunden aktualisiert'));
  const report = window.Report ? Report.link({ kind: 'team', id: teamId, name: TeamLogic.teamName(doc, teamId) || 'Team ' + teamId }) : null;
  if (report) {
    const row = el('p', 'report-row', 'Stimmt etwas nicht? ');
    row.appendChild(report);
    container.appendChild(row);
  }
}

const CAL_VARIANTS = [
  { suffix: '', label: 'Alle Spiele', note: 'Alle Spiele des Teams, auch Pokal und Turniere.' },
  { suffix: '-heim', label: 'Nur Heimspiele', note: 'Nur die Spiele, die das Team zuhause austrägt (vs.).' },
  { suffix: '-auswaerts', label: 'Nur Auswärtsspiele', note: 'Nur die Spiele, die das Team auswärts austrägt (@).' }
];

/** Kalender-Abo: Auswahl Alle / Heim / Auswärts, Buttons für iPhone/Mac und Android, Link, Datei und eine kurze Erklärung. */
function calendarBlock(teamId) {
  const box = el('section', 'team-cal');
  box.setAttribute('aria-labelledby', 'team-cal-title');
  box.appendChild(el('h2', 'team-section-title', 'Spielplan im Kalender'));
  box.firstChild.id = 'team-cal-title';
  box.appendChild(el('p', 'team-cal-intro', 'Neue Spiele, Verlegungen und Absagen erscheinen automatisch in deiner Kalender-App, mit Halle, sobald sie gemeldet ist.'));

  const tabs = el('div', 'team-tabs dss-tabs dss-tabs--segmented dss-tabs--md');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Welche Spiele abonnieren?');
  box.appendChild(tabs);
  const note = el('p', 'team-cal-note');
  note.setAttribute('aria-live', 'polite');
  box.appendChild(note);

  const actions = el('div', 'team-cal-actions');
  const apple = el('a', 'team-cal-link dss-btn dss-btn--secondary dss-btn--sm', 'iPhone / Mac');
  const android = el('a', 'team-cal-link dss-btn dss-btn--secondary dss-btn--sm', 'Android (Google Kalender)');
  const file = el('a', 'team-cal-link dss-btn dss-btn--ghost dss-btn--sm', 'Als Datei (.ics)');
  actions.appendChild(apple);
  actions.appendChild(android);
  let copy = null;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    copy = el('button', 'team-cal-link dss-btn dss-btn--ghost dss-btn--sm', 'Link kopieren');
    copy.type = 'button';
    actions.appendChild(copy);
  }
  actions.appendChild(file);
  box.appendChild(actions);

  let current = CAL_VARIANTS[0];
  function show(i) {
    current = CAL_VARIANTS[i];
    const url = new URL('ics/' + encodeURIComponent(teamId) + current.suffix + '.ics', document.baseURI);
    const webcal = 'webcal://' + url.host + url.pathname;
    apple.href = webcal;
    android.href = 'https://www.google.com/calendar/render?cid=' + encodeURIComponent(webcal);
    android.target = '_blank';
    android.rel = 'noopener';
    file.href = url.href;
    file.setAttribute('download', teamId + current.suffix + '.ics');
    note.textContent = current.note;
    Array.from(tabs.children).forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  CAL_VARIANTS.forEach((v, i) => {
    const b = el('button', 'team-liga-btn dss-tab', v.label);
    b.type = 'button';
    b.onclick = () => show(i);
    tabs.appendChild(b);
  });
  if (copy) {
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(file.href).then(() => {
        copy.textContent = 'Link kopiert';
        setTimeout(() => { copy.textContent = 'Link kopieren'; }, 2000);
      }).catch(() => {});
    });
  }
  show(0);

  const help = el('details', 'team-cal-help');
  help.appendChild(el('summary', null, 'Wie funktioniert das Abo?'));
  const dl = el('dl');
  [
    ['iPhone, iPad und Mac', 'Tippe auf „iPhone / Mac“. Die Kalender-App öffnet sich und fragt, ob du den Kalender abonnieren möchtest. Danach aktualisiert sie sich selbst.'],
    ['Android und Google Kalender', 'Tippe auf „Android“. Google Kalender öffnet sich im Browser, dort bestätigst du das Abo einmalig. Danach erscheint es in der Google-Kalender-App auf allen deinen Geräten. Google lädt Abos nur etwa alle 12 bis 24 Stunden neu, Änderungen kommen also mit etwas Verzögerung.'],
    ['Outlook', 'Tippe auf „Link kopieren“ und füge die Adresse in Outlook ein: Kalender hinzufügen → Aus dem Internet abonnieren.'],
    ['Andere Apps', 'Lade die Datei „.ics“ herunter und importiere sie. Das ist eine einmalige Kopie ohne automatische Aktualisierung.']
  ].forEach(([t, d]) => { dl.appendChild(el('dt', null, t)); dl.appendChild(el('dd', null, d)); });
  help.appendChild(dl);
  box.appendChild(help);
  return box;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  // Statische Teamseiten (/<land>/<ort>/<verein>/<team>/) tragen die ID im Head, alte Adressen in der Query
  const meta = document.querySelector('meta[name="team-id"]');
  const isStatic = !!meta;
  const teamId = params.get('id') || (meta && meta.getAttribute('content'));
  const wantedLiga = params.get('liga');
  if (!teamId) { message('Keine Team-ID angegeben.'); return; }

  await loadUrlMaps();
  if (!isStatic && teamUrlMap && teamUrlMap[String(teamId)]) {
    location.replace(TeamLogic.teamHref(teamUrlMap, teamId, wantedLiga));
    return;
  }

  let index;
  try {
    index = await fetchJson(LIVE_BASE + 'team-index.json');
  } catch (e) {
    message('Live-Daten sind derzeit nicht verfügbar.');
    return;
  }
  const ligaIds = index[String(teamId)];
  if (!ligaIds || !ligaIds.length) { message('Für dieses Team liegen keine Live-Daten vor.'); return; }

  // Hallenindex ist optional: ohne ihn entfällt nur der Spielort
  let hallIndex = null;
  try { hallIndex = await fetchJson(LIVE_BASE + 'hall-index.json'); } catch (e) { /* kein Spielort */ }

  let docs;
  try {
    docs = await Promise.all(ligaIds.map(id => fetchJson(LIVE_BASE + 'liga/' + id + '.json')));
  } catch (e) {
    message('Ligadaten konnten nicht geladen werden.');
    return;
  }

  let current = docs.find(d => String(d.ligaId) === String(wantedLiga)) || TeamLogic.pickPrimaryLiga(docs, teamId);
  const name = TeamLogic.teamName(current, teamId) || 'Team ' + teamId;
  const clubId = TeamLogic.clubIdOf(current, teamId);
  document.title = name + ' — Basketball Vereinsregister';

  const content = document.getElementById('team-content');
  content.textContent = '';
  const head = el('div', 'team-head');
  head.appendChild(logoEl(teamId, name, 'xl'));
  head.appendChild(el('h1', 'team-title', name));
  const favBtn = window.Favorites ? Favorites.button('team', { id: teamId, name: name, clubId: clubId }) : null;
  if (favBtn) head.appendChild(favBtn);
  content.appendChild(head);

  const sub = el('div', 'team-sub');
  if (clubId != null) {
    const back = document.getElementById('back-link');
    if (back) { back.href = (clubUrlMap && clubUrlMap[String(clubId)]) || 'verein.html?id=' + encodeURIComponent(clubId); back.lastChild.textContent = ' Zum Verein'; }
  }
  const ligaLabel = el('span', null);
  sub.appendChild(ligaLabel);
  content.appendChild(sub);
  content.appendChild(calendarBlock(teamId));

  const body = el('div');
  if (docs.length > 1) {
    const switcher = el('div', 'team-ligas dss-tabs dss-tabs--pills');
    docs.forEach(d => {
      const b = el('button', 'team-liga-btn dss-tab', d.liganame);
      b.type = 'button';
      b.onclick = () => { current = d; select(); };
      b.dataset.liga = d.ligaId;
      switcher.appendChild(b);
    });
    content.appendChild(switcher);
  }
  content.appendChild(body);

  function select() {
    ligaLabel.textContent = current.liganame + ' · ' + current.verbandName;
    document.querySelectorAll('.team-liga-btn[data-liga]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.liga === String(current.ligaId))));
    if (!isStatic) history.replaceState(null, '', '?id=' + encodeURIComponent(teamId) + '&liga=' + encodeURIComponent(current.ligaId));
    renderLiga(docs, current, teamId, body, hallIndex);
  }
  select();
}

document.addEventListener('DOMContentLoaded', init);
