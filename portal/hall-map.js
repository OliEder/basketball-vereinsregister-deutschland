// Karte mit Hallen-Pins und optional dem Vereinssitz (Leaflet, OpenStreetMap-Kacheln aus map-tiles.js).
//   HallMap.render(el, pins)
//   pin: { kind: 'hall' | 'seat', lat, lng, name, address, href, note }
// Das Popup entsteht erst beim Öffnen; `note` darf deshalb nachträglich gesetzt werden (Spielzahlen).
(function (root) {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HOUSE_PATH = 'M12 3 2 12h3v9h5v-6h4v6h5v-9h3z';
  // Feste Markup-Zeichenkette für das Leaflet-Icon (enthält keine Daten).
  var SEAT_ICON_HTML = '<div class="dss-map-pin dss-map-pin--seat"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + HOUSE_PATH + '"/></svg></div>';

  function iconFor(kind) {
    if (kind === 'seat') {
      return L.divIcon({ className: '', html: SEAT_ICON_HTML, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
    }
    return L.divIcon({ className: '', html: '<div class="dss-map-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8] });
  }

  /** Popup aus DOM-Knoten (kein HTML aus Daten): Name, Adresse, Notiz, Link zur Hallenseite. */
  function popupFor(pin) {
    var box = document.createElement('div');
    var strong = document.createElement('strong');
    strong.textContent = pin.name;
    box.appendChild(strong);
    if (pin.address) {
      box.appendChild(document.createElement('br'));
      box.appendChild(document.createTextNode(pin.address));
    }
    if (pin.note) {
      var note = document.createElement('p');
      note.className = 'hall-popup-note';
      note.textContent = pin.note;
      box.appendChild(note);
    }
    if (pin.href) {
      var p = document.createElement('p');
      p.className = 'hall-popup-note';
      var a = document.createElement('a');
      a.href = pin.href;
      a.textContent = 'Hallenseite';
      p.appendChild(a);
      box.appendChild(p);
    }
    return box;
  }

  function legendItem(label, seat) {
    var li = document.createElement('li');
    var pin = document.createElement('span');
    pin.className = seat ? 'dss-map-pin dss-map-pin--seat' : 'dss-map-pin';
    if (seat) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', HOUSE_PATH);
      svg.appendChild(path);
      pin.appendChild(svg);
    }
    li.appendChild(pin);
    li.appendChild(document.createTextNode(' ' + label));
    return li;
  }

  function addLegend(el) {
    var ul = document.createElement('ul');
    ul.className = 'hall-map-legend';
    ul.appendChild(legendItem('Halle', false));
    ul.appendChild(legendItem('Vereinssitz', true));
    var anchor = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('verein-map-wrap') ? el.parentNode : el;
    anchor.insertAdjacentElement('afterend', ul);
  }

  function render(el, pins) {
    if (!el || typeof L === 'undefined' || !pins || !pins.length) return null;
    var map = L.map(el, { zoomControl: true, scrollWheelZoom: false });
    MapTiles.add(L, map);
    var bounds = [];
    pins.forEach(function (pin) {
      var marker = L.marker([pin.lat, pin.lng], { icon: iconFor(pin.kind), title: pin.name, alt: pin.name, zIndexOffset: pin.kind === 'seat' ? 1000 : 0 });
      marker.bindPopup(function () { return popupFor(pin); });
      marker.addTo(map);
      bounds.push([pin.lat, pin.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    if (pins.some(function (p) { return p.kind === 'seat'; })) addLegend(el);
    return map;
  }

  root.HallMap = { render: render };
})(typeof self !== 'undefined' ? self : this);
