// Kennzahlen eines Teams (Platzierung, Bilanz, Korbdifferenz, letzte fünf Spiele) als DSS-Kacheln.
// Gemeinsam für die Teamseite (große Kacheln) und die Teamkarten der Vereinsseite (kompakt).
// Erwartet das Ergebnis von TeamLogic.summary(doc, teamId).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeamStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Letzte Ergebnisse als Chips: S grün, N rot; Farbe und Buchstabe ergänzen sich, der Screenreader hört "Sieg"/"Niederlage". */
  function formChips(outcomes) {
    var wrap = el('span', 'dss-form');
    if (!outcomes.length) { wrap.textContent = '–'; return wrap; }
    outcomes.forEach(function (o) {
      var chip = el('span', 'dss-chip dss-chip--mono ' + (o === 'S' ? 'dss-chip--ok' : 'dss-chip--err'));
      var letter = el('span', null, o);
      letter.setAttribute('aria-hidden', 'true');
      chip.appendChild(letter);
      chip.appendChild(el('span', 'dss-sr-only', o === 'S' ? 'Sieg' : 'Niederlage'));
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function tile(value, label, compact) {
    var box = el('div', 'dss-stat' + (compact ? ' dss-stat--compact' : ''));
    var v = el('div', 'dss-stat-value');
    if (value instanceof Node) v.appendChild(value); else v.textContent = value;
    box.appendChild(v);
    box.appendChild(el('div', 'dss-stat-label', label));
    return box;
  }

  /**
   * Die Kacheln als Daten: [{ value, label }] oder [{ form: ['S','N',…], label }] für die Form.
   * Ohne `compact` erscheinen immer alle vier Kacheln (fehlende Werte als "–"); kompakt entfallen Kacheln ohne Wert.
   * Browser (render) und Seitenbau (crawler/seo.ts) benutzen dieselbe Liste, damit die Zahlen gleich bleiben.
   */
  function items(summary, compact) {
    var s = summary || {};
    var played = s.played > 0;
    var form = s.form || [];
    return [
      s.rang != null ? { value: s.rang + '.', label: compact ? 'Platz' : 'Tabellenplatz' } : (compact ? null : { value: '–', label: 'Tabellenplatz' }),
      played ? { value: s.wins + ' – ' + s.losses, label: compact ? 'Bilanz' : 'Bilanz (S – N)' } : (compact ? null : { value: '–', label: 'Bilanz (S – N)' }),
      played ? { value: (s.diff > 0 ? '+' : '') + s.diff, label: compact ? 'Diff.' : 'Korbdifferenz' } : null,
      form.length || !compact ? { form: form, label: compact ? 'Letzte 5' : 'Form (letzte 5)' } : null
    ].filter(Boolean);
  }

  /** Erzeugt das Kachelgitter im Browser; gibt null zurück, wenn nichts zu zeigen ist. */
  function render(summary, opts) {
    var compact = !!(opts && opts.compact);
    var list = items(summary, compact);
    if (!list.length) return null;
    var grid = el('div', 'dss-stats' + (compact ? ' dss-stats--compact' : ''));
    list.forEach(function (it) { grid.appendChild(tile(it.form ? formChips(it.form) : it.value, it.label, compact)); });
    return grid;
  }

  /** Vereinskacheln: Teams, Spiele (gespielt / gesamt), Ligen. Ohne Live-Daten (played == null) nur die Zahl der Teams. */
  function renderClub(summary, opts) {
    var compact = !!(opts && opts.compact);
    var s = summary || {};
    var items = [];
    if (s.teams != null) items.push([String(s.teams), s.teams === 1 ? 'Team' : 'Teams']);
    if (s.total != null && s.total > 0) items.push([s.played + ' / ' + s.total, 'Spiele gespielt']);
    if (s.ligen != null && s.ligen > 0) items.push([String(s.ligen), s.ligen === 1 ? 'Liga' : 'Ligen']);
    if (!items.length) return null;
    var grid = el('div', 'dss-stats' + (compact ? ' dss-stats--compact' : ''));
    items.forEach(function (it) { grid.appendChild(tile(it[0], it[1], compact)); });
    return grid;
  }

  return { render: render, items: items, renderClub: renderClub, formChips: formChips };
});
