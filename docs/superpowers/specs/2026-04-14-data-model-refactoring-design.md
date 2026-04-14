# Vereinsregister — Datenmodell-Refactoring Design Spec

**Datum:** 2026-04-14
**Status:** Approved
**Projekt:** 03-Vereinsregister

---

## Ziel

Das Datenmodell wird um Teams und Hallen erweitert. Zielgruppe: Interessierte Spieler oder Eltern die einen Verein für sich oder ihr Kind suchen — mit Informationen zu Altersklassen, Geschlecht, Trainingszeiten und -stätten.

---

## Datenmodell

### `clubs.json` — erweiterter ClubEntry

```json
{
  "clubId": 4468,
  "name": "Fibalon Baskets Neumarkt",
  "vereinsnummer": "0232382",
  "verbandId": 2,
  "verbandName": "Bayern",
  "lat": 49.28,
  "lng": 11.46,
  "geocodedFrom": "Neumarkt",
  "logoUrl": "https://www.basketball-bund.net/media/team/167890/logo",
  "lastCrawled": "2026-04-14T00:00:00Z",
  "halls": [
    {
      "id": 1,
      "dbbSpielfeldId": 105061,
      "bezeichnung": "Mittelschule West",
      "strasse": "Woffenbacher Str. 38",
      "plz": "92318",
      "ort": "Neumarkt"
    }
  ],
  "teams": [
    {
      "teamPermanentId": 167890,
      "altersklasse": "Senioren",
      "geschlecht": "männlich",
      "training": [
        { "wochentag": "Dienstag", "von": "19:00", "bis": "21:00", "hallId": 1 },
        { "wochentag": "Donnerstag", "von": "17:00", "bis": "19:00", "hallId": 1 }
      ]
    }
  ]
}
```

**Felder:**
- `halls[].id` — interne ID, stabil, auto-increment
- `halls[].dbbSpielfeldId` — BBB-Spielfeld-ID aus matchInfo, `null` für manuell angelegte Hallen
- `teams[].altersklasse` — aus BbbLiga-Metadaten (`akName`: "Senioren", "U16", etc.)
- `teams[].geschlecht` — aus BbbLiga-Metadaten ("männlich", "weiblich", "mix")
- `teams[].training` — ausschließlich manuell via `clubs-enriched.json`
- `teams[].training[].hallId` — Referenz auf `halls[].id` im selben Club-Objekt

### `clubs-enriched.json` — manuell pflegbar

Alle Felder optional außer `clubId`. Ergänzt und überschreibt auto-gecrawlte Daten.

```json
{
  "clubId": 4468,
  "website": "https://fibalon-baskets.de",
  "email": "info@fibalon-baskets.de",
  "phone": "+49 9181 123456",
  "address": {
    "street": "Bajuwarenstr. 4",
    "zip": "93053",
    "city": "Neumarkt"
  },
  "info": "Wir freuen uns über neue Spieler!",
  "halls": [
    {
      "id": "local-1",
      "dbbSpielfeldId": null,
      "bezeichnung": "Turnhalle Nord",
      "strasse": "Musterstr. 1",
      "plz": "92318",
      "ort": "Neumarkt"
    }
  ],
  "teams": [
    {
      "teamPermanentId": 167890,
      "training": [
        { "wochentag": "Dienstag", "von": "19:00", "bis": "21:00", "hallId": 1 },
        { "wochentag": "Donnerstag", "von": "17:00", "bis": "19:00", "hallId": "local-1" }
      ]
    }
  ]
}
```

### Merge-Logik

1. **Skalar-Felder** (`name`, `website`, `email` etc.): enriched überschreibt base
2. **`halls`**: enriched-Hallen werden zu auto-Hallen hinzugefügt, Deduplizierung nach `id`
3. **`teams`**: Merge über `teamPermanentId` — enriched-Felder (`training`) ergänzen auto-Felder (`altersklasse`, `geschlecht`). Enriched überschreibt nicht `altersklasse`/`geschlecht`.

---

## JSON Schema

**Pfad:** `data/schemas/`

```
club.schema.json          ← einzelner ClubEntry (auto + enriched gemergt)
club-enriched.schema.json ← ClubEnriched (alle Felder optional außer clubId)
clubs.schema.json         ← Array<ClubEntry>
```

**Standard:** JSON Schema Draft-2020-12, Validierung via `ajv@8` mit `ajv/dist/2020`.

**Relevante Constraints:**
- `halls[].id`: string oder integer, required
- `halls[].dbbSpielfeldId`: integer oder null
- `teams[].training[].wochentag`: enum ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"]
- `teams[].training[].von` / `bis`: format "time" (HH:mm)
- `teams[].training[].hallId`: muss auf eine existierende `halls[].id` im selben Club zeigen (Warnung, kein hard error)
- `unevaluatedProperties: false` — keine unbekannten Felder

**Validierung:**
- `writer.ts`: validiert `clubs-enriched.json` beim Einlesen — invalide Einträge werden übersprungen und geloggt
- `server.ts`: validiert `clubs.json` beim Start — loggt Warnungen, startet trotzdem
- Schema-Dateien werden nach `_site/data/schemas/` deployt (via `pages.yml`)

---

## Crawler-Refactoring

### Neue Datei-Struktur

```
crawler/
  index.ts          ← orchestriert Phasen 1-4
  bbb-client.ts     ← + getSpielplan(), getMatchInfo()
  extractor.ts      ← + extractTeams(), extractSpielfeld()
  geocoder.ts       ← unverändert
  writer.ts         ← + ajv-Validierung
  geocode.ts        ← standalone, unverändert
  fix-names.ts      ← einmalig, bleibt für Referenz
  crawl-halls.ts    ← initialer Hall-Crawl (lokal, einmalig)
  merge-halls.ts    ← halls-raw.json → clubs.json
```

### Crawler-Phasen (monatlich)

**Phase 1: Tabellen-Crawl**
- Verbände → Ligen → Tabellen
- Pro Liga: `altersklasse` + `geschlecht` aus Liga-Metadaten
- Pro Club: `Set<teamPermanentId>` akkumulieren + `altersklasse`/`geschlecht` pro Team

**Phase 2: Club-Details (nur neue `clubId`s)**
- `/rest/club/id/{clubId}/actualmatches` → `vereinsname`, `vereinsnummer`
- `extractCityFromName(vereinsname)` → `geocodedFrom`

**Phase 3: Geocoding (nur `lat === null`)**
- Nominatim, unverändert

**Phase 4: Halls (nur neue `clubId`s, monatlich)**
- Pro Team: Spielplan laden → erstes Heimspiel dessen Datum noch nicht für diesen Club verwendet wurde
- `matchInfo`-Call → `spielfeld`-Objekt extrahieren
- Direkt in `clubs.json` mergen (kein `halls-raw.json` im monatlichen Cron)

### Initialer Hall-Crawl (`crawl-halls.ts`, lokal, einmalig)

Für alle 1725 bestehenden Vereine:
1. Pro Club: `usedDates = Set<string>`
2. Pro Team: Spielplan → erstes Heimspiel mit Datum nicht in `usedDates` → `matchInfo` → Spielfeld
3. `usedDates.add(kickoffDate)`
4. Ergebnis: `data/halls-raw.json` (gitignored)

Anschließend `merge-halls.ts` ausführen → Spielfelder in `clubs.json` als `halls[]` mergen.

**Entscheidung: `halls-raw.json` gitignored** — nur `clubs.json` mit gemergten Hallen kommt ins Repo. So kann das Ergebnis vor dem Commit manuell geprüft werden.

---

## Portal-Anpassungen

### Vereinskarte — neue Sektionen

```
[Logo] Fibalon Baskets Neumarkt
       Bayern · Neumarkt · 3.2 km entfernt

       Teams:
       ├── Senioren Herren
       │   Di 19:00–21:00 · Mittelschule West, Woffenbacher Str. 38
       │   Do 17:00–19:00 · Turnhalle Nord
       ├── U16 Herren
       │   Mi 17:00–19:00 · Mittelschule West
       └── U14 Mixed
           (keine Trainingszeiten hinterlegt)

       🌐 fibalon-baskets.de  📧 ...  📞 ...
       ℹ️ "Wir freuen uns über neue Spieler!"
       Club-ID: 4468  📋
```

**Regeln:**
- Teams ohne Trainingszeiten: Altersklasse + Geschlecht + "(keine Trainingszeiten hinterlegt)"
- Hallname verlinkt Google Maps wenn Adresse vorhanden (`bezeichnung, strasse, plz ort`)
- `Club-ID: 4468 📋` — Copy-to-Clipboard, dezent unter den Kontaktlinks
- BBB-Link (`/vereinDetail/id/{clubId}`) wird entfernt — URL führt zu "Seite nicht gefunden"

### Filterung (V1, optional)
Keine aktive Filterung nach Altersklasse/Geschlecht im Portal — Teams werden einfach aufgelistet. Filterung ist V2.

---

## Bekannte Einschränkungen

- **Hallenvollständigkeit:** Nur Spielhallen aus matchInfo, keine Trainingshallen ohne Spielbetrieb. Trainingshallen müssen manuell via `clubs-enriched.json` gepflegt werden.
- **Hallenredundanz:** Dieselbe Halle kann bei mehreren Vereinen eingebettet sein. Umbenennung muss mehrfach gepflegt werden — bewusste Entscheidung für V1, zentrale Hallen-DB ist V2.
- **`hallId`-Referenz-Validierung:** ajv kann keine cross-array Referenzen erzwingen. Ungültige `hallId` wird nur als Warnung geloggt, nicht als hard error.
- **Altersklasse/Geschlecht nur aus aktiven Ligen:** Teams die in keiner aktiven Liga spielen haben keine `altersklasse`/`geschlecht`.

---

## V2-Ideen (bewusst ausgeklammert)

- Filterung im Portal nach Altersklasse/Geschlecht
- Zentrale Hallen-DB mit Deduplizierung
- Admin-Interface für Vereins-Anreicherung
- Team-Detailansicht (Liga, Tabellenplatz, Top-Spieler)
