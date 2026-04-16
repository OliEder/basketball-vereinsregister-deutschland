# Projekt-Teaser & SVG Icon Konsistenz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emojis auf der Seite durch konsistente Outline SVG Icons ersetzen, und einen Projekt-Teaser im Leerzustand einbauen der auf zwei andere Basketball-Projekte verweist.

**Architecture:** Alle Änderungen sind rein im Frontend (HTML/CSS/JS). Die Teaser-Sektion wird direkt in `index.html` eingebaut und per JavaScript in `app.js` ein-/ausgeblendet. Keine neuen Dateien nötig — Änderungen in den drei bestehenden Dateien.

**Tech Stack:** Vanilla HTML, CSS, JavaScript — keine Build-Tools, keine externen Icon-Libraries. SVGs werden inline eingebettet (Heroicons Outline Stil).

---

## Datei-Übersicht

- **Modify:** `portal/index.html` — Emojis ersetzen, Teaser-HTML einbauen
- **Modify:** `portal/style.css` — Styles für `.project-teaser` und `.project-cards`
- **Modify:** `portal/app.js` — `showResults`/`renderResults` um Teaser-Sichtbarkeit erweitern

---

### Task 1: SVG Icons für Hero-Badge und Footer

**Files:**
- Modify: `portal/index.html`

**Kontext:** Drei Emojis werden durch Inline SVGs ersetzt. Der Heroicons Outline Stil gilt überall: `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Inline SVGs erben `currentColor` vom Elternelement.

- [ ] **Schritt 1: Hero-Badge — Basketball SVG**

Ersetze in `portal/index.html` Zeile 21:
```html
<!-- Vorher -->
<div class="hero-badge">🏀 Deutschland</div>

<!-- Nachher -->
<div class="hero-badge">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 3a9 9 0 0 1 6.364 15.364M12 3A9 9 0 0 0 5.636 18.364M12 3v18M3 12h18"/>
  </svg>
  Deutschland
</div>
```

- [ ] **Schritt 2: Feedback-Link — Chat-Bubble SVG**

Ersetze in `portal/index.html` Zeile 83:
```html
<!-- Vorher -->
<a href="https://github.com/OliEder/basketball-vereinsregister-deutschland/discussions" target="_blank" rel="noopener" class="feedback-link">💬 Feedback geben</a>

<!-- Nachher -->
<a href="https://github.com/OliEder/basketball-vereinsregister-deutschland/discussions" target="_blank" rel="noopener" class="feedback-link">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
  </svg>
  Feedback geben
</a>
```

- [ ] **Schritt 3: Buy me a coffee — Herz SVG**

Ersetze in `portal/index.html` Zeile 85:
```html
<!-- Vorher -->
<a href="https://buymeacoffee.com/olivermarcus.eder" target="_blank" rel="noopener">☕ Buy me a coffee</a>

<!-- Nachher -->
<a href="https://buymeacoffee.com/olivermarcus.eder" target="_blank" rel="noopener">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/>
  </svg>
  Buy me a coffee
</a>
```

- [ ] **Schritt 4: Im Browser prüfen**

Öffne `portal/index.html` lokal (z.B. `open portal/index.html` oder via `npx serve portal`). Prüfe:
- Hero-Badge zeigt Basketball-Icon + "Deutschland" (kein Emoji)
- Footer-Feedback-Button zeigt Chat-Icon + "Feedback geben"
- Buy me a coffee zeigt Herz-Icon + Text

- [ ] **Schritt 5: SVG-Größen in `.hero-badge` und `.feedback-link` anpassen**

SVGs in Inline-Elementen brauchen `vertical-align` damit sie nicht aus der Linie springen. Füge in `portal/style.css` am Ende der Datei ein (vor dem letzten `}` falls es einen closing block gibt, sonst einfach anhängen):

```css
/* SVG icon alignment */
.hero-badge svg,
.feedback-link svg,
.support-links a svg {
  vertical-align: middle;
  margin-right: 0.3em;
}
```

- [ ] **Schritt 6: Commit**

```bash
git add portal/index.html portal/style.css
git commit -m "feat: replace emojis with outline SVG icons"
```

---

### Task 2: CSS für Projekt-Teaser

**Files:**
- Modify: `portal/style.css`

- [ ] **Schritt 1: Teaser-Styles einfügen**

Füge in `portal/style.css` direkt vor `/* ===== ANIMATIONS ===== */` ein:

```css
/* ===== PROJECT TEASER ===== */

#project-teaser {
  max-width: 740px;
  margin: 2rem auto 0;
  padding: 0 1.5rem;
}

.project-teaser-label {
  text-align: center;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 1rem;
}

.project-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.project-card {
  display: block;
  background: var(--dark-2);
  border: 1px solid var(--dark-4);
  border-radius: 12px;
  padding: 1.25rem;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s;
}

.project-card:hover {
  border-color: var(--orange);
}

.project-card svg {
  display: block;
  margin-bottom: 0.6rem;
  color: var(--orange);
}

.project-card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--light);
  margin-bottom: 0.25rem;
}

.project-card-desc {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
}

@media (max-width: 520px) {
  .project-cards {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Schritt 2: CSS-Variablen prüfen**

Verifiziere dass `var(--dark-2)`, `var(--dark-4)`, `var(--orange)`, `var(--muted)`, `var(--light)` in der `:root` Definition von `portal/style.css` vorhanden sind:

```bash
grep -n "\-\-dark-2\|\-\-dark-4\|\-\-orange\|\-\-muted\|\-\-light" portal/style.css | head -10
```

Falls eine Variable fehlt, füge sie in `:root { }` nach denselben Namenskonventionen ein.

- [ ] **Schritt 3: Commit**

```bash
git add portal/style.css
git commit -m "feat: add project teaser CSS styles"
```

---

### Task 3: Teaser-HTML in index.html einbauen

**Files:**
- Modify: `portal/index.html`

- [ ] **Schritt 1: Teaser-Sektion nach `<section id="results">` einfügen**

Ersetze in `portal/index.html` (nach der such-section, vor `</main>`):
```html
<!-- Vorher -->
    <section id="results">
      <p id="status-text"></p>
      <div id="map-container" style="display:none">
        <div id="map"></div>
      </div>
      <div id="results-list"></div>
    </section>
  </main>

<!-- Nachher -->
    <section id="results">
      <p id="status-text"></p>
      <div id="map-container" style="display:none">
        <div id="map"></div>
      </div>
      <div id="results-list"></div>
    </section>

    <div id="project-teaser">
      <p class="project-teaser-label">Weitere Basketball-Tools</p>
      <div class="project-cards">
        <a href="https://olieder.github.io/dbb-regelkunde/" target="_blank" rel="noopener" class="project-card">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
          <div class="project-card-title">DBB Regelkunde</div>
          <div class="project-card-desc">Lerne die offiziellen Basketball-Regeln des DBB interaktiv.</div>
        </a>
        <a href="https://olieder.github.io/DBB-JLS-Trainerlizenz-Pruefung/" target="_blank" rel="noopener" class="project-card">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84 51.39 51.39 0 0 0-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"/>
          </svg>
          <div class="project-card-title">JLS Prüfungsvorbereitung</div>
          <div class="project-card-desc">Bereite dich auf die DBB Trainerlizenz-Prüfung vor.</div>
        </a>
      </div>
    </div>
  </main>
```

- [ ] **Schritt 2: Im Browser prüfen**

Öffne `portal/index.html`. Der Teaser mit zwei Karten soll direkt unterhalb des (noch leeren) Suchergebnisbereichs sichtbar sein.

- [ ] **Schritt 3: Commit**

```bash
git add portal/index.html
git commit -m "feat: add project teaser HTML"
```

---

### Task 4: Teaser per JavaScript ein-/ausblenden

**Files:**
- Modify: `portal/app.js`

**Kontext:** Der Teaser soll ausgeblendet werden sobald Suchergebnisse angezeigt werden, und wieder eingeblendet werden wenn keine Ergebnisse mehr da sind. Die Funktion `renderResults` in `app.js` kontrolliert den Ergebnisbereich — dort wird die Teaser-Sichtbarkeit gesteuert.

- [ ] **Schritt 1: Teaser-Toggle-Funktion und Aufruf in `renderResults` einbauen**

In `portal/app.js`, füge direkt nach den Variablen-Deklarationen am Anfang der Datei (nach Zeile 8, nach `let lastResults = [];`) ein:

```js
function setTeaserVisible(visible) {
  const teaser = document.getElementById('project-teaser');
  if (teaser) teaser.style.display = visible ? '' : 'none';
}
```

Dann erweitere die Funktion `renderResults` (Zeile ~398) um den Teaser-Toggle am Ende:

```js
function renderResults(statusText) {
  const filtered = applyFilters(lastResults);
  const list = document.getElementById('results-list');
  const status = document.getElementById('status-text');
  while (list.firstChild) list.removeChild(list.firstChild);
  if (statusText) {
    status.textContent = filtered.length !== lastResults.length
      ? filtered.length + ' Verein(e) (gefiltert von ' + lastResults.length + ')'
      : statusText;
  }
  filtered.forEach(club => list.appendChild(renderClub(club)));
  updateMap(filtered);
  setTeaserVisible(filtered.length === 0 && lastResults.length === 0);
}
```

**Erklärung:** `setTeaserVisible(filtered.length === 0 && lastResults.length === 0)` — Teaser ist sichtbar wenn es weder gefilterte noch ungefilterte Ergebnisse gibt (echter Leerzustand). Sobald eine Suche Ergebnisse liefert (auch wenn Filter alles wegfiltert), bleibt der Teaser verborgen.

- [ ] **Schritt 2: Verhalten im Browser prüfen**

1. Lade `portal/index.html` neu — Teaser soll sichtbar sein.
2. Suche nach "Bayern" — Teaser soll verschwinden.
3. Lösche das Suchfeld / lade neu — Teaser soll wieder erscheinen.

- [ ] **Schritt 3: Commit**

```bash
git add portal/app.js
git commit -m "feat: show/hide project teaser based on search results"
```

---

## Spec Coverage Check

| Spec-Anforderung | Task |
|---|---|
| Projekt-Teaser im Leerzustand | Task 3 + 4 |
| Teaser verschwindet bei Ergebnissen | Task 4 |
| Grid-Layout, 2 Karten | Task 2 + 3 |
| Outline SVG Icons orange in Karten | Task 3 |
| Hover border-color orange | Task 2 |
| Hero-Badge 🏀 → SVG | Task 1 |
| Feedback-Link 💬 → SVG | Task 1 |
| Buy me a coffee ☕ → Herz SVG | Task 1 |
| Heroicons Outline Stil überall | Task 1 + 3 |
| Mobile: Karten untereinander | Task 2 |
