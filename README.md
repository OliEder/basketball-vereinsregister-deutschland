# Basketball Vereinsregister

Findet Basketballvereine und Teams in Deutschland — per Namens- oder Umkreissuche, mit aktuellen Tabellen und Spielplänen.

**Portal:** <https://olieder.github.io/basketball-vereinsregister-deutschland/>

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-olivermarcus.eder-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/olivermarcus.eder)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-OliEder-blue?logo=ko-fi)](https://ko-fi.com/OliEder)

Datenquelle: REST-API von [basketball-bund.net](https://www.basketball-bund.net). Beobachtungen zur API stehen in [docs/bbb-api.md](docs/bbb-api.md), die [OpenAPI-Spezifikation](https://github.com/OliEder/basketball-bund-api/blob/main/basketball-bund-net-api-V1.yaml) liegt in einem eigenen Repository. Koordinaten stammen von [Nominatim](https://nominatim.openstreetmap.org) (OpenStreetMap).

## Was das Portal kann

- **Suche** nach Vereinsname (Fuzzy) und im Umkreis eines Ortes, mit Kartenansicht
- **Vereinsseite** (`verein.html?id=<clubId>`): Teams mit Liga und Tabellenplatz, Hallen mit Karte, Links
- **Team-Seite** (`team.html?id=<teamPermanentId>`): Tabellenplatz, Bilanz, Form, nächstes Spiel, Tabelle und Spielplan (Alle/Heim/Auswärts); bei mehreren Wettbewerben (Liga, Pokal) ein Umschalter
- Das Portal ist **rein statisch** (GitHub Pages). Die Suche läuft im Browser, es gibt keinen Server und keinen CORS-Proxy.

## So hängt alles zusammen

```mermaid
flowchart LR
    BBB["basketball-bund.net<br/>REST-API"]
    CR["Monthly Crawler<br/>(1. des Monats)"]
    CJ["data/clubs.json<br/>Vereine, Teams, Hallen, Koordinaten"]
    LV["Live-Crawl<br/>(alle 6 Stunden)"]
    PG["GitHub Pages<br/>Portal + data/live/"]
    BBB --> CR --> CJ --> PG
    BBB --> LV --> PG
```

| Daten | Quelle | Aktualisierung | Ablage |
|---|---|---|---|
| Vereine, Teams, Hallen, Koordinaten | Monthly Crawler | monatlich | `data/clubs.json` (im Repo, wird committet) |
| Tabellen, Spielpläne | Live-Crawl pro Liga | alle 6 Stunden | `data/live/` (nur im Pages-Artefakt, nicht im Repo) |

Der Live-Crawl holt pro Liga **eine** Anfrage (`competition/spielplan/id/{ligaId}`), die Spiele und Tabelle liefert, und schreibt `liga/<id>.json`, `team-index.json` (Team → Ligen) und `index.json`. Zwischen zwei Läufen bleiben die zuletzt gecachten Live-Daten erhalten, auch bei Portaländerungen.

## GitHub Actions

| Workflow | Auslöser | Zweck |
|---|---|---|
| **Monthly Crawler** | 1. des Monats, manuell | `crawl` (Vereine/Teams, ohne Geocoding), danach `geocode` (fehlende Koordinaten); committet `data/clubs.json` |
| **Deploy GitHub Pages** | Push auf `main`, alle 6 Stunden, manuell | Live-Crawl (bei Zeitplan/manuell), baut das Pages-Artefakt aus `portal/`, `data/clubs.json` und `data/live/` |
| **Check Geocoding** | manuell | prüft alle Koordinaten per Namenssuche, nur Bericht |
| **Regeocode Clubs** | manuell | berechnet verdächtige Koordinaten neu (`scope=suspect\|all`); ohne `apply` nur Bericht auf dem Branch `regeocode-report`, mit `apply` wird `clubs.json` committet |
| **Accessibility (WCAG 2.2)** | Pull Requests auf `portal/**`, manuell | Playwright + axe-core gegen das Portal (Fixtures, Light/Dark) |
| **Probe Live Crawl** | manuell | misst Dauer und Drosselung der BBB-API |
| **Render AsciiDoc Documentation** | Änderungen an `docs/**/*.adoc` | erzeugt `docs/arc42/README.adoc` |

## Lokal entwickeln

```bash
npm install
npm test                     # Jest (TypeScript-Crawler) inkl. Portal-Logik
npx tsc --noEmit             # Typprüfung
```

Daten holen (die BBB-API wird mit 1 Anfrage pro Sekunde angesprochen, ein voller Crawl dauert deshalb lange):

```bash
npm run crawl -- --skip-geocoding   # Vereine und Teams → data/clubs.json
npm run geocode                     # fehlende Koordinaten (Nominatim)
npm run live -- --limit=50          # Live-Daten für 50 Ligen → _live/
```

Portal lokal ansehen — es braucht denselben Aufbau wie auf GitHub Pages:

```bash
mkdir -p _site/data
cp portal/* _site/
cp data/clubs.json _site/data/
[ -d _live ] && cp -r _live _site/data/live
python3 -m http.server -d _site 8080     # → http://localhost:8080
```

`npm run api` startet zusätzlich eine kleine Express-API mit Such-Endpunkten (`/search`, `/clubs/:id`, `/health`). Das Portal braucht sie nicht.

## Skripte

| Skript | Zweck |
|---|---|
| `npm run crawl` | Verbände → Ligen → Tabellen, ergänzt Club-Details, optional Geocoding (`--skip-geocoding`) |
| `npm run geocode` | geocodiert Vereine ohne Koordinaten (Kette siehe unten) |
| `npm run regeocode` | berechnet verdächtige Koordinaten neu, `--scope=suspect\|all`, `--apply` |
| `npm run check-geocoding` | vergleicht alle Koordinaten mit der Namenssuche, schreibt `geocoding-check.json` |
| `npm run live` | Live-Crawl pro Liga (`--out`, `--concurrency`, `--delay`, `--limit`) |
| `npm run test:a11y` | Barrierefreiheits-Tests (einmalig `npx playwright install chromium`) |
| `npm run probe-live` | Messung gegen die BBB-API |
| `npm run crawl-halls`, `geocode-halls`, `merge-halls` | Hallen holen, geocodieren, in `clubs.json` übernehmen |
| `npm run backfill-team-details` | holt `teamNumber`/`teamAkj` für Teams |
| `npm run fix-names` | repariert Vereinsnamen und Orte aus den Club-Details |

## Barrierefreiheit

`npm run test:a11y` prüft Startseite, Vereins- und Team-Seiten (Light/Dark) mit axe-core:

- **AA-Gate:** WCAG 2.0–2.2 A/AA dürfen keine Verstöße haben, dazu Tastatur-Fokus und Reflow bei 320 px.
- **AAA-Ratchet:** Verstöße gegen AAA (erhöhter Kontrast 7:1, Zielgröße 44 px) werden in `tests/a11y/aaa-baseline.json` festgehalten und dürfen nur sinken. Offen: Kontrast des `.hero-badge` (6,34:1) und drei kleine Klickziele. Baseline neu schreiben: `UPDATE_A11Y_BASELINE=1 npm run test:a11y`.
- Automatische Tests decken nur einen Teil von WCAG ab; Kriterien wie 3.1.5 (Lesbarkeit) brauchen eine manuelle Prüfung.

## Geocoding

Für Vereine ohne Koordinaten gilt diese Reihenfolge (`crawler/club-geocoder.ts`):

1. **Namenssuche** bei Nominatim, nur plausible Treffer. Liegt der Treffer in einem anderen Ort als die sichere Heimhalle, gilt die Halle.
2. **Heimhalle**: alle Hallen im selben Ort → dieser; Hallenort im Vereinsnamen → dieser; sonst die Mehrheit.
3. **Ort aus dem Vereinsnamen**, nur wenn er als Ort taugt (keine Kürzel, Zahlen, Allerweltswörter).

Gleichnamige Club-IDs (z. B. ALBA Berlin) bekommen im Regeocode dieselbe Koordinate, sofern ihre Ergebnisse höchstens 15 km auseinander liegen. Eine von mehreren Club-IDs genutzte Halle ist nie ein Grund, eine Koordinate abzulehnen. Details: [Kapitel 8 der Architekturdokumentation](docs/arc42/08-querschnittliche-konzepte.adoc).

## Projektstruktur

```
crawler/    BBB-Crawler, Geocoding, Live-Crawl (TypeScript)
portal/     statisches Frontend (HTML/CSS/JS, kein Build-Schritt)
api/        optionale lokale Express-API
data/       clubs.json (versioniert), Schemas, clubs-enriched.json (nur für die API)
docs/arc42/ Architekturdokumentation (arc42, AsciiDoc)
tests/      Jest-Tests
.github/    Workflows
```

## Hinweise

- Die BBB-API wird mit Pausen angesprochen (Crawler 1 Anfrage pro Sekunde, Live-Crawl wenige parallele Anfragen mit Pause). Nominatim erlaubt höchstens 1 Anfrage pro Sekunde.
- Vereine ohne aktive Liga tauchen nicht auf.
- Logos werden direkt von basketball-bund.net verlinkt.
- Von Vereinen werden Name, Ort/Koordinate, Teams und Hallen gespeichert, keine Straßenadressen von Vereinssitzen oder Personen.
- Datenstand und Architekturentscheidungen: [`docs/arc42`](docs/arc42/index.adoc)
