# Vereinsregister — GitHub Pages Design Spec

**Datum:** 2026-04-14  
**Status:** Approved  
**Projekt:** 03-Vereinsregister

---

## Ziel

Das Portal soll auf GitHub Pages als vollständig statische Single-Page-App laufen. Der Express-Server wird nicht mehr für den Produktivbetrieb benötigt, bleibt aber für lokale Entwicklung erhalten.

---

## Architektur

```
GitHub Pages (statisch)
  ├── portal/index.html
  ├── portal/style.css
  ├── portal/app.js      ← lädt clubs.json direkt per fetch
  └── data/clubs.json    ← statische Datendatei

GitHub Actions
  ├── crawl.yml          ← monatlich: crawler → commit clubs.json
  └── pages.yml          ← bei push auf main: deploy portal + data/
```

**Kein Node.js-Server auf GitHub Pages.** Die gesamte Suchlogik (Fuse.js + Haversine) läuft bereits client-seitig in `app.js`. Nominatim wird direkt vom Browser aufgerufen.

---

## Entscheidungen

### E1: clubs.json im Repo versionieren
**Entscheidung:** `data/clubs.json` wird aus `.gitignore` entfernt und ins Repo committed.  
**Alternativen:**
- A) Nicht versionieren, in CI generieren und als Artifact hochladen → komplexer Pages-Workflow
- B) Im Repo versionieren, Crawler-Action committed direkt ✅ (gewählt)  
**Begründung:** Einfacher, nachvollziehbar, diff-bar. Crawler-Commits zeigen die Datenentwicklung über Zeit.

### E2: Gecoding im Browser vs. Server-Proxy
**Entscheidung:** Browser ruft Nominatim direkt auf.  
**Alternativen:**
- A) GitHub Action als Proxy → unmöglich für interaktive Suche
- B) Direkter Browser-Call ✅ (gewählt)  
**Begründung:** Nominatim erlaubt Browser-Requests (kein CORS-Block), solange User-Agent gesetzt ist. Für ein Community-Projekt mit geringem Traffic absolut ausreichend.

### E3: Deploy-Artefakt-Struktur
**Entscheidung:** `portal/` + `data/clubs.json` werden in `_site/` kopiert und als Pages-Artefakt hochgeladen.  
**Begründung:** Klare Trennung — kein unnötiger Source-Code auf Pages. `_site/` ist Jekyll-Konvention, funktioniert auch ohne Jekyll.

### E4: Crawler-Frequenz
**Entscheidung:** 1× pro Monat (1. des Monats, 03:00 UTC) + `workflow_dispatch` für manuelle Ausführung.  
**Begründung:** Vereinsdaten ändern sich selten, monatlich ist ausreichend. Manuell auslösbar für initiales Befüllen.

---

## Portal-Änderungen (`portal/app.js`)

**Vorher:** `fetch(API_BASE + '/search?...')` — Express-Server erforderlich

**Nachher:**
1. Beim Seitenaufruf einmalig `fetch('data/clubs.json')` laden
2. `SearchEngine` mit den geladenen Daten initialisieren
3. Suche komplett client-seitig: `searchByName` / `searchByLocation` / `searchCombined`
4. Umkreissuche: Browser ruft `https://nominatim.openstreetmap.org/search` direkt auf

Ladezustand wird dem Nutzer angezeigt ("Lade Vereinsdaten...").

---

## GitHub Actions

### `crawl.yml`
- Trigger: monatlicher Cron (`0 3 1 * *`) + `workflow_dispatch`
- Steps: checkout → Node 22 → `npm ci` → `npm run crawl` → `git add data/clubs.json` → commit + push (nur wenn Änderungen)
- Bot-Commit: `github-actions[bot]`

### `pages.yml`
- Trigger: push auf `main` (Pfade: `portal/**`, `data/clubs.json`) + `workflow_dispatch`
- Steps: checkout → `_site/` befüllen (portal-Dateien + data/clubs.json) → configure-pages → upload-artifact → deploy-pages
- Permissions: `pages: write`, `id-token: write`

---

## Lokale Entwicklung

Unverändert:
```bash
npm run api    # Express-Server auf Port 3000
# Portal über http://localhost:3000 erreichbar
```

Für reines Portal-Testing (ohne Express):
```bash
# Static file server, z.B.:
npx serve portal -p 3000 --config '{"rewrites": [{"source": "data/:file", "destination": "../data/:file"}]}'
```

---

## Bekannte Einschränkungen

- **Nominatim Rate Limit:** 1 Request/s Policy. Bei sehr schnellen Mehrfachsuchen könnte ein Nutzer geblockt werden. Debouncing im Portal (bereits vorhanden) mitigiert das.
- **clubs.json Größe:** Mit ~2000 Vereinen ca. 500KB unkomprimiert. GitHub Pages liefert mit gzip aus, tatsächliche Download-Größe ~100KB. Akzeptabel.
- **Crawler-Secrets:** Keine — BBB-API und Nominatim sind öffentlich ohne Auth.
