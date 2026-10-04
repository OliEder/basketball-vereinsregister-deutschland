// "Fehler melden": öffnet ein vorausgefülltes GitHub-Formular (.github/ISSUE_TEMPLATE/datenfehler.yml).
// Es werden nur Seitenadresse, Name und ID übergeben, keine Daten über die Person.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.Report = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  var REPO = 'https://github.com/OliEder/basketball-vereinsregister-deutschland';

  /** @param o {kind: 'club'|'team'|'liga', id, name, page} */
  function url(o) {
    var noun = o.kind === 'club' ? 'Verein' : o.kind === 'liga' ? 'Liga' : o.kind === 'hall' ? 'Halle' : 'Team';
    var q = [
      ['template', 'datenfehler.yml'],
      ['title', 'Datenfehler: ' + noun + ' ' + String(o.name || '').slice(0, 80)],
      ['page', String(o.page || '')],
      ['objekt', noun + ' ' + o.id + ' – ' + String(o.name || '').slice(0, 120)]
    ];
    return REPO + '/issues/new?' + q.map(function (p) { return p[0] + '=' + encodeURIComponent(p[1]); }).join('&');
  }

  /** Link-Element; öffnet in neuem Tab. */
  function link(o) {
    if (!win || !win.document) return null;
    var a = win.document.createElement('a');
    a.className = 'report-link dss-link';
    a.href = url({ kind: o.kind, id: o.id, name: o.name, page: o.page || win.location.href.split('#')[0] });
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Fehler melden';
    var hint = win.document.createElement('span');
    hint.className = 'dss-sr-only';
    hint.textContent = ' (öffnet GitHub in einem neuen Tab)';
    a.appendChild(hint);
    return a;
  }

  return { url: url, link: link };
});
