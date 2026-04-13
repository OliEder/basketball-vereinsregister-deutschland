# Vereinsregister — Design Spec

**Datum:** 2026-04-13  
**Status:** Approved  
**Projekt:** 03-Vereinsregister

---

## Ziel

Basketballvereine in Deutschland sind schwer zu finden. Die BBB-API (basketball-bund.net) hat keinen direkten Vereins-Such-Endpunkt — man braucht immer eine `clubId` vorab. Das Vereinsregister löst dieses Problem durch:

1. Einen **Crawler**, der Vereinsdaten aus der BBB-API erntet und als `clubs.json` speichert
2. Eine **Express-API**, die Namens- und Umkreissuche auf dieser Datenbasis anbietet
3. Ein **Portal** (Vanilla HTML/JS), das die Suche für Endnutzer zugänglich macht

Vereine können ihre Daten manuell anreichern (Website, Adresse, Kontakt, Info-Text).

---

## Architektur

Monorepo mit drei klar getrennten Modulen:

```
03-Vereinsregister/
├── crawler/
│   ├── index.ts          # Einstiegspunkt, orchestriert den Crawl
│   ├── bbb-client.ts     # HTTP-Calls gegen BBB-API
│   ├── extractor.ts      # Vereinsdaten aus Responses extrahieren
│   ├── geocoder.ts       # Ortsname → Koordinaten via Nominatim
│   └── writer.ts         # clubs.json schreiben/mergen
├── api/
│   ├── server.ts         # Express-Server
│   ├── routes/
│   │   └── search.ts     # Such-Endpunkte
│   └── search-engine.ts  # Fuzzy-Suche + Haversine-Umkreis
├── portal/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   ├── clubs.json          # Auto-generiert vom Crawler
│   └── clubs-enriched.json # Manuell gepflegt
├── package.json
└── tsconfig.json
```

**Datenfluss:**
1. Crawler läuft (manuell oder wöchentlich per Cron) → schreibt `data/clubs.json`
2. API-Server startet → lädt beide JSON-Dateien, mergt sie (enriched überschreibt base)
3. Portal → spricht API an → zeigt Ergebnisse

---

## Datenmodell

### `clubs.json` — ein Eintrag (auto-generiert)

```json
{
  "clubId": 428,
  "name": "Fibalon Baskets Regensburg",
  "verbandId": 2,
  "verbandName": "Bayern",
  "lat": 49.0134,
  "lng": 12.1016,
  "geocodedFrom": "Regensburg",
  "logoUrl": "https://www.basketball-bund.net/media/team/1234/logo",
  "lastCrawled": "2026-04-13T10:00:00Z"
}
```

### `clubs-enriched.json` — ein Eintrag (manuell gepflegt)

Alle Felder optional. `clubId` ist der einzige Pflichtschlüssel zum Mergen.

```json
{
  "clubId": 428,
  "logoUrl": "https://fibalon-baskets.de/logo.png",
  "website": "https://fibalon-baskets.de",
  "email": "info@fibalon-baskets.de",
  "phone": "+49 941 123456",
  "address": {
    "street": "Bajuwarenstr. 4",
    "zip": "93053",
    "city": "Regensburg"
  },
  "info": "Wir trainieren dienstags 19-21 Uhr (Senioren) und donnerstags 17-19 Uhr (U16). Halle: Pestalozzischule. Neue Spieler willkommen!"
}
```

**Merge-Logik:** Felder aus `clubs-enriched.json` überschreiben gleichnamige Felder aus `clubs.json`. `address.city` aus enriched wird bevorzugt für Geocoding genutzt.

---

## Crawler

### Strategie

Die BBB-API hat keinen "alle Vereine"-Endpunkt. Vereinsdaten werden indirekt aus Liga-Tabellen geerntet.

### Ablauf

1. `GET /rest/wam/data` → alle Verbände laden
2. Für jeden Verband: `POST /rest/wam/liga/list` (paginiert, `startAtIndex`) → alle Ligen sammeln
3. Für jede Liga: `GET /rest/competition/table/id/{ligaId}` → Teams mit `clubId`, `clubName`, `teamPermanentId` extrahieren
4. Pro Verein (dedupliziert nach `clubId`):
   - Ortsname-Heuristik: letztes Wort im Vereinsnamen, Fallback: vollständiger Name
   - Optional: Heimspielstätten-Ort aus Spielplan (`/rest/competition/spielplan/id/{ligaId}`) als präziserer Geocoding-Anhaltspunkt
   - Nominatim-Geocoding → `lat`, `lng`
   - `logoUrl` aus `teamPermanentId` des ersten gefundenen Teams
5. Bestehende `clubs.json` updaten: neue Einträge hinzufügen, bestehende aktualisieren, keine löschen

### Rate Limiting

- BBB-API: max. 1 Request/Sekunde
- Nominatim: max. 1 Request/Sekunde (Policy-Pflicht), User-Agent setzen

### Cron

Wöchentlich reicht — Vereinsdaten ändern sich selten.

---

## API-Endpunkte

Basis-URL: `http://localhost:3000`

### `GET /search?name=<query>`

Fuzzy-Namenssuche, case-insensitive, toleriert Tippfehler.

```
GET /search?name=Regensburg
```

```json
{
  "results": [...],
  "total": 3
}
```

### `GET /search?near=<Ortsname>&radius=<km>`

Server geocodiert den Ortsnamen via Nominatim → Haversine-Distanz gegen alle Vereine. Default-Radius: 25km. Ergebnisse sortiert nach Distanz aufsteigend, inkl. `distanceKm`-Feld.

```
GET /search?near=Hinterdupfing&radius=30
```

### Kombination

Beide Parameter kombinierbar: `?name=Baskets&near=München&radius=50` — erst Umkreis filtern, dann Namenssuche.

### `GET /clubs/:clubId`

Vollständiger gemergter Datensatz eines Vereins.

### `GET /health`

```json
{
  "status": "ok",
  "clubCount": 1842,
  "lastCrawled": "2026-04-07T02:00:00Z"
}
```

---

## Portal

Einzelne Seite (`index.html`), Vanilla HTML/CSS/JS, mobile-first.

### UI

```
[ 🔍 Vereinsname...            ] [ Suchen ]
            — oder —
[ 📍 Mein Ort...  ] [ 25km ▼ ] [ In der Nähe suchen ]
```

### Ergebniskarte

```
[Logo] Fibalon Baskets Regensburg
       Bayern · Regensburg · 3.2 km entfernt
       🌐 fibalon-baskets.de  📧 info@...  📞 ...
       ℹ️ "Wir trainieren dienstags..."
       [ Auf basketball-bund.net ansehen ]
```

### Verhalten

- Namenssuche: live während Tippen, debounced, ab 3 Zeichen
- Umkreissuche: auf Button-Klick (wegen Geocoding-Request)
- "Auf basketball-bund.net ansehen" → `https://www.basketball-bund.net/vereinDetail/id/{clubId}`
- Felder die nicht vorhanden sind werden nicht angezeigt

---

## Bekannte Einschränkungen

- **Geocoding-Qualität:** Ortsname-Extraktion aus Vereinsname ist eine Heuristik — bei ungewöhnlichen Namen kann sie fehlschlagen. Manuelles Überschreiben via `clubs-enriched.json` möglich.
- **Logos:** Von basketball-bund.net direkt verlinkt — rechtlich sauber, aber abhängig von deren Verfügbarkeit. Vereine können eigene Logo-URL in `clubs-enriched.json` hinterlegen.
- **CORS:** BBB-API-Requests nur server-seitig (Crawler, API). Logos als `<img src>` sind CORS-frei.
- **Vollständigkeit:** Vereine die in keiner aktiven Liga spielen tauchen nicht auf.

---

## V2-Ideen (bewusst ausgeklammert)

- Adresse per Web-Scraping der Vereinswebsite automatisch befüllen
- Admin-Interface für Vereins-Anreicherung (mit einfacher Auth)
- Logos lokal cachen (wenn rechtlich geklärt)
