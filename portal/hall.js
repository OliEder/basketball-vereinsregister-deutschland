// Karte auf der Hallenseite: eine Markierung für die Halle (Leaflet, OpenStreetMap-Kacheln aus map-tiles.js).
(function () {
  var el = document.getElementById('hall-map');
  if (!el || typeof L === 'undefined') { if (el) el.remove(); return; }
  var lat = parseFloat(el.getAttribute('data-lat'));
  var lng = parseFloat(el.getAttribute('data-lng'));
  if (isNaN(lat) || isNaN(lng)) { el.remove(); return; }
  var name = el.getAttribute('data-name') || 'Halle';
  var map = L.map(el, { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], parseInt(el.getAttribute('data-zoom'), 10) || 16);
  MapTiles.add(L, map);
  var icon = L.divIcon({ className: '', html: '<div class="dss-map-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  L.marker([lat, lng], { icon: icon, title: name, alt: name }).addTo(map);
})();
