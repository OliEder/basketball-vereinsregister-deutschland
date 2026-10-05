// Karte der Hallen-Listenseiten: liest die Pins aus <script id="hall-pins" type="application/json">.
(function () {
  var el = document.getElementById('hall-overview-map');
  var data = document.getElementById('hall-pins');
  if (!el || !data || typeof HallMap === 'undefined') { if (el) el.remove(); return; }
  var pins;
  try { pins = JSON.parse(data.textContent); } catch (e) { pins = []; }
  if (!HallMap.render(el, pins)) el.remove();
})();
