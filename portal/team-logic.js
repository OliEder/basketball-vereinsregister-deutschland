// Reine Funktionen für Team-Seite und Team-Karten (ohne DOM), im Browser und in Jest nutzbar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeamLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  /** "74:89" → { home: 74, guest: 89 }, sonst null */
  function parseResult(result) {
    if (typeof result !== 'string') return null;
    var m = result.match(/^(\d+):(\d+)$/);
    return m ? { home: parseInt(m[1], 10), guest: parseInt(m[2], 10) } : null;
  }

  function sameTeam(a, id) {
    return !!a && String(a.teamPermanentId) === String(id);
  }

  function sortKey(m) {
    return (m.kickoffDate || '9999-12-31') + ' ' + (m.kickoffTime || '00:00');
  }

  /**
   * Beschreibt ein Spiel aus Sicht eines Teams.
   * status: 'cancelled' | 'forfeit' | 'confirmed' | 'provisional' | 'open'
   * outcome: 'S' | 'N' | 'U' | null (nur bei vorhandenem Ergebnis)
   */
  function describeMatch(match, teamId) {
    var isHome = sameTeam(match.homeTeam, teamId);
    var opponent = isHome ? match.guestTeam : match.homeTeam;
    var res = parseResult(match.result);
    var own = res ? (isHome ? res.home : res.guest) : null;
    var opp = res ? (isHome ? res.guest : res.home) : null;
    var status = 'open';
    if (match.abgesagt) status = 'cancelled';
    else if (match.verzicht) status = 'forfeit';
    else if (res) status = match.ergebnisbestaetigt ? 'confirmed' : 'provisional';
    var outcome = null;
    if (res && status !== 'cancelled') outcome = own > opp ? 'S' : own < opp ? 'N' : 'U';
    return {
      match: match,
      isHome: isHome,
      opponent: opponent || null,
      own: own,
      opp: opp,
      outcome: outcome,
      status: status,
      played: !!res && status !== 'cancelled'
    };
  }

  /** Alle Spiele des Teams, chronologisch, mit Beschreibung. */
  function teamMatches(matches, teamId) {
    return (matches || [])
      .filter(function (m) { return sameTeam(m.homeTeam, teamId) || sameTeam(m.guestTeam, teamId); })
      .slice()
      .sort(function (a, b) { return sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0; })
      .map(function (m) { return describeMatch(m, teamId); });
  }

  /** Nächstes Spiel: erstes nicht gespieltes, nicht abgesagtes Spiel ab "today" (YYYY-MM-DD). */
  function nextMatch(list, today) {
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d.played || d.status === 'cancelled' || d.status === 'forfeit') continue;
      if ((d.match.kickoffDate || '') >= today) return d;
    }
    return null;
  }

  /** Letzte n Ergebnisse (älteste zuerst), z. B. ['S','N','S']. */
  function form(list, n) {
    var played = list.filter(function (d) { return d.played; });
    return played.slice(-n).map(function (d) { return d.outcome; });
  }

  /** Bilanz aus den Spielen: Siege, Niederlagen, Körbe. */
  function record(list) {
    var r = { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
    list.forEach(function (d) {
      if (!d.played) return;
      r.played++;
      if (d.outcome === 'S') r.wins++;
      else if (d.outcome === 'N') r.losses++;
      r.pointsFor += d.own;
      r.pointsAgainst += d.opp;
    });
    return r;
  }

  /** Tabelleneintrag des Teams oder null. */
  function standingFor(tabelle, teamId) {
    var rows = tabelle || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && sameTeam(rows[i].team, teamId)) return rows[i];
    }
    return null;
  }

  /** Name des Teams aus Tabelle oder Spielen. */
  function teamName(doc, teamId) {
    var e = standingFor(doc.tabelle, teamId);
    if (e) return e.team.teamname;
    var ms = doc.matches || [];
    for (var i = 0; i < ms.length; i++) {
      if (sameTeam(ms[i].homeTeam, teamId)) return ms[i].homeTeam.teamname;
      if (sameTeam(ms[i].guestTeam, teamId)) return ms[i].guestTeam.teamname;
    }
    return null;
  }

  function clubIdOf(doc, teamId) {
    var e = standingFor(doc.tabelle, teamId);
    if (e && e.team.clubId != null) return e.team.clubId;
    var ms = doc.matches || [];
    for (var i = 0; i < ms.length; i++) {
      if (sameTeam(ms[i].homeTeam, teamId)) return ms[i].homeTeam.clubId;
      if (sameTeam(ms[i].guestTeam, teamId)) return ms[i].guestTeam.clubId;
    }
    return null;
  }

  /** Bevorzugte Liga: eine mit Tabelle, in der das Team steht; sonst eine mit Spielen; sonst die erste. */
  function pickPrimaryLiga(docs, teamId) {
    var withTable = docs.filter(function (d) { return standingFor(d.tabelle, teamId); });
    if (withTable.length) return withTable[0];
    var withMatches = docs.filter(function (d) { return teamMatches(d.matches, teamId).length > 0; });
    return withMatches[0] || docs[0] || null;
  }

  /** "2026-09-26", "18:30" → "Sa, 26.09.2026 · 18:30" */
  function formatKickoff(date, time) {
    var m = typeof date === 'string' && date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return time || '';
    var wd = WEEKDAYS[new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getDay()];
    return wd + ', ' + m[3] + '.' + m[2] + '.' + m[1] + (time ? ' · ' + time : '');
  }

  return {
    parseResult: parseResult,
    describeMatch: describeMatch,
    teamMatches: teamMatches,
    nextMatch: nextMatch,
    form: form,
    record: record,
    standingFor: standingFor,
    teamName: teamName,
    clubIdOf: clubIdOf,
    pickPrimaryLiga: pickPrimaryLiga,
    formatKickoff: formatKickoff
  };
});
