const LIVE_BASE = 'data/live/';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function teamLink(teamId, ligaId, text) {
  const a = el('a', null, text);
  a.href = 'team.html?id=' + encodeURIComponent(teamId) + (ligaId ? '&liga=' + encodeURIComponent(ligaId) : '');
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
  content.appendChild(el('div', 'verein-error', text));
}

function todayIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function stat(value, label) {
  const box = el('div', 'team-stat');
  const v = el('div', 'team-stat-value');
  if (value instanceof Node) v.appendChild(value); else v.textContent = value;
  box.appendChild(v);
  box.appendChild(el('div', 'team-stat-label', label));
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

function renderNext(list) {
  const next = TeamLogic.nextMatch(list, todayIso());
  if (!next) return null;
  const section = el('div');
  section.appendChild(el('div', 'team-section-title', 'Nächstes Spiel'));
  const box = el('div', 'team-next');
  box.appendChild(el('div', 'team-next-when', TeamLogic.formatKickoff(next.match.kickoffDate, next.match.kickoffTime)));
  const teams = el('div', 'team-next-teams');
  teams.appendChild(el('span', 'team-match-ha', next.isHome ? 'Heim' : 'Auswärts'));
  teams.appendChild(document.createTextNode('gegen '));
  teams.appendChild(next.opponent ? teamLink(next.opponent.teamPermanentId, null, next.opponent.teamname) : document.createTextNode('?'));
  box.appendChild(teams);
  section.appendChild(box);
  return section;
}

function renderTable(doc, teamId) {
  const rows = doc.tabelle || [];
  const section = el('div');
  section.appendChild(el('div', 'team-section-title', 'Tabelle'));
  if (!rows.length) {
    section.appendChild(el('div', 'team-empty', 'Für diesen Wettbewerb gibt es (noch) keine Tabelle.'));
    return section;
  }
  const wrap = el('div', 'team-table-wrap');
  const table = el('table', 'team-table');
  const head = el('tr');
  ['#', 'Team', 'Sp', 'S', 'N', 'Körbe', 'Diff', 'Pkt'].forEach(h => head.appendChild(el('th', null, h)));
  const thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach(r => {
    const tr = el('tr', String(r.team.teamPermanentId) === String(teamId) ? 'team-own' : '');
    tr.appendChild(el('td', null, String(r.rang)));
    const nameCell = el('td');
    nameCell.appendChild(teamLink(r.team.teamPermanentId, doc.ligaId, r.team.teamname));
    tr.appendChild(nameCell);
    tr.appendChild(el('td', null, String(r.anzspiele)));
    tr.appendChild(el('td', null, String(r.s)));
    tr.appendChild(el('td', null, String(r.n)));
    tr.appendChild(el('td', null, r.koerbe + ':' + r.gegenKoerbe));
    tr.appendChild(el('td', null, (r.korbdiff > 0 ? '+' : '') + r.korbdiff));
    tr.appendChild(el('td', null, String(r.anzGewinnpunkte)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return section;
}

function matchRow(d, ligaId) {
  const row = el('div', 'team-match' + (d.played ? ' team-match-past' : ''));
  row.appendChild(el('div', 'team-match-when', TeamLogic.formatKickoff(d.match.kickoffDate, d.match.kickoffTime)));

  const teams = el('div', 'team-match-teams');
  teams.appendChild(el('span', 'team-match-ha', d.isHome ? 'H' : 'A'));
  teams.appendChild(d.opponent ? teamLink(d.opponent.teamPermanentId, ligaId, d.opponent.teamname) : document.createTextNode('?'));
  row.appendChild(teams);

  const res = el('div', 'team-match-result');
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
    section.appendChild(el('div', 'team-empty', 'Keine Spiele gefunden.'));
    return section;
  }
  const tabs = el('div', 'team-tabs');
  const matches = el('div', 'team-matches');
  const filters = [['Alle', () => true], ['Heim', d => d.isHome], ['Auswärts', d => !d.isHome]];
  function show(i) {
    matches.textContent = '';
    list.filter(filters[i][1]).forEach(d => matches.appendChild(matchRow(d, ligaId)));
    Array.from(tabs.children).forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  filters.forEach((f, i) => {
    const b = el('button', 'team-liga-btn', f[0]);
    b.type = 'button';
    b.onclick = () => show(i);
    tabs.appendChild(b);
  });
  section.appendChild(tabs);
  section.appendChild(matches);
  show(0);
  return section;
}

function renderLiga(docs, doc, teamId, container) {
  const list = TeamLogic.teamMatches(doc.matches, teamId);
  container.textContent = '';
  container.appendChild(renderStats(doc, teamId, list));
  const next = renderNext(list);
  if (next) container.appendChild(next);
  container.appendChild(renderTable(doc, teamId));
  container.appendChild(renderSchedule(list, doc.ligaId));
  container.appendChild(el('div', 'team-updated', 'Stand: ' + new Date(doc.fetchedAt).toLocaleString('de-DE') + ' · wird alle 6 Stunden aktualisiert'));
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get('id');
  const wantedLiga = params.get('liga');
  if (!teamId) { message('Keine Team-ID angegeben.'); return; }

  let index;
  try {
    index = await fetchJson(LIVE_BASE + 'team-index.json');
  } catch (e) {
    message('Live-Daten sind derzeit nicht verfügbar.');
    return;
  }
  const ligaIds = index[String(teamId)];
  if (!ligaIds || !ligaIds.length) { message('Für dieses Team liegen keine Live-Daten vor.'); return; }

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
  content.appendChild(el('h1', 'team-title', name));

  const sub = el('div', 'team-sub');
  if (clubId != null) {
    const back = document.getElementById('back-link');
    if (back) { back.href = 'verein.html?id=' + encodeURIComponent(clubId); back.lastChild.textContent = ' Zum Verein'; }
  }
  const ligaLabel = el('span', null);
  sub.appendChild(ligaLabel);
  content.appendChild(sub);

  const body = el('div');
  if (docs.length > 1) {
    const switcher = el('div', 'team-ligas');
    docs.forEach(d => {
      const b = el('button', 'team-liga-btn', d.liganame);
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
    history.replaceState(null, '', '?id=' + encodeURIComponent(teamId) + '&liga=' + encodeURIComponent(current.ligaId));
    renderLiga(docs, current, teamId, body);
  }
  select();
}

document.addEventListener('DOMContentLoaded', init);
