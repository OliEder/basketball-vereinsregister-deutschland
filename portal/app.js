// Fuse.js wird via CDN geladen (siehe index.html)
// Suchlogik läuft vollständig client-seitig

let searchEngine = null;

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

function renderTeams(club, info) {
  if (!club.teams || club.teams.length === 0) return;

  const hallsById = {};
  if (club.halls) {
    club.halls.forEach(h => { hallsById[h.id] = h; });
  }

  const section = document.createElement('div');
  section.className = 'club-teams';

  club.teams.forEach(team => {
    const teamEl = document.createElement('div');
    teamEl.className = 'club-team';

    const label = document.createElement('div');
    label.className = 'club-team-label';
    label.textContent = getTeamLabel(team, club.teams);
    if (team.teamAkj) {
      const akj = document.createElement('span');
      akj.className = 'club-team-akj';
      akj.textContent = ' (' + team.teamAkj + ')';
      label.appendChild(akj);
    }
    teamEl.appendChild(label);

    if (!team.training || team.training.length === 0) {
      const noTraining = document.createElement('div');
      noTraining.className = 'club-team-no-training';
      noTraining.textContent = '(keine Trainingszeiten hinterlegt)';
      teamEl.appendChild(noTraining);
    } else {
      team.training.forEach(t => {
        const row = document.createElement('div');
        row.className = 'club-training-row';
        row.appendChild(document.createTextNode(t.wochentag + ' ' + t.von + '\u2013' + t.bis));

        const hall = hallsById[t.hallId];
        if (hall) {
          row.appendChild(document.createTextNode(' \u00B7 '));
          const hasAddr = hall.strasse && hall.ort;
          if (hasAddr) {
            const mapsQuery = encodeURIComponent(hall.bezeichnung + ', ' + hall.strasse + ', ' + (hall.plz ? hall.plz + ' ' : '') + hall.ort);
            const hallLink = document.createElement('a');
            hallLink.href = 'https://www.google.com/maps/search/?api=1&query=' + mapsQuery;
            hallLink.target = '_blank';
            hallLink.rel = 'noopener';
            hallLink.textContent = hall.bezeichnung + ', ' + hall.strasse;
            row.appendChild(hallLink);
          } else {
            row.appendChild(document.createTextNode(hall.bezeichnung));
          }
        }

        teamEl.appendChild(row);
      });
    }

    section.appendChild(teamEl);
  });

  info.appendChild(section);
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

  if (club.address && (club.address.street || club.address.zip || club.address.city)) {
    const addrParts = [
      club.address.street,
      [club.address.zip, club.address.city].filter(Boolean).join(' ')
    ].filter(Boolean);
    const addrEl = document.createElement('div');
    addrEl.className = 'club-meta';
    addrEl.textContent = addrParts.join(', ');
    info.appendChild(addrEl);
  }

  renderTeams(club, info);

  const links = document.createElement('div');
  links.className = 'club-links';
  if (club.website) {
    const a = document.createElement('a');
    a.href = club.website;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '\uD83C\uDF10 ' + club.website.replace(/^https?:\/\//, '');
    links.appendChild(a);
  }
  if (club.email) {
    const a = document.createElement('a');
    a.href = 'mailto:' + club.email;
    a.textContent = '\uD83D\uDCE7 ' + club.email;
    links.appendChild(a);
  }
  if (club.phone) {
    const a = document.createElement('a');
    a.href = 'tel:' + club.phone;
    a.textContent = '\uD83D\uDCDE ' + club.phone;
    links.appendChild(a);
  }
  if (links.childNodes.length > 0) info.appendChild(links);

  if (club.info) {
    const infoText = document.createElement('div');
    infoText.className = 'club-info-text';
    infoText.textContent = club.info;
    info.appendChild(infoText);
  }

  // Club-ID mit Copy-Button
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
  info.appendChild(clubIdRow);

  card.appendChild(info);
  return card;
}

function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}

function showResults(results, statusText) {
  const list = document.getElementById('results-list');
  const status = document.getElementById('status-text');
  while (list.firstChild) list.removeChild(list.firstChild);
  status.textContent = statusText;
  results.forEach(club => list.appendChild(renderClub(club)));
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

// --- Init ---

loadClubs()
  .then(clubs => {
    searchEngine = new SearchEngine(clubs);
    setStatus(clubs.length + ' Vereine geladen. Bereit zur Suche.');
  })
  .catch(() => {
    setStatus('Fehler: Vereinsdaten konnten nicht geladen werden.');
  });
