const BBB_BASE = 'https://www.basketball-bund.net/rest';
const CORS_PROXY = 'https://corsproxy.io/?url=';

function bbbFetch(url) {
  return fetch(CORS_PROXY + encodeURIComponent(url));
}
const CLUBS_JSON = 'data/clubs.json';

function getClubIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
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
  err.className = 'verein-error';
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
  wrap.appendChild(text);
  return wrap;
}

function renderLinks(club) {
  const wrap = document.createElement('div');
  wrap.className = 'verein-links';

  if (club.website) {
    const a = document.createElement('a');
    a.href = club.website;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Website';
    wrap.appendChild(a);
  }

  const bbb = document.createElement('a');
  bbb.href = 'https://www.basketball-bund.net/club/id/' + club.clubId;
  bbb.target = '_blank';
  bbb.rel = 'noopener';
  bbb.textContent = 'BBB-Profil';
  wrap.appendChild(bbb);

  return wrap;
}

function renderMap(halls) {
  if (!halls || halls.length === 0) return null;
  const hallsWithCoords = halls.filter(h => h.lat && h.lng);
  if (hallsWithCoords.length === 0) return null;

  const section = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'verein-section-title';
  title.textContent = 'Spielorte';
  section.appendChild(title);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'verein-map-wrap';
  const mapEl = document.createElement('div');
  mapEl.id = 'verein-map';
  mapWrap.appendChild(mapEl);
  section.appendChild(mapWrap);

  section._initMap = function () {
    const map = L.map('verein-map', { zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      maxZoom: 19
    }).addTo(map);

    const icon = L.divIcon({
      className: '',
      html: '<div style="width:12px;height:12px;background:#F76C1B;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const bounds = [];
    hallsWithCoords.forEach(h => {
      const marker = L.marker([h.lat, h.lng], { icon });
      const addrParts = [h.strasse, [h.plz, h.ort].filter(Boolean).join(' ')].filter(Boolean);
      const popup = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = h.bezeichnung;
      popup.appendChild(strong);
      if (addrParts.length > 0) {
        popup.appendChild(document.createElement('br'));
        popup.appendChild(document.createTextNode(addrParts.join(', ')));
      }
      marker.bindPopup(popup);
      marker.addTo(map);
      bounds.push([h.lat, h.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  };

  return section;
}

function renderHalls(halls) {
  if (!halls || halls.length === 0) return null;

  const section = document.createElement('div');
  section.className = 'verein-halls';

  halls.forEach(h => {
    const item = document.createElement('div');
    item.className = 'verein-hall-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'verein-hall-name';
    nameEl.textContent = h.bezeichnung;
    item.appendChild(nameEl);

    const addrParts = [h.strasse, [h.plz, h.ort].filter(Boolean).join(' ')].filter(Boolean);
    if (addrParts.length > 0) {
      const addrEl = document.createElement('div');
      addrEl.className = 'verein-hall-addr';
      addrEl.textContent = addrParts.join(', ');
      item.appendChild(addrEl);
    }

    section.appendChild(item);
  });

  return section;
}

function renderTeamCard(team, club, hallsById) {
  const card = document.createElement('div');
  card.className = 'verein-team-card';

  const header = document.createElement('div');
  header.className = 'verein-team-header';

  const label = document.createElement('div');
  label.className = 'verein-team-label';
  label.textContent = getTeamLabel(team, club.teams);
  header.appendChild(label);

  const rangEl = document.createElement('div');
  rangEl.className = 'verein-team-rang';
  header.appendChild(rangEl);
  card.appendChild(header);

  const ligaEl = document.createElement('div');
  ligaEl.className = 'verein-team-liga verein-team-loading';
  ligaEl.textContent = 'Liga wird geladen…';
  card.appendChild(ligaEl);

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

  card._ligaEl = ligaEl;
  card._rangEl = rangEl;
  return card;
}

function renderTeams(club) {
  if (!club.teams || club.teams.length === 0) return null;

  const hallsById = {};
  if (club.halls) club.halls.forEach(h => { hallsById[h.id] = h; });

  const section = document.createElement('div');
  const title = document.createElement('div');
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
  note.textContent = 'Liga- und Tabellendaten werden live über corsproxy.io von basketball-bund.net geladen.';
  section.appendChild(note);

  return section;
}

async function loadTeamLiga(team, clubId, card) {
  try {
    const matchRes = await bbbFetch(BBB_BASE + '/team/id/' + team.teamPermanentId + '/matches');
    if (!matchRes.ok) throw new Error('matches nicht ladbar');
    const matchData = await matchRes.json();
    const matches = (matchData && matchData.data && matchData.data.matches) ? matchData.data.matches : [];
    if (matches.length === 0) throw new Error('keine Matches');

    const liga = matches[0] && matches[0].ligaData;
    if (!liga || !liga.ligaId) throw new Error('keine ligaId');

    card._ligaEl.textContent = liga.liganame || ('Liga ' + liga.ligaId);
    card._ligaEl.classList.remove('verein-team-loading');

    const tableRes = await bbbFetch(BBB_BASE + '/competition/table/id/' + liga.ligaId);
    if (!tableRes.ok) { const e = Object.assign(new Error('Tabelle nicht ladbar'), { _pokal: true }); throw e; }
    const tableData = await tableRes.json();
    const entries = (tableData && tableData.data && tableData.data.tabelle && tableData.data.tabelle.entries)
      ? tableData.data.tabelle.entries : [];

    if (entries.length === 0) { const e = Object.assign(new Error('keine Einträge'), { _pokal: true }); throw e; }

    const entry = entries.find(e =>
      String(e.team && e.team.clubId) === String(clubId) ||
      String(e.team && e.team.teamPermanentId) === String(team.teamPermanentId)
    );

    if (entry) {
      card._rangEl.textContent = 'Platz ' + entry.rang;
    }
  } catch (err) {
    card._ligaEl.classList.remove('verein-team-loading');
    if (err && err._pokal) {
      card._ligaEl.textContent = '';
      const badge = document.createElement('span');
      badge.className = 'verein-badge-pokal';
      badge.textContent = 'Pokal / KO-Turnier';
      card._ligaEl.appendChild(badge);
    } else {
      card._ligaEl.textContent = 'Liga nicht verfügbar';
    }
  }
}

async function init() {
  const clubId = getClubIdFromUrl();
  if (!clubId) {
    showError('Keine Vereins-ID angegeben.');
    return;
  }

  try {
    const club = await loadClub(clubId);
    document.title = club.name + ' — Basketball Vereinsregister';

    const content = document.getElementById('verein-content');
    content.textContent = '';

    content.appendChild(renderClubHeader(club));
    content.appendChild(renderLinks(club));

    const mapSection = renderMap(club.halls);
    if (mapSection) {
      content.appendChild(mapSection);
      mapSection._initMap();
    }

    const hallsSection = renderHalls(club.halls);
    if (hallsSection) content.appendChild(hallsSection);

    const teamsSection = renderTeams(club);
    if (teamsSection) content.appendChild(teamsSection);

  } catch (err) {
    const isLoadError = err.message === 'clubs.json nicht ladbar';
    showError('Fehler: ' + err.message + '.', { showReload: isLoadError });
  }
}

document.addEventListener('DOMContentLoaded', init);
