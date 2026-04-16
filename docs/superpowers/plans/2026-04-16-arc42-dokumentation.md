# ARC42 Architekturdokumentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständige ARC42-Architekturdokumentation in AsciiDoc für das Basketball Vereinsregister Deutschland, mit Mermaid- und PlantUML-Diagrammen.

**Architecture:** 12 AsciiDoc-Dateien unter `docs/arc42/`, eine pro Kapitel, plus `index.adoc` als Einstiegspunkt mit `include::` Directives. Mermaid für einfache Diagramme, PlantUML für Strukturdiagramme. Sprache: Deutsch.

**Tech Stack:** AsciiDoc, Mermaid (in `[mermaid]` Blöcken), PlantUML (in `[plantuml]` Blöcken). Kein Build-System — GitHub Preview.

---

## Projektkontext für alle Tasks

```
03-Vereinsregister/
├── crawler/
│   ├── index.ts          # Crawl-Orchestrierung
│   ├── bbb-client.ts     # HTTP gegen BBB-API (basketball-bund.net/rest)
│   ├── extractor.ts      # Vereinsdaten aus API-Responses extrahieren
│   ├── geocoder.ts       # Ortsname → Koordinaten via Nominatim
│   ├── geocode.ts        # Batch-Geocoding Script
│   ├── geocode-halls.ts  # Hallen geocoden
│   ├── merge-halls.ts    # Hallen-Koordinaten in Vereinsdaten übernehmen
│   ├── crawl-halls.ts    # Spielfeld-Daten crawlen
│   └── writer.ts         # clubs.json schreiben/mergen, Schema-Validierung
├── api/
│   └── server.ts         # Express-Server (optional, lokal)
├── portal/
│   ├── index.html        # Single-Page-App
│   ├── style.css         # Design
│   └── app.js            # Fuse.js-Suche, Leaflet-Karte, Haversine (504 Zeilen)
├── data/
│   ├── clubs.json              # Auto-generiert vom Crawler
│   ├── clubs-enriched.json     # Manuell gepflegt (Anreicherung)
│   ├── halls-raw.json          # Rohdaten der Spielfelder
│   └── schemas/                # AJV JSON-Schemas
└── package.json                # Scripts: crawl, geocode, crawl-halls, merge-halls, geocode-halls
```

**BBB-API:** `https://www.basketball-bund.net/rest` — kein offizieller Vertrag, Rate-Limit 1100ms zwischen Requests.  
**Portal:** Läuft vollständig client-seitig auf GitHub Pages. clubs.json (~400KB, flach) wird per fetch geladen.  
**Geocoding:** Nominatim (OpenStreetMap), kostenlos, kein API-Key. Hallen-Koordinaten sind genauer als Vereinsadressen.

---

## Datei-Übersicht

| Datei | Neu/Bestehend | Inhalt |
|---|---|---|
| `docs/arc42/index.adoc` | Neu | Einstiegspunkt mit includes |
| `docs/arc42/01-einfuehrung-und-ziele.adoc` | Neu | Aufgabe, Qualitätsziele, Stakeholder |
| `docs/arc42/02-randbedingungen.adoc` | Neu | Tech-, Org-, Konventions-Constraints |
| `docs/arc42/03-kontextabgrenzung.adoc` | Neu | Systemkontext-Diagramm (Mermaid) |
| `docs/arc42/04-loesungsstrategie.adoc` | Neu | 4 strategische Entscheidungen |
| `docs/arc42/05-bausteinsicht.adoc` | Neu | Modul- und Komponentendiagramme (PlantUML) |
| `docs/arc42/06-laufzeitsicht.adoc` | Neu | 3 Sequenzdiagramme (Mermaid) |
| `docs/arc42/07-verteilungssicht.adoc` | Neu | Deployment-Diagramm (Mermaid) |
| `docs/arc42/08-querschnittliche-konzepte.adoc` | Neu | Geocoding, Schema-Validierung, Error-Handling |
| `docs/arc42/09-architekturentscheidungen.adoc` | Neu | 5 ADRs |
| `docs/arc42/10-qualitaetsanforderungen.adoc` | Neu | Quality Tree, Szenarien |
| `docs/arc42/11-risiken-und-technische-schulden.adoc` | Neu | 5 Risiken/Tech-Debt-Einträge |
| `docs/arc42/12-glossar.adoc` | Neu | ~12 Begriffe |

---

### Task 1: index.adoc + Kapitel 01, 02, 03

**Files:**
- Create: `docs/arc42/index.adoc`
- Create: `docs/arc42/01-einfuehrung-und-ziele.adoc`
- Create: `docs/arc42/02-randbedingungen.adoc`
- Create: `docs/arc42/03-kontextabgrenzung.adoc`

- [ ] **Schritt 1: `docs/arc42/` Verzeichnis und `index.adoc` erstellen**

```asciidoc
= Basketball Vereinsregister Deutschland — Architekturdokumentation
Oliver-Marcus Eder
2026-04-16
:toc: left
:toc-title: Inhalt
:toclevels: 2
:sectnums:
:icons: font
:lang: de

include::01-einfuehrung-und-ziele.adoc[]

include::02-randbedingungen.adoc[]

include::03-kontextabgrenzung.adoc[]

include::04-loesungsstrategie.adoc[]

include::05-bausteinsicht.adoc[]

include::06-laufzeitsicht.adoc[]

include::07-verteilungssicht.adoc[]

include::08-querschnittliche-konzepte.adoc[]

include::09-architekturentscheidungen.adoc[]

include::10-qualitaetsanforderungen.adoc[]

include::11-risiken-und-technische-schulden.adoc[]

include::12-glossar.adoc[]
```

- [ ] **Schritt 2: `01-einfuehrung-und-ziele.adoc` erstellen**

```asciidoc
= Kapitel 1: Einführung und Ziele

== Aufgabenstellung

Basketballvereine in Deutschland sind schwer auffindbar. Die offizielle BBB-API (basketball-bund.net) bietet keinen direkten Namens-Such-Endpunkt — jede Anfrage setzt eine bekannte `clubId` voraus. Das Basketball Vereinsregister Deutschland löst dieses Problem: Es crawlt regelmäßig alle Vereinsdaten aus der BBB-API, speichert sie lokal und macht sie über ein öffentliches Suchportal zugänglich.

Nutzer können Vereine nach Name oder Standort suchen und erhalten Informationen zu Teams, Trainingshallen und Kontaktdaten.

== Qualitätsziele

[cols="1,3,3"]
|===
|Priorität |Qualitätsziel |Motivation

|1
|Aktualität
|Vereinsdaten spiegeln den aktuellen BBB-Stand wider. Regelmäßiger Crawl (wöchentlich) hält die Daten frisch.

|2
|Verfügbarkeit
|Das Portal ist ohne eigene Server-Infrastruktur erreichbar. Statisches Hosting auf GitHub Pages garantiert hohe Uptime ohne Betriebskosten.

|3
|Auffindbarkeit
|Nutzer finden Vereine auch bei unscharfer Eingabe (Tippfehler, Abkürzungen). Fuzzy-Suche via Fuse.js.

|4
|Einfachheit
|Die Architektur ist für einen einzelnen Maintainer wartbar. Keine komplexen Infrastruktur-Abhängigkeiten.
|===

== Stakeholder

[cols="2,2,3"]
|===
|Rolle |Erwartung |Kontakt

|Endnutzer (Spieler, Eltern, Trainer)
|Verein schnell finden, Kontaktdaten abrufen
|Öffentlich

|Maintainer (Oliver-Marcus Eder)
|Codebase verstehen, Daten aktuell halten
|GitHub

|DBB / basketball-bund.net
|Indirekte Datenquelle, kein formaler Vertrag
|Extern

|Open-Source-Contributor
|Codebase verstehen, Beiträge leisten
|GitHub Discussions
|===
```

- [ ] **Schritt 3: `02-randbedingungen.adoc` erstellen**

```asciidoc
= Kapitel 2: Randbedingungen

== Technische Randbedingungen

[cols="2,4"]
|===
|Randbedingung |Erläuterung

|BBB-API als einzige Datenquelle
|Die offizielle API von basketball-bund.net (`/rest`) ist die einzige strukturierte Quelle für Vereinsdaten. Kein offizieller Vertrag, kein SLA, keine Stabilitätsgarantie.

|Rate-Limiting
|Die BBB-API reagiert empfindlich auf schnelle Anfragen. Der Crawler wartet mindestens 1100ms zwischen Requests.

|Node.js / TypeScript
|Der Crawler und die optionale lokale API sind in TypeScript geschrieben (Node.js ≥ 22). Das Portal ist Vanilla HTML/CSS/JS ohne Build-Schritt.

|Kein Build-System für das Portal
|Das Portal wird direkt als statische Dateien ausgeliefert. Kein Webpack, kein Vite, kein Bundler.

|GitHub Pages als Hosting
|Das Portal läuft auf GitHub Pages — kein Server-seitiges Rendering, kein Backend im Produktionsbetrieb.

|Nominatim für Geocoding
|Koordinaten für Vereine und Hallen werden über die freie Nominatim-API (OpenStreetMap) ermittelt. Rate-Limit: 1 Request/Sekunde.
|===

== Organisatorische Randbedingungen

[cols="2,4"]
|===
|Randbedingung |Erläuterung

|Ein Maintainer
|Das Projekt wird von einer Person entwickelt und betrieben. Architektur und Prozesse müssen für einen Einzelentwickler handhabbar sein.

|Open Source
|Der Code ist öffentlich auf GitHub verfügbar. Dokumentation und Commit-Nachrichten sollen für Außenstehende verständlich sein.

|Kein Budget
|Alle eingesetzten Dienste (GitHub Pages, Nominatim, BBB-API) sind kostenlos nutzbar.
|===

== Konventionen

[cols="2,4"]
|===
|Konvention |Beschreibung

|Conventional Commits
|Commit-Nachrichten folgen dem Format `type: description` (feat, fix, docs, chore).

|Semver
|Releases werden nach Semantic Versioning nummeriert.

|Sprache
|Code und Kommentare auf Englisch. Nutzeroberfläche und Dokumentation auf Deutsch.
|===
```

- [ ] **Schritt 4: `03-kontextabgrenzung.adoc` erstellen**

```asciidoc
= Kapitel 3: Kontextabgrenzung

== Fachlicher Kontext

Das Vereinsregister steht zwischen der BBB-Datenquelle und dem Endnutzer. Es übersetzt maschinenlesbare API-Daten in eine suchbare, menschenlesbare Form.

[cols="2,2,3"]
|===
|Nachbarsystem |Richtung |Beschreibung

|basketball-bund.net API
|→ Crawler (eingehend)
|Liefert Verbands-, Liga-, Team- und Spielfelddaten als JSON. Kein Namens-Suche-Endpoint.

|Nominatim (OpenStreetMap)
|→ Crawler (eingehend)
|Wandelt Orts- und Adress-Strings in GPS-Koordinaten (lat/lng) um.

|Browser-Nutzer
|→ Portal (eingehend)
|Gibt Suchbegriffe oder Standort ein, erhält Vereinslisten und Kartenansicht.

|GitHub Pages
|← Portal (ausgehend)
|Hostet die statischen Dateien (index.html, app.js, clubs.json).
|===

== Systemkontext-Diagramm

[mermaid]
----
graph TD
    Nutzer["👤 Browser-Nutzer"]
    Portal["🏀 Vereinsregister Portal\n(GitHub Pages)"]
    ClubsJSON["📄 clubs.json"]
    Crawler["⚙️ Crawler\n(lokal / CI)"]
    BBBAPI["🌐 BBB-API\nbasketball-bund.net/rest"]
    Nominatim["🗺️ Nominatim\nopenstreetmap.org"]

    Nutzer -->|"Suche (Name / Standort)"| Portal
    Portal -->|"lädt statisch"| ClubsJSON
    Crawler -->|"schreibt"| ClubsJSON
    Crawler -->|"GET Verbände, Ligen, Teams, Spielfelder"| BBBAPI
    Crawler -->|"GET Koordinaten"| Nominatim
----

== Technischer Kontext

[cols="2,2,3"]
|===
|Schnittstelle |Protokoll / Format |Bemerkung

|BBB-API
|HTTPS / JSON (POST)
|Proprietäres Response-Format mit `status`-Feld. Kein offizielles Schema.

|Nominatim
|HTTPS / JSON (GET)
|Standard-Geocoding-API. Max. 1 Request/s, User-Agent Pflicht.

|Portal → clubs.json
|HTTP / JSON (GET, statisch)
|~400KB flache JSON-Datei, browser-seitig geladen und vollständig im RAM gehalten.

|Browser → Nominatim
|HTTPS / JSON (GET)
|Direkt aus dem Browser bei Umkreissuche (Ortsname → Koordinaten).
|===
```

- [ ] **Schritt 5: Commit**

```bash
git add docs/arc42/
git commit -m "docs: arc42 kapitel 01-03 + index"
```

---

### Task 2: Kapitel 04, 05, 06

**Files:**
- Create: `docs/arc42/04-loesungsstrategie.adoc`
- Create: `docs/arc42/05-bausteinsicht.adoc`
- Create: `docs/arc42/06-laufzeitsicht.adoc`

- [ ] **Schritt 1: `04-loesungsstrategie.adoc` erstellen**

```asciidoc
= Kapitel 4: Lösungsstrategie

Die wesentlichen Architekturentscheidungen und ihre Begründungen:

[cols="3,4,4"]
|===
|Entscheidung |Lösung |Begründung

|Datenbeschaffung
|Crawl-and-Store: Daten werden periodisch gecrawlt und als `clubs.json` gespeichert
|Die BBB-API bietet keinen Namens-Suche-Endpoint. Live-Proxy würde für jede Suchanfrage hunderte API-Calls erfordern.

|Suche
|Client-seitige Fuzzy-Suche via Fuse.js und Haversine-Distanzberechnung im Browser
|GitHub Pages erlaubt kein serverseitiges Computing. Die clubs.json (~400KB) ist kompakt genug für vollständiges Client-seitiges Laden.

|Geocoding
|Nominatim (OpenStreetMap) — kostenlos, kein API-Key
|Google Maps API wäre kostenpflichtig ab Volumen. Nominatim ist ausreichend präzise für deutsche Vereinsadressen.

|Koordinatenquelle
|Hallen-Koordinaten als primäre Geo-Quelle für Vereine (via `merge-halls`)
|Hallen haben konkrete Adressen (Spielfelddaten aus BBB-API). Vereinssitze sind oft Privatanschriften oder ungenau.

|Portal-Technologie
|Vanilla HTML/CSS/JS ohne Framework oder Build-System
|Minimaler Wartungsaufwand für einen Einzelentwickler. Keine Dependency-Updates, kein Build-Pipeline-Risiko.

|Datenanreicherung
|Manuell gepflegte `clubs-enriched.json` als Override-Layer
|Ermöglicht manuelle Korrekturen und Ergänzungen (Website, Kontakt, Info) ohne Crawler-Anpassung.
|===
```

- [ ] **Schritt 2: `05-bausteinsicht.adoc` erstellen**

```asciidoc
= Kapitel 5: Bausteinsicht

== Ebene 1: Systemübersicht

[plantuml]
----
@startuml
skinparam componentStyle rectangle
skinparam backgroundColor transparent

package "Basketball Vereinsregister" {
  [Crawler] as C
  [Portal] as P
  [API (optional)] as A
  database "clubs.json" as DB
  database "clubs-enriched.json" as EN
  database "halls-raw.json" as HR
}

C --> DB : schreibt
C --> HR : schreibt
EN --> A : liest
DB --> A : liest
A --> P : (lokal, optional)
DB --> P : lädt (statisch)

note right of A : Nur lokal / Entwicklung.\nProduktion nutzt clubs.json direkt.
@enduml
----

== Ebene 2: Crawler

[plantuml]
----
@startuml
skinparam componentStyle rectangle
skinparam backgroundColor transparent

package "Crawler" {
  [index.ts\n(Orchestrierung)] as IDX
  [bbb-client.ts\n(HTTP-Client)] as BBC
  [extractor.ts\n(Datenextraktion)] as EXT
  [geocoder.ts\n(Nominatim-Client)] as GEO
  [writer.ts\n(Datei-I/O + Validierung)] as WRT
  [crawl-halls.ts\n(Spielfeld-Crawl)] as CH
  [merge-halls.ts\n(Koordinaten-Merge)] as MH
  [geocode-halls.ts\n(Hallen-Geocoding)] as GH
}

IDX --> BBC : ruft auf
IDX --> EXT : ruft auf
IDX --> GEO : ruft auf
IDX --> WRT : ruft auf
CH --> BBC : ruft auf
CH --> WRT : schreibt halls-raw.json
MH --> WRT : liest/schreibt clubs.json
GH --> GEO : ruft auf
GH --> WRT : aktualisiert halls

note bottom of BBC : Rate-Limit: 1100ms\nzwischen Requests
@enduml
----

== Ebene 2: Portal

[plantuml]
----
@startuml
skinparam componentStyle rectangle
skinparam backgroundColor transparent

package "Portal" {
  [index.html\n(Markup + Tabs + Footer)] as HTML
  [style.css\n(Design-System)] as CSS
  [app.js\n(Suche + Karte + Rendering)] as APP
}

package "Externe Bibliotheken (CDN)" {
  [Fuse.js\n(Fuzzy-Suche)] as FUSE
  [Leaflet\n(Karte)] as LEAF
  [Nominatim\n(Umkreis-Geocoding)] as NOM
}

HTML --> CSS : referenziert
HTML --> APP : lädt
APP --> FUSE : Namenssuche
APP --> LEAF : Kartenanzeige
APP --> NOM : Ortsname → Koordinaten
@enduml
----

== Schnittstellen zwischen Modulen

[cols="2,2,3"]
|===
|Schnittstelle |Format |Beschreibung

|clubs.json
|JSON-Array von `MergedClub`
|Hauptdatenschnittstelle. Crawler schreibt, Portal liest. Schema in `data/schemas/club.schema.json`.

|clubs-enriched.json
|JSON-Array von `ClubEnriched`
|Manuelle Ergänzungen. API merged diese beim Start mit clubs.json.

|halls-raw.json
|JSON-Array von `HallRawEntry`
|Rohdaten der Spielfelder aus der BBB-API. Input für `merge-halls` und `geocode-halls`.
|===
```

- [ ] **Schritt 3: `06-laufzeitsicht.adoc` erstellen**

```asciidoc
= Kapitel 6: Laufzeitsicht

== Szenario 1: Crawl-Prozess

[mermaid]
----
sequenceDiagram
    participant Maintainer
    participant Crawler as Crawler (index.ts)
    participant BBB as BBB-API
    participant Nominatim
    participant FS as Dateisystem

    Maintainer->>Crawler: npm run crawl
    Crawler->>BBB: POST /wam/data (Verbände)
    BBB-->>Crawler: [{id, label}]
    loop Für jeden Verband
        Crawler->>BBB: POST /wam/liga/list (Ligen)
        BBB-->>Crawler: [{ligaId, verbandId}]
        loop Für jede Liga
            Crawler->>BBB: GET /tabelle (Teams)
            BBB-->>Crawler: [{clubId, teamname}]
        end
    end
    Crawler->>Nominatim: GET /search?q=Vereinsort
    Nominatim-->>Crawler: [{lat, lon}]
    Crawler->>FS: schreibt clubs.json
----

== Szenario 2: Namenssuche im Portal

[mermaid]
----
sequenceDiagram
    participant Nutzer
    participant Portal as Portal (app.js)
    participant Fuse as Fuse.js
    participant DOM

    Nutzer->>Portal: Eingabe in Suchfeld
    Portal->>Fuse: search(query)
    Fuse-->>Portal: [MergedClub, ...]
    Portal->>Portal: applyFilters(results)
    Portal->>DOM: renderResults()
    DOM-->>Nutzer: Vereinsliste + Karte
----

== Szenario 3: Umkreissuche

[mermaid]
----
sequenceDiagram
    participant Nutzer
    participant Portal as Portal (app.js)
    participant Nominatim
    participant Haversine as Haversine (intern)
    participant Leaflet
    participant DOM

    Nutzer->>Portal: Ortsname + Radius eingeben
    Portal->>Nominatim: GET /search?q=Ortsname
    Nominatim-->>Portal: {lat, lon}
    Portal->>Haversine: searchByLocation(lat, lng, radius)
    Haversine-->>Portal: [MergedClub mit distanceKm, ...]
    Portal->>Portal: applyFilters(results)
    Portal->>Leaflet: updateMap(results)
    Portal->>DOM: renderResults()
    DOM-->>Nutzer: Vereinsliste + Karte mit Markern
----
```

- [ ] **Schritt 4: Commit**

```bash
git add docs/arc42/04-loesungsstrategie.adoc docs/arc42/05-bausteinsicht.adoc docs/arc42/06-laufzeitsicht.adoc
git commit -m "docs: arc42 kapitel 04-06 (strategie, bausteine, laufzeit)"
```

---

### Task 3: Kapitel 07, 08, 09

**Files:**
- Create: `docs/arc42/07-verteilungssicht.adoc`
- Create: `docs/arc42/08-querschnittliche-konzepte.adoc`
- Create: `docs/arc42/09-architekturentscheidungen.adoc`

- [ ] **Schritt 1: `07-verteilungssicht.adoc` erstellen**

```asciidoc
= Kapitel 7: Verteilungssicht

== Produktionsumgebung

[mermaid]
----
graph TD
    subgraph "GitHub"
        Repo["📁 Repository\n(Code + clubs.json)"]
        Pages["🌐 GitHub Pages\n(portal/)"]
    end

    subgraph "Lokale Entwicklung"
        Crawler["⚙️ Crawler\n(npm run crawl)"]
        API["🔧 Express API\n(npm run api, optional)"]
    end

    subgraph "Externe Dienste"
        BBB["basketball-bund.net/rest"]
        Nominatim["nominatim.openstreetmap.org"]
    end

    subgraph "Browser-Nutzer"
        Browser["🖥️ Browser"]
    end

    Crawler -->|"HTTP POST"| BBB
    Crawler -->|"HTTP GET"| Nominatim
    Crawler -->|"git push"| Repo
    Repo -->|"GitHub Actions / automatisch"| Pages
    Browser -->|"HTTPS"| Pages
    Browser -->|"HTTP GET (Umkreissuche)"| Nominatim
----

== Deployment-Prozess

[cols="2,4"]
|===
|Schritt |Beschreibung

|1. Crawl ausführen
|`npm run crawl` lokal ausführen. Dauer: 20–60 Minuten je nach Datenmenge.

|2. Hallen crawlen (optional)
|`npm run crawl-halls && npm run geocode-halls && npm run merge-halls`

|3. Prüfen
|`data/clubs.json` auf Vollständigkeit prüfen. Anzahl Vereine, fehlende Koordinaten.

|4. Pushen
|`git add data/clubs.json && git commit -m "chore: update clubs.json" && git push`

|5. GitHub Pages
|GitHub Pages deployed automatisch aus dem `main`-Branch. Keine Build-Pipeline nötig.
|===

== Infrastruktur-Anforderungen

[cols="2,2,3"]
|===
|Komponente |Anforderung |Begründung

|Portal-Hosting
|Statisches File-Hosting
|GitHub Pages, Netlify oder beliebig — keine serverseitigen Features nötig.

|Crawler
|Node.js ≥ 22, Internetzugang
|Läuft lokal oder in CI (GitHub Actions).

|Speicher
|< 5MB für clubs.json + Portal
|Weit unterhalb typischer Hosting-Limits.
|===
```

- [ ] **Schritt 2: `08-querschnittliche-konzepte.adoc` erstellen**

```asciidoc
= Kapitel 8: Querschnittliche Konzepte

== Geocoding-Strategie

Vereine haben häufig ungenaue oder private Adressen als Vereinssitz. Spielfelder (Hallen) haben konkrete Adressen, die aus der BBB-API bezogen werden (`/spielfeld`-Endpunkt).

Die Geocoding-Strategie folgt dieser Priorität:

1. **Hallen-Koordinaten** (bevorzugt): Nach `npm run merge-halls` werden die Koordinaten der gecrawlten Hallen in die Vereinsdaten übernommen.
2. **Vereinsadresse** (Fallback): Falls keine Hallen vorhanden oder geocodet, wird der Vereinsort über Nominatim in Koordinaten umgewandelt.
3. **Kein Koordinate** (letzter Ausweg): Verein erscheint nur in der Namensuche, nicht in der Umkreissuche.

Bekannte Einschränkung: Einige Vereine haben Hallen weit entfernt vom eigentlichen Vereinsort (z.B. Gastspielfelder). Diese Irrläufer können manuell in `clubs-enriched.json` korrigiert werden.

== Schema-Validierung

Alle zentralen Datendateien werden gegen JSON-Schemas validiert (AJV-Bibliothek):

[cols="2,3"]
|===
|Datei |Schema

|`data/clubs.json`
|`data/schemas/club.schema.json`

|`data/clubs-enriched.json`
|`data/schemas/club-enriched.schema.json`

|`data/clubs.json` (Gesamtarray)
|`data/schemas/clubs.schema.json`
|===

Validierungsfehler werden im Crawler als Warnungen geloggt — der Crawler bricht nicht ab, um Teilcrawls zu erhalten.

== Fehlerbehandlung im Crawler

[cols="2,4"]
|===
|Fehlerklasse |Behandlung

|BBB-API HTTP-Fehler (4xx/5xx)
|Exception wird geworfen, Crawl für diese Liga/Team abgebrochen. Andere Ligen laufen weiter.

|BBB-API Fehler-Status (`status !== '0'`)
|Exception wird geworfen (siehe `bbb-client.ts: request()`).

|Nominatim-Fehler
|Koordinate bleibt `null`. Verein wird ohne Geo-Daten gespeichert.

|Rate-Limit-Überschreitung
|Crawler wartet 1100ms zwischen jedem BBB-Request. Nominatim: 1 Request/s.
|===

== Datenanreicherung (Override-Layer)

`data/clubs-enriched.json` ist eine manuell gepflegte Datei, die beim API-Start mit `clubs.json` gemerged wird. Folgende Felder können überschrieben oder ergänzt werden:

- `website`, `email`, `phone`
- `address` (Straße, PLZ, Ort)
- `info` (Freitext)
- `halls` (Hallen-Override oder Ergänzung)
- `teams` (Trainingszeiten-Override)

Merge-Logik: Alle Felder aus `clubs-enriched.json` überschreiben die gecrawlten Felder. Hallen und Teams werden nach ID gemerged (`mergeHalls`, `mergeTeams` in `writer.ts`).
```

- [ ] **Schritt 3: `09-architekturentscheidungen.adoc` erstellen**

```asciidoc
= Kapitel 9: Architekturentscheidungen

== ADR-001: Client-seitige Suche statt Backend-API

*Status:* Akzeptiert

*Kontext:*
Das Portal soll auf GitHub Pages laufen. GitHub Pages erlaubt ausschließlich statische Dateien — kein serverseitiges Computing.

*Entscheidung:*
Suche und Filterung laufen vollständig im Browser. clubs.json (~400KB) wird beim Seitenaufruf einmal geladen und vollständig im RAM gehalten. Fuse.js übernimmt die Fuzzy-Suche, Haversine die Distanzberechnung.

*Konsequenzen:*
* (+) Kein Server, keine Betriebskosten, kein Backend-Maintenance
* (+) Hohe Verfügbarkeit durch statisches Hosting
* (-) Skaliert nicht für sehr große Datenmengen (> 5MB JSON wäre problematisch)
* (-) Keine server-seitige Zugriffssteuerung oder Logging

---

== ADR-002: Crawl-and-Store statt Live-Proxy

*Status:* Akzeptiert

*Kontext:*
Die BBB-API bietet keinen Namens-Suche-Endpunkt. Jede Suchanfrage würde hunderte sequentielle API-Calls erfordern (Verbände → Ligen → Teams). Das Rate-Limit von 1100ms macht dies für Echtzeit-Suche untauglich.

*Entscheidung:*
Daten werden regelmäßig (wöchentlich) gecrawlt und als `clubs.json` gespeichert. Das Portal nutzt diese Snapshot-Datei.

*Konsequenzen:*
* (+) Keine API-Abhängigkeit zur Laufzeit des Portals
* (+) Volle Kontrolle über die Datenstruktur
* (-) Daten können bis zu 7 Tage veraltet sein
* (-) Crawl muss manuell oder per CI ausgelöst werden

---

== ADR-003: Geocoding via Nominatim

*Status:* Akzeptiert

*Kontext:*
Vereine und Hallen brauchen GPS-Koordinaten für die Umkreissuche und Kartenanzeige.

*Entscheidung:*
Nominatim (OpenStreetMap) wird für alle Geocoding-Operationen verwendet.

*Konsequenzen:*
* (+) Kostenlos, kein API-Key erforderlich
* (+) Gute Abdeckung für Deutschland
* (-) Rate-Limit: 1 Request/Sekunde — Geocoding-Batch dauert lange
* (-) Qualität variiert bei unvollständigen Adressen

---

== ADR-004: Hallen-Koordinaten als primäre Geo-Quelle

*Status:* Akzeptiert

*Kontext:*
Vereinssitze sind oft Privatanschriften (des Vorsitzenden) oder ungenaue Ortsangaben. Spielfelder haben konkrete Straßenadressen aus der BBB-API.

*Entscheidung:*
Nach dem Hallen-Crawl werden Hallen-Koordinaten via `merge-halls` in die Vereinsdaten übernommen und als primäre Koordinatenquelle verwendet.

*Konsequenzen:*
* (+) Koordinaten sind geografisch akkurater (tatsächlicher Spielort)
* (-) Einige Vereine spielen in fremden Hallen — Koordinaten zeigen nicht den Vereinssitz
* (-) Erfordert separaten Crawl-Schritt (`crawl-halls → geocode-halls → merge-halls`)

---

== ADR-005: Vanilla HTML/CSS/JS für das Portal

*Status:* Akzeptiert

*Kontext:*
Das Portal ist eine einfache Single-Page-Applikation mit Suchfeld, Filter und Kartenansicht.

*Entscheidung:*
Kein JavaScript-Framework (kein React, Vue, Svelte). Vanilla HTML, CSS und JS ohne Build-Schritt. Externe Libraries (Fuse.js, Leaflet) werden per CDN eingebunden.

*Konsequenzen:*
* (+) Keine Dependency-Updates, kein Build-Pipeline-Risiko
* (+) Sehr schnelle Ladezeit (kein Bundle-Overhead)
* (-) `app.js` wächst mit Features — ohne Modularisierung schwerer wartbar
* (-) Keine TypeScript-Typsicherheit im Portal-Code
```

- [ ] **Schritt 4: Commit**

```bash
git add docs/arc42/07-verteilungssicht.adoc docs/arc42/08-querschnittliche-konzepte.adoc docs/arc42/09-architekturentscheidungen.adoc
git commit -m "docs: arc42 kapitel 07-09 (verteilung, konzepte, entscheidungen)"
```

---

### Task 4: Kapitel 10, 11, 12

**Files:**
- Create: `docs/arc42/10-qualitaetsanforderungen.adoc`
- Create: `docs/arc42/11-risiken-und-technische-schulden.adoc`
- Create: `docs/arc42/12-glossar.adoc`

- [ ] **Schritt 1: `10-qualitaetsanforderungen.adoc` erstellen**

```asciidoc
= Kapitel 10: Qualitätsanforderungen

== Quality Tree

[mermaid]
----
graph TD
    Q[Qualität]
    Q --> A[Aktualität]
    Q --> V[Verfügbarkeit]
    Q --> F[Auffindbarkeit]
    Q --> W[Wartbarkeit]

    A --> A1[Vereinsdaten max. 7 Tage alt]
    A --> A2[Crawl-Fehler werden sichtbar geloggt]

    V --> V1[Portal erreichbar ohne eigenen Server]
    V --> V2[Kein Single-Point-of-Failure]

    F --> F1[Fuzzy-Suche toleriert Tippfehler]
    F --> F2[Umkreissuche mit variablem Radius]
    F --> F3[Filter nach Altersklasse und Geschlecht]

    W --> W1[Crawler für Einzelperson wartbar]
    W --> W2[Neue Felder ohne Refactoring ergänzbar]
----

== Qualitätsszenarien

[cols="1,2,3,2"]
|===
|ID |Qualitätsmerkmal |Szenario |Ziel

|Q1
|Aktualität
|Maintainer führt wöchentlichen Crawl durch
|clubs.json ist nach Crawl maximal 7 Tage alt

|Q2
|Verfügbarkeit
|Nutzer ruft Portal zu beliebiger Zeit auf
|Portal lädt in < 3 Sekunden, unabhängig von BBB-API-Status

|Q3
|Auffindbarkeit
|Nutzer tippt "Baskets Münch" statt "Telekom Baskets München"
|Verein erscheint in Top-3 der Suchergebnisse

|Q4
|Auffindbarkeit
|Nutzer sucht im Umkreis von 25km um "Regensburg"
|Alle Vereine mit Hallen im Radius werden angezeigt

|Q5
|Wartbarkeit
|Maintainer will neues Feld (z.B. Vereinsfarbe) ergänzen
|Feld kann in clubs-enriched.json ohne Crawler-Anpassung hinzugefügt werden

|Q6
|Wartbarkeit
|BBB-API ändert Endpunkt-Format
|Anpassung nur in bbb-client.ts und extractor.ts nötig
|===
```

- [ ] **Schritt 2: `11-risiken-und-technische-schulden.adoc` erstellen**

```asciidoc
= Kapitel 11: Risiken und technische Schulden

== Risiken

[cols="1,2,3,2,2"]
|===
|ID |Risiko |Beschreibung |Wahrscheinlichkeit |Maßnahme

|R1
|BBB-API Breaking Change
|basketball-bund.net ändert Endpunkte oder Response-Format ohne Ankündigung. Der Crawler bricht.
|Mittel
|Crawler-Tests schreiben; Monitoring via wöchentlichem CI-Run; schnelle Anpassung möglich da bbb-client.ts isoliert ist.

|R2
|Nominatim Rate-Limit
|Zu schnelle Geocoding-Requests führen zu temporären Sperren.
|Gering
|1100ms-Delay ist bereits implementiert. Bei Sperre: Wartezeit erhöhen.

|R3
|Geocoding-Irrläufer
|Hallen-Koordinaten zeigen auf falsche Vereine (Gastspielfelder, Doppelbelegungen).
|Mittel
|Manuelle Korrektur via clubs-enriched.json möglich. Regelmäßiger visueller Check der Karte.

|R4
|clubs.json Datengröße
|Wächst clubs.json auf > 2MB, steigt Ladezeit im Browser spürbar.
|Gering (aktuell ~400KB)
|Felder schlank halten. Bei Bedarf: Lazy-Loading oder Pagination einführen.

|R5
|Abhängigkeit von CDN
|Fuse.js und Leaflet werden per CDN geladen. CDN-Ausfall = Portal teilweise funktionslos.
|Sehr gering
|Bei Bedarf: Bibliotheken lokal einbinden und mit Portal committen.
|===

== Technische Schulden

[cols="1,2,3,2"]
|===
|ID |Bereich |Beschreibung |Priorität

|TD1
|Portal (`app.js`)
|`app.js` hat 504 Zeilen ohne Modularisierung. Suche, Rendering, Karte und Event-Handling sind in einer Datei. Schwer testbar.
|Mittel

|TD2
|Portal (Tests)
|Keine automatisierten Tests für Portal-Logik (Suche, Filter, Haversine). Nur manuelle Verifikation.
|Hoch

|TD3
|clubs-enriched.json
|Keine Validierungsschicht für manuelle Einträge in clubs-enriched.json. Fehler fallen erst beim API-Start auf.
|Mittel

|TD4
|Crawler (Fehlerbehandlung)
|Einzelne Liga-Crawl-Fehler werden geloggt aber nicht aggregiert. Kein Überblick über Crawl-Vollständigkeit.
|Niedrig

|TD5
|Dokumentation
|Kein CONTRIBUTING.md, kein Setup-Guide für neue Contributor.
|Niedrig
|===
```

- [ ] **Schritt 3: `12-glossar.adoc` erstellen**

```asciidoc
= Kapitel 12: Glossar

[cols="2,5"]
|===
|Begriff |Erläuterung

|BBB / basketball-bund.net
|Betreiber der offiziellen deutschen Basketball-Datenbank und API (`basketball-bund.net/rest`). Nicht zu verwechseln mit dem DBB (Dachverband).

|DBB
|Deutscher Basketball Bund — nationaler Dachverband. BBB ist der technische Betreiber der Spielbetrieb-Plattform.

|Verband
|Regionaler Basketball-Verband (z.B. Bayerischer Basketball Verband). Strukturierungsebene über Ligen.

|Liga
|Spielklasse innerhalb eines Verbands (z.B. Bezirksliga Männer). Enthält Teams.

|clubId
|Eindeutige numerische ID eines Vereins in der BBB-Datenbank. Primärschlüssel für alle Vereins-Lookups.

|teamPermanentId
|Stabile ID eines Teams über Saisons hinweg (im Gegensatz zur `seasonTeamId`, die saisongebunden ist).

|Altersklasse
|Alterskategorie eines Teams (z.B. U16, U18, Herren, Damen). Aus dem BBB-Feld `altersklasse`.

|Spielfeld / Halle
|Physischer Spielort eines Teams. Ein Verein kann mehrere Spielfelder haben. Enthält Adresse und (nach Geocoding) Koordinaten.

|dbbSpielfeldId
|Eindeutige ID eines Spielfelds in der BBB-Datenbank.

|clubs.json
|Zentrale Datendatei — Array aller `MergedClub`-Objekte. Auto-generiert vom Crawler, versioniert im Repository.

|clubs-enriched.json
|Manuell gepflegte Ergänzungsdatei. Überschreibt oder ergänzt Felder aus clubs.json (Website, Kontakt, Info).

|halls-raw.json
|Rohdaten der Spielfelder direkt aus der BBB-API. Input für Geocoding und Merge-Prozess.

|Geocoding
|Umwandlung von Adressen oder Ortsnamen in GPS-Koordinaten (Breitengrad / Längengrad) via Nominatim.

|Haversine
|Formel zur Berechnung der Luftlinien-Distanz zwischen zwei GPS-Koordinaten. Verwendet für die Umkreissuche.

|Nominatim
|Geocoding-Service von OpenStreetMap (`nominatim.openstreetmap.org`). Kostenlos, Rate-Limit: 1 Request/Sekunde.

|Fuse.js
|JavaScript-Bibliothek für clientseitige Fuzzy-Suche. Findet Treffer auch bei Tippfehlern oder unvollständigen Eingaben.

|Leaflet
|JavaScript-Bibliothek für interaktive Karten. Zeigt Vereinsstandorte als Marker auf OpenStreetMap.

|Crawl-and-Store
|Architekturmuster: Daten werden periodisch von einer externen Quelle abgerufen und lokal gespeichert, statt live abgefragt.

|MergedClub
|TypeScript-Interface (`crawler/types.ts`): Kombination aus `ClubEntry` (Crawler-Daten) und `ClubEnriched` (manuelle Anreicherung).
|===
```

- [ ] **Schritt 4: Commit**

```bash
git add docs/arc42/10-qualitaetsanforderungen.adoc docs/arc42/11-risiken-und-technische-schulden.adoc docs/arc42/12-glossar.adoc
git commit -m "docs: arc42 kapitel 10-12 (qualität, risiken, glossar)"
```

---

## Spec Coverage Check

| Spec-Anforderung | Task |
|---|---|
| index.adoc mit includes | Task 1 |
| 01 Einführung + Qualitätsziele + Stakeholder | Task 1 |
| 02 Randbedingungen (tech, org, konventionen) | Task 1 |
| 03 Kontextabgrenzung + Mermaid-Diagramm | Task 1 |
| 04 Lösungsstrategie (4 Entscheidungen) | Task 2 |
| 05 Bausteinsicht Ebene 1+2 (PlantUML) | Task 2 |
| 06 Laufzeitsicht 3 Szenarien (Mermaid) | Task 2 |
| 07 Verteilungssicht + Deployment-Prozess (Mermaid) | Task 3 |
| 08 Querschnitt: Geocoding, Schema, Fehler, Enrichment | Task 3 |
| 09 5 ADRs | Task 3 |
| 10 Quality Tree + Szenarien (Mermaid) | Task 4 |
| 11 5 Risiken + 5 Tech-Debt-Einträge | Task 4 |
| 12 Glossar (~18 Begriffe) | Task 4 |
| AsciiDoc-Format überall | alle Tasks |
| Deutsch durchgehend | alle Tasks |
