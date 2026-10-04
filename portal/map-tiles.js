// Kartenkacheln für alle Karten der Unterseiten (Halle, Teaser, Verein): OpenStreetMap, wie auf der Startseite.
// Die CARTO-Kacheln, die vorher benutzt wurden, verlangen inzwischen einen API-Schlüssel ("KEY REQUIRED").
// OSM kennt keine dunkle Variante; im Dunkelmodus dämpft CSS (.dss-map) die Kacheln, die Marker bleiben unberührt.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MapTiles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  /** Fügt die Kacheln einer Leaflet-Karte hinzu und markiert den Container für die Darstellung im Dunkelmodus. */
  function add(L, map, maxZoom) {
    var container = map.getContainer && map.getContainer();
    if (container && container.classList) container.classList.add('dss-map');
    return L.tileLayer(URL, { attribution: ATTRIBUTION, maxZoom: maxZoom || 19 }).addTo(map);
  }

  return { add: add, URL: URL, ATTRIBUTION: ATTRIBUTION };
});
