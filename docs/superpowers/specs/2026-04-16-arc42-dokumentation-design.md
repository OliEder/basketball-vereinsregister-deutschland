# Design Spec: ARC42 Architekturdokumentation

**Datum:** 2026-04-16  
**Status:** Approved

---

## Überblick

Eine vollständige ARC42-Architekturdokumentation für das Basketball Vereinsregister Deutschland. Zielgruppen: der Autor selbst (Gedächtnisstütze, Entscheidungshistorie) und externe Entwickler / Contributor (Onboarding, Open Source).

---

## Dateistruktur

```
docs/arc42/
├── index.adoc                              — Einstiegspunkt, includes alle Kapitel
├── 01-einfuehrung-und-ziele.adoc
├── 02-randbedingungen.adoc
├── 03-kontextabgrenzung.adoc
├── 04-loesungsstrategie.adoc
├── 05-bausteinsicht.adoc
├── 06-laufzeitsicht.adoc
├── 07-verteilungssicht.adoc
├── 08-querschnittliche-konzepte.adoc
├── 09-architekturentscheidungen.adoc
├── 10-qualitaetsanforderungen.adoc
├── 11-risiken-und-technische-schulden.adoc
└── 12-glossar.adoc
```

---

## Format & Technologie

- **Format:** AsciiDoc (`.adoc`)
- **Diagramme:** Mermaid für einfache Diagramme (Datenfluss, Sequenzen, einfache Komponentenübersichten), PlantUML für komplexere Strukturdiagramme (Bausteinsicht, Komponentendiagramme)
- **Einbettung:** `[mermaid]` bzw. `[plantuml]` Blöcke direkt in den AsciiDoc-Dateien
- **Sprache:** Deutsch durchgehend (Überschriften, Inhalte, Diagramm-Labels)
- **Rendering:** GitHub/GitLab Preview (kein Build-System)

---

## Kapitelinhalte

### 01 — Einführung und Ziele
- Aufgabenstellung: Basketballvereine in Deutschland auffindbar machen
- Qualitätsziele: Aktualität der Daten, Verfügbarkeit des Portals, Einfachheit der Architektur
- Stakeholder: Endnutzer (Vereinssuche), Entwickler, DBB/BBB (Datenquelle)

### 02 — Randbedingungen
- Technische Randbedingungen: BBB-API als einzige Datenquelle, kein offizielles API-Vertrag, Node.js/TypeScript Stack
- Organisatorische Randbedingungen: Open Source, kein Budget, ein Maintainer
- Konventionen: Semver, Conventional Commits, GitHub Actions für Deployment

### 03 — Kontextabgrenzung
- **Systemkontext-Diagramm (Mermaid):** Vereinsregister ↔ BBB-API, Nominatim, Browser-Nutzer, GitHub Pages
- Fachlicher Kontext: Was fließt rein/raus (Vereinsdaten, Geodaten, Suchanfragen)
- Technischer Kontext: HTTP, JSON, statisches Hosting

### 04 — Lösungsstrategie
- Crawl-and-Store statt Live-API (Begründung: BBB-API hat kein Namens-Suche-Endpoint)
- Client-seitige Suche statt Server (Begründung: GitHub Pages, kein Backend nötig)
- Manuelle Datenanreicherung via `clubs-enriched.json`
- Geocoding via Nominatim (kostenlos, keine API-Key nötig)

### 05 — Bausteinsicht
- **Ebene 1 (PlantUML):** Drei Module — Crawler, API (optional), Portal
- **Ebene 2 (PlantUML):** Crawler-Interna: `index.ts`, `bbb-client.ts`, `extractor.ts`, `geocoder.ts`, `writer.ts`; Portal-Interna: `index.html`, `style.css`, `app.js`
- Schnittstellen zwischen Bausteinen: `clubs.json`, `clubs-enriched.json`, `halls-raw.json`

### 06 — Laufzeitsicht
- **Szenario 1 (Mermaid Sequenzdiagramm):** Crawl-Prozess — Crawler → BBB-API → Nominatim → clubs.json
- **Szenario 2 (Mermaid Sequenzdiagramm):** Nutzer-Namenssuche — Browser → app.js → Fuse.js → Ergebnisliste
- **Szenario 3 (Mermaid Sequenzdiagramm):** Umkreissuche — Browser → Nominatim → Haversine → Ergebnisliste + Leaflet-Karte

### 07 — Verteilungssicht
- **Diagramm (Mermaid):** GitHub Pages (Portal + clubs.json), lokale Ausführung (Crawler, API)
- Deployment-Prozess: GitHub Actions oder manuell via `npm run crawl` + Push
- Keine Produktionsdatenbank, keine Server-Infrastruktur

### 08 — Querschnittliche Konzepte
- Geocoding-Strategie: Verein-Koordinaten aus Halls ableiten (`merge-halls`)
- Schema-Validierung: AJV gegen `data/schemas/`
- Fehlerbehandlung im Crawler: Retry-Logik, Timeout-Handling
- Datenmigration: clubs-enriched.json als manueller Override-Layer

### 09 — Architekturentscheidungen
ADR-Format für jede Entscheidung:
- **ADR-001:** Client-seitige Suche statt Backend-API
- **ADR-002:** Crawl-and-Store statt Live-Proxy zur BBB-API
- **ADR-003:** Geocoding via Nominatim (statt Google Maps API)
- **ADR-004:** Hallen-Koordinaten als primäre Geo-Quelle für Vereine
- **ADR-005:** Vanilla HTML/CSS/JS für das Portal (statt Framework)

### 10 — Qualitätsanforderungen
- Quality Tree mit Szenarien: Aktualität (wöchentlicher Crawl), Verfügbarkeit (statisches Hosting), Auffindbarkeit (Fuzzy-Suche), Erweiterbarkeit (enriched.json Pattern)

### 11 — Risiken und technische Schulden
- BBB-API kann ohne Vorwarnung breaking changes einführen
- Geocoding-Irrläufer (Verein-Koordinaten passen nicht zu Hallen)
- `app.js` wächst — keine Modularisierung
- Keine automatischen Tests für Portal-Logik
- `clubs-enriched.json` manuell gepflegt — keine Validierungsschicht für Contributor

### 12 — Glossar
- BBB / basketball-bund.net, DBB, Spielfeld, Halle, clubId, teamPermanentId, Altersklasse, Verbund, enriched, Geocoding, Haversine

---

## Technische Hinweise zur Implementierung

- Jede `.adoc`-Datei beginnt mit einer Level-1-Überschrift (`= Kapitel N: Titel`)
- `index.adoc` verwendet `include::` directives um alle Kapitel einzubinden
- Mermaid-Blöcke: `[mermaid]\n----\n...\n----`
- PlantUML-Blöcke: `[plantuml]\n----\n@startuml\n...\n@enduml\n----`
- GitHub rendert Mermaid nativ in `.md` aber nicht in `.adoc` — Diagramme werden trotzdem als Quelltext lesbar sein; für gerenderte Ansicht braucht man ein AsciiDoc-Plugin oder lokales Tooling
