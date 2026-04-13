const API_BASE = 'http://localhost:3000';

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
  meta.textContent = metaParts.join(' · ');
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

  const links = document.createElement('div');
  links.className = 'club-links';
  if (club.website) {
    const a = document.createElement('a');
    a.href = club.website;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '🌐 ' + club.website.replace(/^https?:\/\//, '');
    links.appendChild(a);
  }
  if (club.email) {
    const a = document.createElement('a');
    a.href = 'mailto:' + club.email;
    a.textContent = '📧 ' + club.email;
    links.appendChild(a);
  }
  if (club.phone) {
    const a = document.createElement('a');
    a.href = 'tel:' + club.phone;
    a.textContent = '📞 ' + club.phone;
    links.appendChild(a);
  }
  if (links.childNodes.length > 0) info.appendChild(links);

  if (club.info) {
    const infoText = document.createElement('div');
    infoText.className = 'club-info-text';
    infoText.textContent = club.info;
    info.appendChild(infoText);
  }

  const bbbLink = document.createElement('a');
  bbbLink.className = 'bbb-link';
  bbbLink.href = 'https://www.basketball-bund.net/vereinDetail/id/' + club.clubId;
  bbbLink.target = '_blank';
  bbbLink.rel = 'noopener';
  bbbLink.textContent = 'Auf basketball-bund.net ansehen →';
  info.appendChild(bbbLink);

  card.appendChild(info);
  return card;
}

function showResults(results, statusText) {
  const list = document.getElementById('results-list');
  const status = document.getElementById('status-text');
  while (list.firstChild) list.removeChild(list.firstChild);
  status.textContent = statusText;
  results.forEach(club => list.appendChild(renderClub(club)));
}

async function searchByName(query) {
  if (query.length < 3) return;
  try {
    const res = await fetch(API_BASE + '/search?name=' + encodeURIComponent(query));
    const data = await res.json();
    showResults(data.results, data.total + ' Verein(e) gefunden');
  } catch {
    document.getElementById('status-text').textContent = 'Fehler beim Laden der Ergebnisse.';
  }
}

async function searchByLocation() {
  const near = document.getElementById('near-input').value.trim();
  const radius = document.getElementById('radius-select').value;
  if (!near) return;

  document.getElementById('status-text').textContent = 'Suche läuft...';
  try {
    const res = await fetch(API_BASE + '/search?near=' + encodeURIComponent(near) + '&radius=' + radius);
    const data = await res.json();
    if (data.error) {
      document.getElementById('status-text').textContent = data.error;
      return;
    }
    showResults(data.results, data.total + ' Verein(e) im Umkreis von ' + radius + ' km um "' + near + '"');
  } catch {
    document.getElementById('status-text').textContent = 'Fehler beim Laden der Ergebnisse.';
  }
}

const debouncedSearch = debounce(searchByName, 300);

document.getElementById('name-input').addEventListener('input', e => {
  debouncedSearch(e.target.value.trim());
});

document.getElementById('name-btn').addEventListener('click', () => {
  searchByName(document.getElementById('name-input').value.trim());
});

document.getElementById('near-btn').addEventListener('click', searchByLocation);

document.getElementById('near-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchByLocation();
});
