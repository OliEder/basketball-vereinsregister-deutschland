// Fuse.js und Leaflet werden via CDN geladen (siehe index.html)
// Suchlogik läuft vollständig client-seitig

let searchEngine = null;
let map = null;
let markerLayer = null;
let lastResults = [];

function setTeaserVisible(visible) {
  const teaser = document.getElementById('project-teaser');
  if (teaser) teaser.style.display = visible ? '' : 'none';
}

// --- Haversine ---

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- SearchEngine (client-seitig) ---

class SearchEngine {
  constructor(clubs) {
    this.clubs = clubs;
    this.fuse = new Fuse(clubs, {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true
    });
  }

  searchByName(query) {
    return this.fuse.search(query).map(r => r.item);
  }

  searchByLocation(lat, lng, radiusKm) {
    return this.clubs
      .filter(c => c.lat != null && c.lng != null)
      .map(c => ({ ...c, distanceKm: Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10 }))
      .filter(c => c.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  searchCombined(query, lat, lng, radiusKm) {
    const byLocation = this.searchByLocation(lat, lng, radiusKm);
    const locationIds = new Set(byLocation.map(c => c.clubId));
    const byName = this.searchByName(query).filter(c => locationIds.has(c.clubId));
    const distances = new Map(byLocation.map(c => [c.clubId, c.distanceKm]));
    return byName.map(c => ({ ...c, distanceKm: distances.get(c.clubId) }));
  }
}

// --- Nominatim (direkt vom Browser) ---

async function geocodeCity(city) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=' +
    encodeURIComponent(city);
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Accept-Language': 'de' }
  });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// --- Daten laden ---

async function loadClubs() {
  setStatus('Lade Vereinsdaten...');
  const res = await fetch('data/clubs.json');
  if (!res.ok) throw new Error('clubs.json konnte nicht geladen werden');
  return res.json();
}

// --- Rendering ---

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function createLogoEl(club) {
  if (club.logoUrl) {
    const img = document.createElement('img');
    img.className = 'club-logo';
    img.setAttribute('src', club.logoUrl);
    img.setAttribute('alt', club.name + ' Logo');
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'club-logo-placeholder';
      placeholder.textContent = '🏀';
      img.parentNode.replaceChild(placeholder, img);
    });
    return img;
  }
  const placeholder = document.createElement('div');
  placeholder.className = 'club-logo-placeholder';
  placeholder.textContent = '🏀';
  return placeholder;
}

const AK_ORDER = ['Senioren','U20','U19','U18','U17','U16','U15','U14','U13','U12','U11','U10','U9','U8','Ü35','Ü40','Ü45','Ü50','Ü55'];

// Ostersonntag nach Gauss/Meeus
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function pfingsten(year) {
  const easter = easterSunday(year);
  return new Date(easter.getTime() + 49 * 24 * 60 * 60 * 1000);
}

// Saison-Jahrgang: nach Pfingsten wechselt die Saison
function currentSeasonYear() {
  const now = new Date();
  const pf = pfingsten(now.getFullYear());
  return now >= pf ? now.getFullYear() : now.getFullYear() - 1;
}

// Jahrgangs-Label für U-Altersklassen (z.B. U10 → "Jg. 2016/17")
function akJahrgang(ak) {
  const match = ak.match(/^U(\d+)$/);
  if (!match) return null;
  const alter = parseInt(match[1], 10);
  const season = currentSeasonYear();
  const born1 = season - alter + 1;
  const born2 = season - alter + 2;
  if (alter === 8) return 'Jg. ' + born2 + ' und jünger';
  return 'Jg. ' + born1 + '/' + String(born2).slice(2);
}

function akSortKey(ak) {
  const i = AK_ORDER.indexOf(ak);
  return i === -1 ? 999 : i;
}

const AK_LADDER = ['Mini', 'U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Senioren'];

function jahrgangToAk(jahrgang) {
  const alter = currentSeasonYear() - parseInt(jahrgang, 10) + 1;
  if (alter <= 8)  return 'Mini';
  if (alter <= 10) return 'U10';
  if (alter <= 12) return 'U12';
  if (alter <= 14) return 'U14';
  if (alter <= 16) return 'U16';
  if (alter <= 18) return 'U18';
  if (alter <= 20) return 'U20';
  return 'Senioren';
}

function allowedAksForJahrgang(jahrgang) {
  if (!jahrgang) return [];
  const ak = jahrgangToAk(jahrgang);
  if (ak === 'Senioren') return ['Senioren'];
  const idx = AK_LADDER.indexOf(ak);
  const allowed = [ak];
  if (idx + 1 < AK_LADDER.length) allowed.push(AK_LADDER[idx + 1]);
  if ((ak === 'U18' || ak === 'U20') && !allowed.includes('Senioren')) allowed.push('Senioren');
  return allowed;
}

function getTeamLabel(team, allTeams) {
  const ak = team.altersklasse ?? '';
  const g = team.geschlecht ?? '';
  const num = team.teamNumber ?? 1;

  // Basisname
  let base;
  if (ak.toLowerCase() === 'senioren') {
    base = g === 'weiblich' ? 'Frauen' : g === 'männlich' ? 'Herren' : ak;
  } else {
    const suffix = g ? ' (' + g + ')' : '';
    base = ak + suffix;
  }

  // Nummer anhängen wenn > 1
  return num > 1 ? base + ' ' + num : base;
}

function getBadgeLabel(team) {
  const ak = team.altersklasse || '';
  const g = team.geschlecht || '';
  const num = team.teamNumber || 1;

  let base;
  if (ak.toLowerCase() === 'senioren') {
    base = g === 'weiblich' ? 'Damen' : g === 'männlich' ? 'Herren' : 'Senioren';
  } else {
    const gSuffix = g === 'männlich' ? ' m' : g === 'weiblich' ? ' w' : g === 'mix' ? ' mix' : '';
    base = ak + gSuffix;
  }

  return num > 1 ? base + ' ' + num : base;
}

function renderTeamBadges(club) {
  if (!club.teams || club.teams.length === 0) return null;

  const jahrgang = document.getElementById('ak-filter').value;
  const g = document.getElementById('geschlecht-filter').value;
  const allowed = jahrgang ? allowedAksForJahrgang(jahrgang) : null;

  const visibleTeams = club.teams
    .slice()
    .sort((a, b) => akSortKey(a.altersklasse) - akSortKey(b.altersklasse))
    .filter(t => (!allowed || allowed.includes(t.altersklasse)) && (!g || t.geschlecht === g));

  if (visibleTeams.length === 0) return null;

  const wrap = document.createElement('div');
  wrap.className = 'team-badges';

  visibleTeams.forEach(team => {
    const badge = document.createElement('span');
    const geschlecht = team.geschlecht || '';
    if (geschlecht === 'männlich') {
      badge.className = 'team-badge team-badge--m';
    } else if (geschlecht === 'weiblich') {
      badge.className = 'team-badge team-badge--w';
    } else {
      badge.className = 'team-badge';
    }
    badge.textContent = getBadgeLabel(team);
    wrap.appendChild(badge);
  });

  return wrap;
}

function renderClub(club) {
  const card = document.createElement('div');
  card.className = 'club-card';

  card.appendChild(createLogoEl(club));

  const info = document.createElement('div');
  info.className = 'club-info';

  const name = document.createElement('div');
  name.className = 'club-name';
  name.textContent = club.name;
  info.appendChild(name);

  const metaParts = [
    club.verbandName,
    (club.address && club.address.city) ? club.address.city : club.geocodedFrom,
    club.distanceKm != null ? club.distanceKm + ' km entfernt' : null
  ].filter(Boolean);
  const meta = document.createElement('div');
  meta.className = 'club-meta';
  meta.textContent = metaParts.join(' \u00B7 ');
  info.appendChild(meta);

  const badges = renderTeamBadges(club);
  if (badges) info.appendChild(badges);

  const footer = document.createElement('div');
  footer.className = 'club-card-footer';

  const clubIdRow = document.createElement('div');
  clubIdRow.className = 'club-id-row';
  clubIdRow.appendChild(document.createTextNode('Club-ID: ' + club.clubId + ' '));
  const copyBtn = document.createElement('button');
  copyBtn.className = 'club-id-copy';
  copyBtn.title = 'Club-ID kopieren';
  copyBtn.textContent = '\uD83D\uDCCB';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(String(club.clubId)).then(() => {
      copyBtn.textContent = '\u2713';
      setTimeout(() => { copyBtn.textContent = '\uD83D\uDCCB'; }, 1500);
    });
  });
  clubIdRow.appendChild(copyBtn);
  footer.appendChild(clubIdRow);

  const mehr = document.createElement('a');
  mehr.className = 'mehr-infos-btn';
  mehr.href = 'verein.html?id=' + club.clubId;

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('width', '12');
  arrow.setAttribute('height', '12');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '2.5');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  arrow.setAttribute('aria-hidden', 'true');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M5 12h14M12 5l7 7-7 7');
  arrow.appendChild(arrowPath);
  mehr.appendChild(arrow);
  mehr.appendChild(document.createTextNode(' Mehr Infos'));
  footer.appendChild(mehr);

  info.appendChild(footer);
  card.appendChild(info);
  return card;
}

function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}

// --- Karte ---

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function updateMap(results) {
  const container = document.getElementById('map-container');
  const withCoords = results.filter(c => c.lat != null && c.lng != null);

  if (withCoords.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  initMap();
  markerLayer.clearLayers();

  const bounds = [];
  withCoords.forEach(club => {
    const popup = document.createElement('div');
    const nameEl = document.createElement('strong');
    nameEl.textContent = club.name;
    popup.appendChild(nameEl);
    if (club.distanceKm != null) {
      const dist = document.createElement('div');
      dist.textContent = club.distanceKm + ' km entfernt';
      dist.style.fontSize = '0.85em';
      dist.style.color = '#888';
      popup.appendChild(dist);
    }

    const marker = L.marker([club.lat, club.lng])
      .bindPopup(popup)
      .addTo(markerLayer);
    bounds.push([club.lat, club.lng]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  // Leaflet braucht nach display:block einen size-refresh
  setTimeout(() => map.invalidateSize(), 50);
}

function applyFilters(results) {
  const jahrgang = document.getElementById('ak-filter').value;
  const g = document.getElementById('geschlecht-filter').value;
  return results.filter(c => {
    const teams = c.teams || [];
    if (jahrgang) {
      const allowed = allowedAksForJahrgang(jahrgang);
      if (!teams.some(t => allowed.includes(t.altersklasse))) return false;
    }
    if (g && !teams.some(t => t.geschlecht === g)) return false;
    return true;
  });
}

function showResults(results, statusText) {
  lastResults = results;
  renderResults(statusText);
}

function renderResults(statusText) {
  const filtered = applyFilters(lastResults);
  const list = document.getElementById('results-list');
  const status = document.getElementById('status-text');
  while (list.firstChild) list.removeChild(list.firstChild);
  if (statusText) {
    status.textContent = filtered.length !== lastResults.length
      ? filtered.length + ' Verein(e) (gefiltert von ' + lastResults.length + ')'
      : statusText;
  }
  filtered.forEach(club => list.appendChild(renderClub(club)));
  updateMap(filtered);
  setTeaserVisible(filtered.length === 0 && lastResults.length === 0);
}

// --- Suche ---

function doNameSearch(query) {
  if (!searchEngine || query.length < 3) return;
  const results = searchEngine.searchByName(query);
  showResults(results, results.length + ' Verein(e) gefunden');
}

async function doLocationSearch() {
  if (!searchEngine) return;
  const near = document.getElementById('near-input').value.trim();
  const radius = Math.max(1, parseFloat(document.getElementById('radius-select').value) || 25);
  if (!near) return;

  setStatus('Suche läuft...');
  try {
    const coords = await geocodeCity(near);
    if (!coords) {
      setStatus('"' + near + '" konnte nicht gefunden werden.');
      return;
    }
    const results = searchEngine.searchByLocation(coords.lat, coords.lng, radius);
    showResults(results, results.length + ' Verein(e) im Umkreis von ' + radius + ' km um "' + near + '"');
  } catch {
    setStatus('Fehler bei der Ortssuche.');
  }
}

const debouncedSearch = debounce(doNameSearch, 300);

document.getElementById('name-input').addEventListener('input', e => {
  debouncedSearch(e.target.value.trim());
});

document.getElementById('name-btn').addEventListener('click', () => {
  doNameSearch(document.getElementById('name-input').value.trim());
});

document.getElementById('near-btn').addEventListener('click', doLocationSearch);

document.getElementById('near-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLocationSearch();
});

document.getElementById('ak-filter').addEventListener('change', () => renderResults());
document.getElementById('geschlecht-filter').addEventListener('change', () => renderResults());

// --- Init ---

// Jahrgänge-Dropdown befüllen
(function fillJahrgangFilter() {
  const select = document.getElementById('ak-filter');
  const season = currentSeasonYear();
  for (let jg = season; jg >= season - 19; jg--) {
    const opt = document.createElement('option');
    opt.value = String(jg);
    opt.textContent = 'Jg. ' + jg + ' (' + jahrgangToAk(jg) + ')';
    select.appendChild(opt);
  }
})();

loadClubs()
  .then(clubs => {
    searchEngine = new SearchEngine(clubs);
    setStatus(clubs.length + ' Vereine geladen. Bereit zur Suche.');

    const teamCount = clubs.reduce((sum, c) => sum + (c.teams ? c.teams.length : 0), 0);
    const hallCount = clubs.reduce((sum, c) => sum + (c.halls ? c.halls.length : 0), 0);
    const statsBar = document.getElementById('stats-bar');
    if (statsBar) {
      const parts = [
        [clubs.length, 'Vereine'],
        [teamCount, 'Teams'],
        [hallCount, 'Spielstätten']
      ];
      parts.forEach(([num, label], i) => {
        if (i > 0) statsBar.appendChild(document.createTextNode('\u00a0·\u00a0'));
        const s = document.createElement('span');
        s.textContent = num;
        statsBar.appendChild(s);
        statsBar.appendChild(document.createTextNode('\u00a0' + label));
      });
    }
  })
  .catch(() => {
    setStatus('Fehler: Vereinsdaten konnten nicht geladen werden.');
  });
