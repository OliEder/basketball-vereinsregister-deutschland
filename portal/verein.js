const CLUBS_JSON = 'data/clubs.json';
const LIVE_BASE = 'data/live/';

// Live-Daten (Tabellen/Spielpläne) werden vom Deploy-Workflow alle 6 Stunden erzeugt.
let teamIndexPromise = null;
const ligaCache = new Map();
let teamUrlMap = null;
let hallUrlMap = null;   // data/hall-url-map.json: Spielfeld-ID → Hallenseite (optional)   // data/team-url-map.json: Adressen der statischen Teamseiten (optional)
let hallCoords = null;   // data/hall-coords.json: Spielfeld-ID → [lat, lng], nur genaue Adressen (optional)

function loadTeamIndex() {
  if (!teamIndexPromise) {
    teamIndexPromise = fetch(LIVE_BASE + 'team-index.json').then(r => {
      if (!r.ok) throw new Error('team-index nicht ladbar');
      return r.json();
    });
  }
  return teamIndexPromise;
}

function loadLiga(ligaId) {
  if (!ligaCache.has(ligaId)) {
    ligaCache.set(ligaId, fetch(LIVE_BASE + 'liga/' + ligaId + '.json').then(r => {
      if (!r.ok) throw new Error('Liga nicht ladbar');
      return r.json();
    }));
  }
  return ligaCache.get(ligaId);
}

function getClubIdFromUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get('id');
  if (fromQuery) return fromQuery;
  // Statische Vereinsseiten (/<bundesland>/<ort>/<verein>/) tragen die ID im Head
  const meta = document.querySelector('meta[name="club-id"]');
  return meta ? meta.getAttribute('content') : null;
}

// Alte Adresse verein.html?id=… → auf die statische Seite umleiten (falls bekannt)
async function redirectToStaticPage(clubId) {
  if (document.querySelector('meta[name="club-id"]')) return false;
  try {
    const res = await fetch('data/url-map.json');
    if (!res.ok) return false;
    const target = (await res.json())[String(clubId)];
    if (!target) return false;
    location.replace(target);
    return true;
  } catch (e) {
    return false;
  }
}

function getTeamLabel(team, allTeams) {
  const ak = team.altersklasse || '';
  const g = team.geschlecht || '';
  const num = team.teamNumber || 1;
  let base;
  if (ak.toLowerCase() === 'senioren') {
    base = g === 'weiblich' ? 'Frauen' : g === 'männlich' ? 'Herren' : ak;
  } else {
    base = ak + (g ? ' (' + g + ')' : '');
  }
  return num > 1 ? base + ' ' + num : base;
}

function akSortKey(ak) {
  const order = ['Senioren','U22','U20','U19','U18','U17','U16','U15','U14','U13','U12','U11','U10','Mini'];
  const i = order.indexOf(ak);
  return i === -1 ? 99 : i;
}

function showError(msg, { showReload = false } = {}) {
  const content = document.getElementById('verein-content');
  content.textContent = '';
  const err = document.createElement('div');
  err.className = 'verein-error dss-empty';
  err.appendChild(document.createTextNode(msg + ' '));
  if (showReload) {
    const btn = document.createElement('button');
    btn.textContent = 'Erneut versuchen';
    btn.onclick = () => location.reload();
    err.appendChild(btn);
  } else {
    const back = document.createElement('a');
    back.href = 'index.html';
    back.textContent = 'Zurück zur Suche';
    err.appendChild(back);
  }
  content.appendChild(err);
}

async function loadClub(clubId) {
  const res = await fetch(CLUBS_JSON);
  if (!res.ok) throw new Error('clubs.json nicht ladbar');
  const clubs = await res.json();
  const club = clubs.find(c => String(c.clubId) === String(clubId));
  if (!club) throw new Error('Verein nicht gefunden (ID: ' + clubId + ')');
  return club;
}

function createLogoPlaceholder() {
  const div = document.createElement('div');
  div.className = 'verein-logo-placeholder';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '9');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 3a9 9 0 0 1 6.364 15.364M12 3A9 9 0 0 0 5.636 18.364M12 3v18M3 12h18');
  svg.appendChild(circle);
  svg.appendChild(path);
  div.appendChild(svg);
  return div;
}

function renderClubHeader(club) {
  const wrap = document.createElement('div');
  wrap.className = 'verein-club-header';

  if (club.logoUrl) {
    const img = document.createElement('img');
    img.className = 'verein-logo';
    img.src = club.logoUrl;
    img.alt = club.name + ' Logo';
    img.onerror = () => img.replaceWith(createLogoPlaceholder());
    wrap.appendChild(img);
  } else {
    wrap.appendChild(createLogoPlaceholder());
  }

  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'verein-name';
  name.textContent = club.name;
  text.appendChild(name);
  const verband = document.createElement('div');
  verband.className = 'verein-verband';
  verband.textContent = club.verbandName || '';
  text.appendChild(verband);
  const favBtn = window.Favorites ? Favorites.button('club', { id: club.clubId, name: club.name }) : null;
  if (favBtn) text.appendChild(favBtn);
  wrap.appendChild(text);
  return wrap;
}

/** Links des Vereins; es gibt nur die eigene Website (ein Profil auf basketball-bund.net lässt sich nicht verlinken: das Linkziel existiert nicht). */
function renderLinks(club) {
  if (!club.website) return null;
  const wrap = document.createElement('div');
  wrap.className = 'verein-links';

  const a = document.createElement('a');
  a.className = 'dss-chip dss-chip--link';
  a.href = club.website;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Website';
  wrap.appendChild(a);

  return wrap;
}

function hallHref(hall) {
  return hallUrlMap && hall.dbbSpielfeldId ? hallUrlMap[String(hall.dbbSpielfeldId)] || null : null;
}

// Karte "Spielorte": Hallen mit genauer Koordinate und, wenn belegt, der Vereinssitz mit eigenem Pin.
function renderMap(club) {
  const pins = HallLogic.splitHalls(club.halls, hallCoords).onMap.map(e => ({
    kind: 'hall', lat: e.lat, lng: e.lng, name: e.hall.bezeichnung, address: HallLogic.addressOf(e.hall),
    href: hallHref(e.hall), note: '', hallId: e.hall.dbbSpielfeldId
  }));
  const seat = HallLogic.seatOf(club);
  if (seat) pins.push({ kind: 'seat', lat: seat.lat, lng: seat.lng, name: seat.name, address: seat.address, href: null, note: '' });
  if (pins.length === 0) return null;

  const section = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'verein-section-title';
  title.textContent = 'Spielorte';
  section.appendChild(title);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'verein-map-wrap';
  const mapEl = document.createElement('div');
  mapEl.id = 'verein-map';
  mapEl.setAttribute('role', 'region');
  mapEl.setAttribute('aria-label', 'Karte der Spielorte');
  mapWrap.appendChild(mapEl);
  section.appendChild(mapWrap);

  section._pins = pins;
  section._initMap = function () { HallMap.render(mapEl, pins); };
  return section;
}

// Hallen-Cards am Seitenende: Name (Link), Adresse, Spiele des Vereins (kommen nach den Liga-Daten), Vermerk ohne genaue Adresse.
function renderHalls(club) {
  if (!club.halls || club.halls.length === 0) return null;

  const section = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'verein-section-title';
  title.textContent = 'Hallen';
  section.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'hall-cards';
  section.appendChild(list);
  section._facts = {};

  club.halls.forEach(h => {
    const li = document.createElement('li');
    li.className = 'hall-card dss-card dss-card--default dss-card--pad-md';
    const body = document.createElement('div');
    body.className = 'dss-card-body';
    li.appendChild(body);

    const nameEl = document.createElement('div');
    nameEl.className = 'hall-card-name';
    const href = hallHref(h);
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = h.bezeichnung;
      nameEl.appendChild(a);
    } else {
      nameEl.textContent = h.bezeichnung;
    }
    body.appendChild(nameEl);

    const address = HallLogic.addressOf(h);
    if (address) {
      const addrEl = document.createElement('p');
      addrEl.className = 'hall-card-addr';
      addrEl.textContent = address;
      body.appendChild(addrEl);
    }

    const facts = document.createElement('p');
    facts.className = 'hall-card-facts';
    facts.hidden = true;
    body.appendChild(facts);
    if (h.dbbSpielfeldId) section._facts[String(h.dbbSpielfeldId)] = facts;

    if (!HallLogic.coordsOf(h, hallCoords)) {
      const note = document.createElement('p');
      note.className = 'hall-card-note';
      note.textContent = 'Keine genaue Adresse, nicht auf der Karte';
      body.appendChild(note);
    }
    list.appendChild(li);
  });

  return section;
}

// Liga-Dokumente aller Teams des Vereins (die Teamkarten laden dieselben, über ligaCache nur einmal).
async function loadClubDocs(club) {
  try {
    const index = await loadTeamIndex();
    const ids = new Set();
    (club.teams || []).forEach(t => (index[String(t.teamPermanentId)] || []).forEach(id => ids.add(id)));
    const settled = await Promise.allSettled([...ids].map(loadLiga));
    return settled.filter(r => r.status === 'fulfilled').map(r => r.value);
  } catch (e) {
    return [];
  }
}

// Spiele des Vereins je Halle in Cards und Karten-Popups nachtragen.
async function fillHallStats(club, mapSection, hallsSection) {
  const docs = await loadClubDocs(club);
  if (docs.length === 0) return;
  const stats = HallLogic.clubHallStats(docs, club.clubId, new Date().toISOString().slice(0, 10));
  if (hallsSection) {
    Object.keys(hallsSection._facts).forEach(id => {
      const text = HallLogic.gamesText(stats[id]);
      if (text) {
        hallsSection._facts[id].textContent = text;
        hallsSection._facts[id].hidden = false;
      }
    });
  }
  if (mapSection) mapSection._pins.forEach(p => { if (p.kind === 'hall') p.note = HallLogic.gamesText(stats[String(p.hallId)]); });
}

function renderTeamCard(team, club, hallsById) {
  const card = document.createElement('div');
  card.className = 'verein-team-card dss-card dss-card--hoverable';

  const header = document.createElement('div');
  header.className = 'verein-team-header';

  const label = document.createElement('div');
  label.className = 'verein-team-label';
  const labelLink = document.createElement('a');
  labelLink.href = TeamLogic.teamHref(teamUrlMap, team.teamPermanentId);
  labelLink.className = 'verein-team-link';
  labelLink.appendChild(document.createTextNode(getTeamLabel(team, club.teams)));
  // Zusatz für Screenreader: wohin der Link führt (der sichtbare Text beginnt mit dem Teamnamen)
  const hidden = document.createElement('span');
  hidden.className = 'dss-sr-only';
  hidden.textContent = ' – Tabelle und Spielplan';
  labelLink.appendChild(hidden);
  label.appendChild(labelLink);
  header.appendChild(label);

  card.appendChild(header);

  const ligaEl = document.createElement('div');
  ligaEl.className = 'verein-team-liga verein-team-loading';
  ligaEl.textContent = 'Liga wird geladen…';
  card.appendChild(ligaEl);

  // Platz, Bilanz, Differenz und Form (TeamStats); füllt loadTeamLiga, sobald die Liga geladen ist
  const statsEl = document.createElement('div');
  statsEl.className = 'verein-team-stats';
  card.appendChild(statsEl);

  if (team.training && team.training.length > 0) {
    team.training.forEach(t => {
      const row = document.createElement('div');
      row.className = 'verein-training-row';
      row.appendChild(document.createTextNode(t.wochentag + ' ' + t.von + '–' + t.bis));
      const hall = hallsById[t.hallId];
      if (hall) {
        row.appendChild(document.createTextNode(' · '));
        const hasAddr = hall.strasse && hall.ort;
        if (hasAddr) {
          const mapsQuery = encodeURIComponent(hall.bezeichnung + ', ' + hall.strasse + ', ' + (hall.plz ? hall.plz + ' ' : '') + hall.ort);
          const link = document.createElement('a');
          link.href = 'https://www.google.com/maps/search/?api=1&query=' + mapsQuery;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = hall.bezeichnung;
          row.appendChild(link);
        } else {
          row.appendChild(document.createTextNode(hall.bezeichnung));
        }
      }
      card.appendChild(row);
    });
  }

  // Sichtbarer Hinweis, dass die ganze Karte zur Team-Seite führt (der Link oben deckt die Karte ab)
  const cta = document.createElement('div');
  cta.className = 'verein-team-cta';
  cta.setAttribute('aria-hidden', 'true');
  cta.textContent = 'Tabelle & Spielplan ansehen →';
  card.appendChild(cta);

  card._ligaEl = ligaEl;
  card._statsEl = statsEl;
  card._labelLink = labelLink;
  return card;
}

function renderTeams(club) {
  if (!club.teams || club.teams.length === 0) return null;

  const hallsById = {};
  if (club.halls) club.halls.forEach(h => { hallsById[h.id] = h; });

  const section = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'verein-section-title';
  title.textContent = 'Teams (' + club.teams.length + ')';
  section.appendChild(title);

  const list = document.createElement('div');
  list.className = 'verein-teams';
  section.appendChild(list);

  club.teams
    .slice()
    .sort((a, b) => akSortKey(a.altersklasse) - akSortKey(b.altersklasse))
    .forEach(team => {
      const card = renderTeamCard(team, club, hallsById);
      list.appendChild(card);
      loadTeamLiga(team, club.clubId, card);
    });

  const note = document.createElement('p');
  note.className = 'verein-proxy-note';
  note.textContent = 'Liga und Tabellenplatz: Stand des letzten Abrufs von basketball-bund.net (alle 6 Stunden).';
  section.appendChild(note);

  return section;
}

function showStaticLiga(team, card) {
  card._ligaEl.classList.remove('verein-team-loading');
  if (team.liganame) {
    card._ligaEl.textContent = team.liganame;
    const stats = team.rang ? TeamStats.render({ rang: team.rang }, { compact: true }) : null;
    if (stats) card._statsEl.appendChild(stats);
  } else {
    card._ligaEl.textContent = 'Liga nicht verfügbar';
  }
}

async function loadTeamLiga(team, clubId, card) {
  try {
    const index = await loadTeamIndex();
    const ligaIds = index[String(team.teamPermanentId)];
    if (!ligaIds || !ligaIds.length) throw new Error('keine Live-Daten');
    const docs = await Promise.all(ligaIds.map(loadLiga));
    const doc = TeamLogic.pickPrimaryLiga(docs, team.teamPermanentId);
    if (!doc) throw new Error('keine Liga');

    card._ligaEl.classList.remove('verein-team-loading');
    card._ligaEl.textContent = doc.liganame;
    card._labelLink.href = TeamLogic.teamHref(teamUrlMap, team.teamPermanentId, doc.ligaId);

    const stats = TeamStats.render(TeamLogic.summary(doc, team.teamPermanentId), { compact: true });
    if (stats) card._statsEl.appendChild(stats);
    if (!TeamLogic.standingFor(doc.tabelle, team.teamPermanentId) && (doc.tabelle || []).length === 0) {
      card._ligaEl.textContent = '';
      const badge = document.createElement('span');
      badge.className = 'verein-badge-pokal dss-chip dss-chip--mono';
      badge.textContent = 'Pokal / KO-Turnier';
      card._ligaEl.appendChild(badge);
      card._ligaEl.appendChild(document.createTextNode(' ' + doc.liganame));
    }
  } catch (err) {
    showStaticLiga(team, card);
  }
}

async function init() {
  const clubId = getClubIdFromUrl();
  if (!clubId) {
    showError('Keine Vereins-ID angegeben.');
    return;
  }

  if (await redirectToStaticPage(clubId)) return;
  teamUrlMap = await fetch('data/team-url-map.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  hallUrlMap = await fetch('data/hall-url-map.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  hallCoords = await fetch('data/hall-coords.json').then(r => (r.ok ? r.json() : null)).catch(() => null);

  try {
    const club = await loadClub(clubId);
    document.title = club.name + ' — Basketball Vereinsregister';

    const content = document.getElementById('verein-content');
    content.textContent = '';
    content.setAttribute('data-live', '');       // ab hier die Fassung aus den Live-Daten (davor die vorberechnete Seite)

    content.appendChild(renderClubHeader(club));
    const links = renderLinks(club);
    if (links) content.appendChild(links);

    const mapSection = renderMap(club);
    if (mapSection) {
      content.appendChild(mapSection);
      mapSection._initMap();
    }

    const teamsSection = renderTeams(club);
    if (teamsSection) content.appendChild(teamsSection);

    const hallsSection = renderHalls(club);
    if (hallsSection) content.appendChild(hallsSection);
    fillHallStats(club, mapSection, hallsSection);

    const report = window.Report ? Report.link({ kind: 'club', id: club.clubId, name: club.name }) : null;
    if (report) {
      const row = document.createElement('p');
      row.className = 'report-row';
      row.appendChild(document.createTextNode('Stimmt etwas nicht? '));
      row.appendChild(report);
      content.appendChild(row);
    }

  } catch (err) {
    const isLoadError = err.message === 'clubs.json nicht ladbar';
    showError('Fehler: ' + err.message + '.', { showReload: isLoadError });
  }
}

document.addEventListener('DOMContentLoaded', init);
