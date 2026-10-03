# BBB-REST-API (basketball-bund.net)

Beobachtungen aus dem Reverse Engineering der öffentlichen API, Stand 29. Oktober 2025. Die API ist nicht offiziell dokumentiert; Felder und Verhalten können sich ändern.

- **Basis-URL:** `https://www.basketball-bund.net/rest`
- **Authentifizierung:** keine
- **OpenAPI-Spezifikation:** [basketball-bund-net-api-V1.yaml](https://github.com/OliEder/basketball-bund-api/blob/main/basketball-bund-net-api-V1.yaml)
- **Rate-Limit:** nicht dokumentiert; wir halten uns an höchstens 1 Request pro Sekunde (Crawler: 300 ms Pause bei 4 parallelen Läufen im Live-Crawl, siehe `crawler/live.ts`).
- **CORS:** Browser-Requests brauchen einen Proxy. Das Portal ruft die API deshalb nie direkt auf, sondern liest statische Dateien.

## Antwort-Hülle

Alle Endpunkte liefern dasselbe Format:

```typescript
interface ApiResponse<T> {
  timestamp: string;        // "2025-10-17T17:12:38+0200"
  status: string;           // "0" = Erfolg, "1" = Fehler (Details in message)
  message: string;
  data: T;
  version: string;          // z. B. "11.42.2-b100829"
  dateFormat: string;       // "yyyy-MM-dd"
  timeFormat: string;       // "yyyy-MM-dd'T'HH:mm:ssZ"
  timeFormatShort: string;  // "HH:mm"
  serverInstance: string;
  username: string | null;
  appContext: string;
}
```

## Fallstricke

- **Booleans können `null` sein:** `verzicht`, `abgesagt`, `ergebnisbestaetigt`, `tableExists`, `crossTableExists`, `hasPlayByPlay`, `anonym`. Prüfe auf `=== true` oder nutze `?? false`; `!match.abgesagt` trifft bei `null` und `false` zu.
- **Ergebnis** ist ein String `"heim:gast"` (z. B. `"36:62"`), `null` vor dem Spiel.
- **Datum und Zeit** stehen getrennt in `kickoffDate` (`YYYY-MM-DD`) und `kickoffTime` (`HH:MM`), kein ISO-Zeitstempel.
- **Team-IDs:** `teamPermanentId` bleibt über Saisons gleich. `seasonTeamId` und `teamCompetitionId` ändern sich pro Saison.
- **Anonymisierung (U8–U14):** `person.anonym === true`, `vorname: "***"`, `nachname: "****"`, `playerId: 0`, `no: "**"`.
- **Statistiken sind oft leer:** `attempted: 0.0` und `quota: null`, Rebounds, Assists, Steals und Blocks meist `0.0`.
- **Platzhalter-Teams:** Pokal-Setzlisten ("Sieger X/Y") haben keine `clubId`.
- **`ligaData`** steht bei Tabelle und Spielplan oben in `data`, in jedem Spiel steht es je nach Endpunkt `null` oder noch einmal.

## WAM (Filter und Ligensuche)

### `POST /wam/data` – Filteroptionen

```json
{ "token": 0, "verbandIds": [], "gebietIds": [], "ligatypIds": [],
  "akgGeschlechtIds": [], "altersklasseIds": [], "spielklasseIds": [] }
```

Die Antwort enthält in `data` die Listen `verbaende`, `gebiete`, `altersklassen`, `spielklassen` (jeweils mit `id`, `label` und `hits` als Anzahl passender Ligen) sowie `ligaListe` mit den ersten 10 Ligen. Gebiete haben IDs wie `4_` (Bayern: `1_` Oberbayern bis `6_` Unterfranken). Der Crawler liest daraus `verbaende`.

### `POST /wam/liga/list?startAtIndex={offset}`

Gleicher Request-Body wie oben, gefiltert. Die Antwort `data.ligaListe` enthält `ligen`, `hasMoreData` und `size`. Die Seitengröße ist 10, weitere Seiten über `startAtIndex`.

Eine Liga enthält u. a.:

| Feld | Bedeutung |
|---|---|
| `ligaId`, `liganame`, `liganr` | Kennung und Name, z. B. `51961` „U10m Bezirksliga Oberpfalz“ |
| `seasonId`, `seasonName` | z. B. `2025`, „2025/2026“ |
| `skName`, `skEbeneId`, `skEbeneName` | Spielklasse und Ebene („Verband“, „Bezirk“, „Kreis“) |
| `akName`, `geschlechtId`, `geschlecht` | Altersklasse und Geschlecht |
| `verbandId`, `verbandName` | Landesverband bzw. Wettbewerbsgruppe |
| `bezirknr`, `bezirkName` | Bezirk (z. B. 4, „Oberpfalz“), sonst `null` |
| `kreisnr`, `kreisname` | Kreis, nur bei Kreisligen gesetzt, sonst `null` |
| `tableExists`, `crossTableExists` | Tabelle bzw. Kreuztabelle vorhanden |
| `statisticType` | `0` volle, `1` reduzierte Statistik (U8–U14) |

Wir speichern `skEbeneName`, `bezirkName` und `kreisname` pro Team als `ebene`, `bezirk` und `kreis` (siehe arc42, Kapitel 8).

## Competition

| Endpunkt | Inhalt |
|---|---|
| `POST /competition/list` (Body: Array von Liga-IDs) | Liga-Details |
| `GET /competition/table/id/{ligaId}` | Tabelle in `data.tabelle.entries`, dazu `data.ligaData` |
| `GET /competition/spielplan/id/{ligaId}` | alle Spiele in `data.matches`, dazu `data.ligaData` |
| `GET /competition/crosstable/id/{ligaId}` | Kreuztabelle, nur wenn `crossTableExists` |
| `GET /competition/id/{ligaId}/matchday/{n}` | ein Spieltag mit `prevSpieltag`, `selSpieltag`, `nextSpieltag`; ohne `n` der aktuelle |
| `GET /competition/actual/id/{ligaId}` | laufende Spiele mit Zwischenständen |
| `GET /competition/teamstatistic/id/{ligaId}` | Teamstatistik, nur bei Ligen mit Spielstatistik |

### Tabelleneintrag

```json
{ "rang": 1,
  "team": { "seasonTeamId": 429535, "teamCompetitionId": 429535, "teamPermanentId": 311275,
            "teamname": "BBC Coburg", "teamnameSmall": "CB", "clubId": 4575, "verzicht": false },
  "anzspiele": 4, "anzGewinnpunkte": 8, "anzVerlustpunkte": 0,
  "s": 4, "n": 0, "koerbe": 362, "gegenKoerbe": 271, "korbdiff": 91 }
```

### Spiel (Spielplan)

`matchId`, `matchDay`, `matchNo`, `kickoffDate`, `kickoffTime`, `homeTeam`, `guestTeam`, `result`, `ergebnisbestaetigt`, `verzicht`, `abgesagt`. `matchResult`, `matchInfo`, `matchBoxscore` und `playByPlay` sind im Spielplan `null`.

Ableitung des Status:

```typescript
if (match.abgesagt === true) return 'abgesagt';
if (match.result == null) return 'geplant';
return match.ergebnisbestaetigt === true ? 'beendet' : 'vorläufig';
```

### Kreuztabelle

`kreuztabelle.teams` ist die Teamliste, `crossTable[i][j]` das Spiel „Team i (Heim) gegen Team j (Gast)“ als `{ home, result, matchId }`.

### Teamstatistik

`teamStatistik.statisticEntries[]` enthält `pts`, `twoPoints`, `threePoints`, `wt` (Feldwürfe gesamt), `onePoints` (Freiwürfe), `ro/rd/rt`, `as`, `st`, `to`, `bs`, `fouls`, `eff` und `tableTeamEntry`. `stand` ist das Datum der letzten Aktualisierung.

| Zuverlässigkeit | Felder |
|---|---|
| immer erfasst | `pts`, `made` der Würfe, `fouls`, `eff` |
| meist erfasst | `onePoints.attempted` |
| selten erfasst | `twoPoints.attempted`, `threePoints.attempted` |
| sehr selten | `ro`, `rd`, `rt`, `as`, `st`, `to`, `bs` |

Es gilt `wt.made = twoPoints.made + threePoints.made` und `pts = 2·twoPoints.made + 3·threePoints.made + onePoints.made`. `quota` ist `null`, wenn `attempted` `0` ist.

## Match

| Endpunkt | Inhalt |
|---|---|
| `GET /match/id/{matchId}` | Spiel wie im Spielplan |
| `GET /match/id/{matchId}/matchInfo` | zusätzlich `matchInfo.spielfeld` (Halle mit Adresse) und `srList` (Schiedsrichter, ggf. anonym) |
| `GET /match/id/{matchId}/boxscore` | `matchResult` (Viertel-, Halbzeit-, Overtime-Stände) und `matchBoxscore` (Spieler- und Teamwerte) |

Die Halle eines Spiels steht nur in `matchInfo.spielfeld`, nicht im Spielplan. Genau daraus bauen wir die Heimhallen der Vereine.

## Team und Verein

| Endpunkt | Inhalt |
|---|---|
| `GET /team/id/{teamPermanentId}/matches` | alle Spiele eines Teams (vergangene und zukünftige) |
| `GET /club/id/{clubId}/actualmatches?justHome={bool}&rangeDays={n}` | Spiele eines Vereins, enthält `club.vereinsname` und `club.vereinsnummer` |

## Filter-IDs

### Verbände (`verbandIds`)

| ID | Name | ID | Name |
|---:|---|---:|---|
| 1 | Baden-Württemberg | 11 | Nordrhein-Westfalen |
| 2 | Bayern | 12 | Mecklenburg-Vorpommern |
| 3 | Berlin | 13 | Sachsen-Anhalt |
| 4 | Bremen | 14 | Brandenburg |
| 5 | Hamburg | 15 | Sachsen |
| 6 | Hessen | 16 | Thüringen |
| 7 | Niedersachsen | 29 | Deutsche Meisterschaften |
| 8 | Rheinland-Pfalz | 30 | Regionalliga Nord |
| 9 | Saarland | 31 | Regionalliga Südwest |
| 10 | Schleswig-Holstein | 32 | Regionalliga Südost |
| 33 | Regionalliga West | 40 | Deutscher Rollstuhlbasketball |
| 100 | Bundesligen | | |

Die ersten zwei Ziffern der Vereinsnummer (`01`–`16`) entsprechen den Verbands-IDs 1–16.

### Altersklassen (`altersklasseIds`)

`1` Senioren, `8`–`20` U8 bis U20 (die ID entspricht der Zahl), `30` Ü30, `32` Ü35, `40` Ü40, `45` Ü45, `50` Ü50, `55` Ü55.

### Altersklasse und Geschlecht (`akgGeschlechtIds`)

`2_1` Jugend männlich, `2_2` Jugend weiblich, `3_1` Senioren männlich, `3_2` Senioren weiblich.

### Geschlecht (`geschlechtId`)

`1` männlich, `2` weiblich, `3` mix.

### Gebiete (`gebietIds`), Beispiel Bayern

`1_` Oberbayern, `2_` Schwaben, `3_` Mittelfranken, `4_` Oberpfalz, `5_` Oberfranken, `6_` Unterfranken.

### Spielklassen (`spielklasseIds`)

Als Filter kaum brauchbar, weil jeder Verband eigene Spielklassen definiert. Die Liste steht in `data.spielklassen` der ungefilterten `wam/data`-Antwort. Beispiele: `100` 1. Bundesliga, `101` 2. Bundesliga, `105` Regionalliga, `110` Bezirksliga, `115` Oberliga, `125` Kreisliga, `315` Bayernliga, `320` Bezirksliga (Bayern), `338` Bezirksoberliga.

## Beispielablauf

```typescript
// 1. Verbände holen
const wam = await post('/wam/data', { token: 0 });
// 2. Ligen eines Verbands seitenweise holen
const page = await post('/wam/liga/list?startAtIndex=0', { token: 0, verbandIds: [2] });
// 3. Tabelle und Spielplan einer Liga
const table = await get(`/competition/table/id/${ligaId}`);
const plan = await get(`/competition/spielplan/id/${ligaId}`);
// 4. Halle eines Spiels
const info = await get(`/match/id/${matchId}/matchInfo`);
const halle = info.data.matchInfo.spielfeld;
```
