// Seitennavigation für lange Seiten und "Nach oben"-Schaltfläche.
//
// Die Navigation entsteht aus den Überschriften (h2) und Blöcken mit data-pagenav="Name" im Hauptbereich, sobald es mindestens MIN_HEADINGS gibt.
// Weil Team- und Vereinsseiten ihre Abschnitte erst im Browser aufbauen, beobachtet das Skript den Hauptbereich
// und baut die Navigation bei Änderungen der Überschriften neu auf.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageNav = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MIN_HEADINGS = 3;
  var SHOW_AFTER = 480;   // px Scrolltiefe, ab der die Schaltfläche erscheint

  /** Id für eine Überschrift: bestehende behalten, sonst aus dem Text (Umlaute aufgelöst), eindeutig machen. */
  function slug(text) {
    return String(text).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'abschnitt';
  }

  /** Beschriftung: data-pagenav, falls gesetzt (für Blöcke ohne Überschrift, z. B. das Kalender-Abo), sonst der Text. */
  function labelOf(h) {
    var custom = typeof h.getAttribute === 'function' ? h.getAttribute('data-pagenav') : null;
    return (custom || h.textContent).replace(/\s+/g, ' ').trim();
  }

  /** Liste { id, text } aus Überschriften; vergibt fehlende Ids. `taken` ist die Menge bereits benutzter Ids. */
  function entries(headings, taken) {
    return headings.map(function (h) {
      var text = labelOf(h);
      if (!h.id) {
        var base = 'abschnitt-' + slug(text), id = base, n = 2;
        while (taken[id]) id = base + '-' + n++;
        h.id = id;
      }
      taken[h.id] = true;
      return { id: h.id, text: text };
    }).filter(function (e) { return e.text; });
  }

  function signature(list) {
    return list.map(function (e) { return e.id + '|' + e.text; }).join('\n');
  }

  function build(doc, list, page) {
    var nav = doc.createElement('nav');
    nav.className = 'dss-pagenav';
    nav.setAttribute('aria-label', 'Auf dieser Seite');
    var label = doc.createElement('p');
    label.className = 'dss-eyebrow';
    label.textContent = 'Auf dieser Seite';
    nav.appendChild(label);
    var ul = doc.createElement('ul');
    ul.className = 'dss-tabs dss-tabs--pills';
    list.forEach(function (e) {
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.className = 'dss-tab';
      a.href = page + '#' + e.id;   // mit Seitenadresse: <base href> würde ein bloßes #id auf die Startseite lenken
      a.textContent = e.text;
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);
    return nav;
  }

  function init(doc, win) {
    doc = doc || document;
    win = win || window;
    var main = doc.querySelector('main');
    var sig = null;
    var wantsNav = !!main && main.classList.contains('verein-main');   // Startseite: nur "Nach oben"

    function refresh() {
      if (!wantsNav) return;
      var old = main.querySelector('.dss-pagenav');
      var headings = Array.prototype.filter.call(main.querySelectorAll('h2, [data-pagenav]'), function (h) { return !h.closest('.dss-pagenav'); });
      var taken = {};
      Array.prototype.forEach.call(doc.querySelectorAll('[id]'), function (e) { taken[e.id] = true; });
      var list = headings.length >= MIN_HEADINGS ? entries(headings, taken) : [];
      var next = list.length >= MIN_HEADINGS ? signature(list) : '';
      if (next === sig && (old || !next)) return;
      sig = next;
      if (old) old.remove();
      if (!next) return;
      // vor den Block setzen, der die erste Überschrift enthält (direktes Kind des Inhaltsbereichs)
      var content = main.querySelector('#verein-content, #team-content') || main;
      var anchor = headings[0];
      while (anchor.parentElement && anchor.parentElement !== content) anchor = anchor.parentElement;
      content.insertBefore(build(doc, list, win.location.href.split('#')[0]), anchor.parentElement === content ? anchor : headings[0]);
    }

    function backToTop() {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'dss-btn dss-btn--secondary dss-btn--icon dss-backtop';
      b.hidden = true;
      b.setAttribute('aria-label', 'Nach oben');
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      b.addEventListener('click', function () {
        var calm = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
        win.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
        var h1 = doc.querySelector('h1') || main;
        if (h1) { if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      });
      doc.body.appendChild(b);
      function toggle() {
        var tall = doc.documentElement.scrollHeight > win.innerHeight * 2;
        b.hidden = !(tall && win.scrollY > SHOW_AFTER);
      }
      win.addEventListener('scroll', toggle, { passive: true });
      win.addEventListener('resize', toggle);
      toggle();
    }

    // Ein Sprung zu einem eingeklappten Block (details) klappt ihn auf
    if (wantsNav) {
      main.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('.dss-pagenav a');
        var target = a && doc.getElementById(a.getAttribute('href').split('#')[1]);
        if (target && target.tagName === 'DETAILS') target.open = true;
      });
    }

    refresh();
    backToTop();
    if (wantsNav && win.MutationObserver) {
      var timer = null;
      new win.MutationObserver(function () {
        win.clearTimeout(timer);
        timer = win.setTimeout(refresh, 150);
      }).observe(main, { childList: true, subtree: true });
    }
  }

  return { init: init, slug: slug, entries: entries, signature: signature, MIN_HEADINGS: MIN_HEADINGS };
});

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { PageNav.init(); });
  else PageNav.init();
}
