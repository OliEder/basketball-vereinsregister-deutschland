# Design Spec: Projekt-Teaser & SVG Icon Konsistenz

**Datum:** 2026-04-16  
**Status:** Approved

---

## Überblick

Zwei zusammenhängende Verbesserungen am Portal:

1. **Projekt-Teaser im Leerzustand** — Links zu anderen Basketball-Projekten erscheinen wenn keine Suchergebnisse angezeigt werden.
2. **SVG Icon Konsistenz** — Alle Emojis auf der Seite werden durch Outline SVG Icons ersetzt (gleicher Stil wie Heroicons).

---

## 1. Projekt-Teaser

### Verhalten

- Erscheint unterhalb der Such-Sektion im Leerzustand (vor der ersten Suche, keine Ergebnisse).
- Wird per JavaScript ausgeblendet sobald Suchergebnisse angezeigt werden — und wieder eingeblendet wenn die Ergebnisse geleert werden.

### Layout

- Kleines Label "Weitere Basketball-Tools" als Überschrift (uppercase, muted, klein).
- Zwei Karten nebeneinander via CSS Grid (`grid-template-columns: 1fr 1fr`), auf Mobile untereinander.
- Karten-Stil konsistent mit restlicher UI: `background: #1a1a2e`, `border: 1px solid #333`, `border-radius: 12px`, `padding: 1.25rem`.

### Karten-Inhalt

Jede Karte enthält:
- Outline SVG Icon (28px, `stroke: var(--orange)`, `stroke-width: 1.5`, kein Fill)
- Titel (fett, `color: var(--light)`)
- Kurzbeschreibung (klein, `color: var(--muted)`)
- Ganzes Karten-Element ist ein `<a>`-Link (öffnet in neuem Tab)

### Projekte

| Projekt | Icon | Beschreibung | URL |
|---|---|---|---|
| DBB Regelkunde | Buch (open-book) | Lerne die offiziellen Basketball-Regeln des DBB interaktiv. | https://olieder.github.io/dbb-regelkunde/ |
| JLS Prüfungsvorbereitung | Abschlusskappe (academic-cap) | Bereite dich auf die DBB Trainerlizenz-Prüfung vor. | https://olieder.github.io/DBB-JLS-Trainerlizenz-Pruefung/ |

### Hover

Border-Farbe wechselt auf `var(--orange)` (konsistent mit `.support-links a:hover`).

---

## 2. SVG Icon Konsistenz

### Betroffene Emojis

Alle Emojis in `portal/index.html` werden durch Inline SVGs ersetzt:

| Stelle | Aktuell | Ersatz-Icon | Stil |
|---|---|---|---|
| Hero-Badge (`#hero-badge`) | 🏀 | Basketball-Ball SVG (Kreis mit Linien) | Outline, `stroke: currentColor` |
| Feedback-Link (Footer) | 💬 | Chat-Bubble SVG | Outline, `stroke: currentColor` |
| Buy me a coffee (Footer) | ☕ | — (kein Icon, oder schlichter Punkt/Strich) | Text-only oder sehr simples Icon |

**Hinweis:** Der ☕-Link verweist auf einen externen Dienst mit eigenem Branding. Hier kann das Emoji entfernt und nur Text verwendet werden, oder ein generisches "Herz"-Icon eingesetzt werden.

### Icon-Stil (global)

- Heroicons Outline Stil: `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- Größe je nach Kontext: 20px für Inline-Text/Links, 28px für Karten
- SVGs werden inline in HTML eingebettet (kein externes Sprite, kein Font)

---

## Dateien

- `portal/index.html` — Projekt-Teaser HTML + SVG Icon Ersatz
- `portal/style.css` — Karten-Styles für Projekt-Teaser
- `portal/app.js` — Sichtbarkeitslogik (show/hide Teaser)
