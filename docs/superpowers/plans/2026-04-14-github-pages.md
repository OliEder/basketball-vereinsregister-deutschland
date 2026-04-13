# GitHub Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal auf GitHub Pages deployen — vollständig statisch, kein Server erforderlich.

**Architecture:** `portal/app.js` lädt `data/clubs.json` per fetch und sucht client-seitig (Fuse.js + Haversine). Nominatim wird direkt vom Browser geocodiert. Zwei GitHub Actions: monatlicher Crawler + automatisches Pages-Deploy bei Push auf main.

**Tech Stack:** Vanilla JS, Fuse.js v7 (CDN), Nominatim, GitHub Actions (actions/checkout@v4, actions/setup-node@v4, actions/configure-pages@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4)

---

### Task 1: clubs.json aus .gitignore entfernen

**Files:**
- Modify: `.gitignore`

- [x] **Schritt 1: `data/clubs.json` aus .gitignore entfernen**

  Zeile `data/clubs.json` aus `.gitignore` löschen. Die Datei wird jetzt versioniert.

- [x] **Schritt 2: Commit**

  ```bash
  git add .gitignore
  git commit -m "chore: track clubs.json in git for GitHub Pages"
  ```

---

### Task 2: portal/app.js — vollständig statisch

**Files:**
- Modify: `portal/app.js`
- Modify: `portal/index.html`

- [x] **Schritt 1: Fuse.js CDN in index.html einbinden**

  Vor dem `<script src="app.js">` einfügen:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js"></script>
  ```

- [x] **Schritt 2: app.js umschreiben**

  - `API_BASE` entfernen
  - `SearchEngine`-Klasse mit Haversine direkt in app.js (kein Server-Import)
  - `loadClubs()`: `fetch('data/clubs.json')` beim Seitenstart
  - `geocodeCity()`: direkt gegen Nominatim
  - `doNameSearch()` / `doLocationSearch()` ersetzen `searchByName` / `searchByLocation`
  - Status "Lade Vereinsdaten..." beim Start

- [x] **Schritt 3: Commit**

  ```bash
  git add portal/app.js portal/index.html
  git commit -m "feat: make portal fully static for GitHub Pages"
  ```

---

### Task 3: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/crawl.yml`
- Create: `.github/workflows/pages.yml`

- [x] **Schritt 1: crawl.yml erstellen**

  ```yaml
  name: Monthly Crawler
  on:
    schedule:
      - cron: '0 3 1 * *'
    workflow_dispatch:
  jobs:
    crawl:
      runs-on: ubuntu-latest
      permissions:
        contents: write
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '22', cache: 'npm' }
        - run: npm ci
        - run: npm run crawl
        - name: clubs.json committen (wenn geändert)
          run: |
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add data/clubs.json
            git diff --staged --quiet || git commit -m "chore: update clubs.json [crawler]"
            git push
  ```

- [x] **Schritt 2: pages.yml erstellen**

  ```yaml
  name: Deploy GitHub Pages
  on:
    push:
      branches: [main]
      paths: ['portal/**', 'data/clubs.json']
    workflow_dispatch:
  jobs:
    deploy:
      runs-on: ubuntu-latest
      permissions:
        pages: write
        id-token: write
      environment:
        name: github-pages
        url: ${{ steps.deployment.outputs.page_url }}
      steps:
        - uses: actions/checkout@v4
        - name: Deploy-Artefakt zusammenstellen
          run: |
            mkdir -p _site/data
            cp portal/index.html portal/style.css portal/app.js _site/
            cp data/clubs.json _site/data/clubs.json
        - uses: actions/configure-pages@v4
        - uses: actions/upload-pages-artifact@v3
          with: { path: '_site' }
        - uses: actions/deploy-pages@v4
          id: deployment
  ```

- [x] **Schritt 3: Commit**

  ```bash
  git add .github/
  git commit -m "ci: add monthly crawler + GitHub Pages deploy workflows"
  ```

---

### Task 4: Push to GitHub

- [ ] **Schritt 1: Alle Commits pushen**

  ```bash
  git push origin main
  ```

- [ ] **Schritt 2: GitHub Pages aktivieren**

  In den Repo-Settings unter *Pages*: Source = **GitHub Actions**.

  Nach dem ersten Push läuft `pages.yml` automatisch durch und die URL ist:
  `https://<user>.github.io/basketball-vereinsregister-deutschland/`

---

## Manuelles Erstbefüllen

Nach dem Setup einmalig den Crawler manuell triggern:

```
GitHub → Actions → "Monthly Crawler" → Run workflow
```

Dadurch wird `data/clubs.json` befüllt, committed und der Pages-Deploy ausgelöst.
