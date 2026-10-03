// Favoriten: Teams und Vereine, die jemand merken will. Nur im Browser (localStorage), nichts verlässt das Gerät.
// Die reinen Funktionen (parse, toggle, has) laufen auch in Jest.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.Favorites = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  var KEY = 'vr:favorites';
  var MAX = 50;

  function empty() { return { v: 1, teams: [], clubs: [] }; }

  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    list.forEach(function (e) {
      if (!e || e.id == null || typeof e.name !== 'string') return;
      var id = String(e.id);
      if (seen[id]) return;
      seen[id] = true;
      var item = { id: id, name: e.name.slice(0, 120) };
      if (e.clubId != null) item.clubId = String(e.clubId);
      out.push(item);
    });
    return out.slice(0, MAX);
  }

  /** Gespeicherten Text lesen; kaputte oder fremde Daten ergeben eine leere Liste. */
  function parse(raw) {
    try {
      var d = JSON.parse(raw);
      return { v: 1, teams: cleanList(d && d.teams), clubs: cleanList(d && d.clubs) };
    } catch (e) {
      return empty();
    }
  }

  function has(list, id) {
    return list.some(function (e) { return String(e.id) === String(id); });
  }

  /** Neue Liste mit oder ohne den Eintrag (hinzufügen, wenn nicht vorhanden; sonst entfernen). Höchstens MAX Einträge. */
  function toggle(list, entry) {
    if (has(list, entry.id)) return list.filter(function (e) { return String(e.id) !== String(entry.id); });
    return cleanList(list.concat([entry]));
  }

  function storage() {
    try { return win && win.localStorage ? win.localStorage : null; } catch (e) { return null; }
  }

  function load() {
    var s = storage();
    if (!s) return empty();
    try { return parse(s.getItem(KEY)); } catch (e) { return empty(); }
  }

  function save(state) {
    var s = storage();
    if (!s) return false;
    try { s.setItem(KEY, JSON.stringify(state)); } catch (e) { return false; }
    if (win && win.dispatchEvent && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('favorites:changed'));
    return true;
  }

  function listName(kind) { return kind === 'club' ? 'clubs' : 'teams'; }

  function isFavorite(kind, id) { return has(load()[listName(kind)], id); }

  function toggleFavorite(kind, entry) {
    var state = load();
    var key = listName(kind);
    state[key] = toggle(state[key], entry);
    save(state);
    return has(state[key], entry.id);
  }

  /** Schaltfläche "Merken" (Stern). Ohne localStorage gibt es keine Schaltfläche. */
  function button(kind, entry) {
    if (!win || !win.document || !storage()) return null;
    var doc = win.document;
    var noun = kind === 'club' ? 'Verein' : 'Team';
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'fav-btn dss-btn dss-btn--secondary dss-btn--sm';
    var icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '16'); icon.setAttribute('height', '16'); icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('class', 'fav-star');
    var path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z');
    path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linejoin', 'round');
    icon.appendChild(path);
    var label = doc.createElement('span');
    b.appendChild(icon);
    b.appendChild(label);
    function paint() {
      var on = isFavorite(kind, entry.id);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
      path.setAttribute('fill', on ? 'currentColor' : 'none');
      label.textContent = on ? 'Gemerkt' : 'Merken';
      b.setAttribute('aria-label', noun + ' ' + entry.name + (on ? ' ist gemerkt, zum Entfernen drücken' : ' merken'));
    }
    b.addEventListener('click', function () { toggleFavorite(kind, entry); paint(); });
    paint();
    return b;
  }

  return { KEY: KEY, MAX: MAX, parse: parse, has: has, toggle: toggle, load: load, save: save, isFavorite: isFavorite, toggleFavorite: toggleFavorite, button: button };
});
