# Basketball Vereinsregister

Findet Basketballvereine in Deutschland — per Namenssuche oder Umkreissuche.

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-olivermarcus.eder-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/olivermarcus.eder)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-OliEder-blue?logo=ko-fi)](https://ko-fi.com/OliEder)

Datenquelle: [basketball-bund.net](https://www.basketball-bund.net) API

## Quick Start

### 1. Dependencies installieren
npm install

### 2. Crawler ausführen (einmalig, dauert ~30-60 Minuten wegen Rate-Limiting)
npm run crawl

### 3. API starten
npm run api

### 4. Portal öffnen
→ http://localhost:3000

## Verein anreichern

Datei `data/clubs-enriched.json` editieren — alle Felder außer `clubId` sind optional:

[
  {
    "clubId": 428,
    "website": "https://mein-verein.de",
    "email": "info@mein-verein.de",
    "phone": "+49 941 123456",
    "address": {
      "street": "Musterstraße 1",
      "zip": "12345",
      "city": "Musterstadt"
    },
    "info": "Freier Infotext — Trainingszeiten, Halle, neue Spieler willkommen etc.",
    "logoUrl": "https://mein-verein.de/logo.png"
  }
]

Die `clubId` findest du über die Suche im Portal oder auf basketball-bund.net.

## API-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| GET /search?name=Baskets | Namenssuche (Fuzzy) |
| GET /search?near=Regensburg&radius=25 | Umkreissuche (km, default 25) |
| GET /search?name=Baskets&near=München&radius=50 | Kombination |
| GET /clubs/:clubId | Einzelner Verein |
| GET /health | Status (Anzahl Vereine, letzter Crawl) |

## Tests

npm test

## Projektstruktur

crawler/    — BBB-API Crawler
api/        — Express-API
portal/     — Vanilla-Frontend (HTML/CSS/JS)
data/       — Vereinsdaten (clubs-enriched.json wird versioniert)

## Hinweise

- Der Crawler läuft ~30-60 Minuten (Rate-Limiting: 1 req/sek BBB-API + Nominatim)
- Vereine ohne aktive Liga tauchen nicht auf
- Logos werden direkt von basketball-bund.net verlinkt (rechtlich sauber)
- Cron-Empfehlung: Wöchentlich neu crawlen
