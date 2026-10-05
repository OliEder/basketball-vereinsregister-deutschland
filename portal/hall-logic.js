// Reine Funktionen für Hallenkarte und Hallen-Cards (ohne DOM), im Browser, in Jest und im Build nutzbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HallLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  /** "Straße, PLZ Ort", fehlende Teile fallen weg. */
  function addressOf(hall) {
    var place = [hall && hall.plz, hall && hall.ort].filter(Boolean).join(' ');
    return [hall && hall.strasse, place].filter(Boolean).join(', ');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /**
   * Genaue Koordinate einer Halle: die eigene (clubs.json), sonst die aus data/hall-coords.json
   * (Spielfeld-ID → [lat, lng], nur genaue Adressen). Sonst null.
   */
  function coordsOf(hall, coordMap) {
    if (!hall) return null;
    if (isNum(hall.lat) && isNum(hall.lng)) return { lat: hall.lat, lng: hall.lng };
    var c = coordMap && hall.dbbSpielfeldId != null ? coordMap[String(hall.dbbSpielfeldId)] : null;
    return Array.isArray(c) && isNum(c[0]) && isNum(c[1]) ? { lat: c[0], lng: c[1] } : null;
  }

  /** Hallen mit genauer Koordinate (für die Karte) und ohne. */
  function splitHalls(halls, coordMap) {
    var onMap = [], offMap = [];
    (halls || []).forEach(function (hall) {
      var c = coordsOf(hall, coordMap);
      if (c) onMap.push({ hall: hall, lat: c.lat, lng: c.lng });
      else offMap.push(hall);
    });
    return { onMap: onMap, offMap: offMap };
  }

  /** Vereinssitz nur mit belegter Adresse (Straße, Ort) und Koordinate; sonst null. */
  function seatOf(club) {
    var a = club && club.address;
    if (!a || !a.street || !a.city || !isNum(a.lat) || !isNum(a.lng)) return null;
    return { name: club.name, address: addressOf({ strasse: a.street, plz: a.zip, ort: a.city }), lat: a.lat, lng: a.lng };
  }

  /**
   * Spiele eines Vereins je Halle (Spielfeld-ID → { games, upcoming }) aus den Liga-Dokumenten
   * (doc.venues: Spiel-ID → Hallen-ID). Ohne abgesagte Spiele und Verzichte, jedes Spiel einmal.
   * "anstehend": kein Ergebnis und Datum ab `today` (YYYY-MM-DD).
   */
  function clubHallStats(docs, clubId, today) {
    var id = String(clubId), seen = {}, out = {};
    (docs || []).forEach(function (doc) {
      var venues = (doc && doc.venues) || {};
      ((doc && doc.matches) || []).forEach(function (m) {
        var hallId = venues[String(m.matchId)];
        if (hallId == null || m.abgesagt || m.verzicht || seen[m.matchId]) return;
        var mine = (m.homeTeam && String(m.homeTeam.clubId) === id) || (m.guestTeam && String(m.guestTeam.clubId) === id);
        if (!mine) return;
        seen[m.matchId] = true;
        var s = out[String(hallId)] || (out[String(hallId)] = { games: 0, upcoming: 0 });
        s.games++;
        if (!m.result && m.kickoffDate && m.kickoffDate >= today) s.upcoming++;
      });
    });
    return out;
  }

  /** "3 Spiele des Vereins hier, 2 anstehend"; leer, wenn kein Spiel gemeldet ist. */
  function gamesText(stats) {
    if (!stats || !stats.games) return '';
    var text = stats.games + (stats.games === 1 ? ' Spiel' : ' Spiele') + ' des Vereins hier';
    return stats.upcoming ? text + ', ' + stats.upcoming + ' anstehend' : text;
  }

  return {
    addressOf: addressOf,
    coordsOf: coordsOf,
    splitHalls: splitHalls,
    seatOf: seatOf,
    clubHallStats: clubHallStats,
    gamesText: gamesText
  };
});
