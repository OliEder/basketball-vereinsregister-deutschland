// Accessibility-Tests für das Portal (WCAG 2.2).
//
//  1. AA-Gate      axe-core, Regeln A/AA bis WCAG 2.2 — muss fehlerfrei sein
//  2. AAA-Ratchet  axe-core AAA-Regeln (z. B. Kontrast 7:1) + eigene Prüfung der Zielgröße (2.5.5, 44×44 px).
//                  Bekannte Verstöße stehen in aaa-baseline.json; neue Verstöße lassen den Test scheitern.
//                  Verbesserungen werden gemeldet; `UPDATE_A11Y_BASELINE=1 npx playwright test --workers=1` schreibt die Baseline neu.
//  3. Tastatur     sichtbarer Fokus (2.4.7), Reflow bei 320 px (1.4.10)
//
// Hinweis: Automatische Tests decken nur einen Teil von WCAG ab (axe-core ca. 30–40 %). Kriterien wie
// Linkzweck im Kontext, sinnvolle Alternativtexte, Leseniveau (AAA 3.1.5) oder Konsistenz brauchen manuelle Prüfung.
import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

const BASELINE_PATH = path.join(__dirname, 'aaa-baseline.json');
const nm = path.join(__dirname, '..', '..', 'node_modules');

type Step = (page: Page) => Promise<void>;
const search: Step = async page => {
  await page.fill('#name-input', 'Schwabing');
  await page.click('#name-btn');
};

const PAGES: Array<{ name: string; url: string; ready: string; action?: Step }> = [
  { name: 'Startseite', url: '/index.html', ready: '#stats-bar:not(:empty)' },
  { name: 'Startseite mit Ergebnissen', url: '/index.html', ready: '.club-card', action: search },
  { name: 'Vereinsseite', url: '/bayern/noerdlingen/tsv-1861-noerdlingen/', ready: '.verein-team-card .verein-team-liga:not(.verein-team-loading)' },
  { name: 'Regionsseite Land', url: '/bayern/', ready: '.seo-list a' },
  { name: 'Regionsseite Ort', url: '/bayern/muenchen/', ready: '.seo-list a' },
  { name: 'Ligaseite', url: '/liga/regionalliga-suedost/1-regionalliga-herren-hr-sued/', ready: 'table.seo-table' },
  { name: 'Ligen eines Verbands', url: '/liga/regionalliga-suedost/', ready: '.seo-list a' },
  { name: 'Team-Seite', url: '/bayern/noerdlingen/tsv-1861-noerdlingen/herren/', ready: '.team-table' },
  { name: 'Team ohne Live-Daten', url: '/team.html?id=424242', ready: '.verein-error' }
];
const THEMES = ['light', 'dark'] as const;

async function open(page: Page, url: string, theme: string, ready: string, action?: Step) {
  // Externe Ressourcen: Fuse.js und Leaflet lokal liefern, alles andere (Schriften, Kacheln) blockieren
  await page.route(/^https?:\/\/(?!localhost)/, route => {
    const u = route.request().url();
    if (u.includes('fuse')) {
      // Das npm-Paket enthält keinen UMD-Build (den baut das CDN); die CJS-Datei wird zu einem globalen `Fuse` verpackt
      const cjs = fs.readFileSync(path.join(nm, 'fuse.js', 'dist', 'fuse.min.cjs'), 'utf-8');
      const body = `(function(){var module={exports:{}};var exports=module.exports;${cjs}\n;window.Fuse=module.exports.default||module.exports;})();`;
      return route.fulfill({ body, contentType: 'text/javascript' });
    }
    if (u.endsWith('leaflet.js')) return route.fulfill({ path: path.join(nm, 'leaflet', 'dist', 'leaflet.js'), contentType: 'text/javascript' });
    if (u.endsWith('leaflet.css')) return route.fulfill({ path: path.join(nm, 'leaflet', 'dist', 'leaflet.css'), contentType: 'text/css' });
    return route.abort();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(t => localStorage.setItem('theme', t), theme);
  await page.goto(url);
  if (action) await page.locator('#name-input, body').first().waitFor();
  if (action) await action(page);
  await page.locator(ready).first().waitFor({ timeout: 10_000 });
  // Übergänge/Animationen abstellen, damit axe keine Zwischenfarben misst
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await page.waitForTimeout(100);
}

function describe(violations: any[]): string {
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help}\n` + v.nodes.slice(0, 4).map((n: any) => `    ${n.target.join(' ')} — ${(n.any[0]?.message ?? n.failureSummary ?? '').split('\n')[0]}`).join('\n'))
    .join('\n');
}

// ---- 1. AA-Gate ------------------------------------------------------------------------------
for (const p of PAGES) {
  for (const theme of THEMES) {
    test(`AA: ${p.name} (${theme})`, async ({ page }) => {
      await open(page, p.url, theme, p.ready, p.action);
      const results = await new AxeBuilder({ page }).exclude('.leaflet-control-attribution')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(describe(results.violations), 'AA-Verstöße').toBe('');
    });
  }
}

// ---- 2. AAA-Ratchet --------------------------------------------------------------------------
async function targetSizeViolations(page: Page): Promise<string[]> {
  // WCAG 2.5.5 (AAA): Ziele mindestens 44×44 CSS-Pixel; Ausnahme: Links im Fließtext
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary';
    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') return;
      if (el.closest('.leaflet-container') || el.classList.contains('sr-only')) return;
      const inText = style.display === 'inline' && el.parentElement && (el.parentElement.textContent ?? '').trim() !== (el.textContent ?? '').trim();
      if (inText) return;
      // Stretched Link: die Klickfläche ist die ganze Karte (::after deckt den Container ab)
      const after = getComputedStyle(el, '::after');
      if (after.position === 'absolute' && after.content !== 'none' && parseFloat(after.width) >= 44 && parseFloat(after.height) >= 44) return;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} (${Math.round(r.width)}×${Math.round(r.height)})`);
    });
    return out;
  });
}

const found: Record<string, Record<string, number>> = {};
const baseline: Record<string, Record<string, number>> = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) : {};

for (const p of PAGES) {
  for (const theme of THEMES) {
    test(`AAA: ${p.name} (${theme})`, async ({ page }) => {
      await open(page, p.url, theme, p.ready, p.action);
      const key = `${p.name} (${theme})`;
      const counts: Record<string, number> = {};

      const axe = await new AxeBuilder({ page }).exclude('.leaflet-control-attribution').withTags(['wcag2aaa']).analyze();
      for (const v of axe.violations) counts[`axe:${v.id}`] = v.nodes.length;

      const small = await targetSizeViolations(page);
      if (small.length) counts['2.5.5-zielgroesse-44px'] = small.length;

      found[key] = counts;
      if (process.env.UPDATE_A11Y_BASELINE) return;

      const known = baseline[key] ?? {};
      const worse = Object.entries(counts).filter(([rule, n]) => n > (known[rule] ?? 0));
      const better = Object.entries(known).filter(([rule, n]) => (counts[rule] ?? 0) < n);
      if (better.length) console.log(`AAA verbessert [${key}]: ${better.map(([r, n]) => `${r} ${n}→${counts[r] ?? 0}`).join(', ')} — Baseline mit UPDATE_A11Y_BASELINE=1 aktualisieren`);
      expect(
        worse,
        `Neue AAA-Verstöße auf "${key}" (Regel, Anzahl; Baseline ${JSON.stringify(known)}):\n` +
          worse.map(([r, n]) => `  ${r}: ${n}`).join('\n') +
          `\n${describe(axe.violations)}\n${small.slice(0, 6).join('\n')}`
      ).toEqual([]);
    });
  }
}

test.afterAll(() => {
  if (process.env.UPDATE_A11Y_BASELINE && Object.keys(found).length) {
    // Datei frisch lesen: mehrere Worker schreiben nacheinander ihre Seiten hinein
    const current = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) : {};
    const merged = { ...current, ...found };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + '\n');
    console.log(`AAA-Baseline geschrieben: ${BASELINE_PATH}`);
  }
});

// ---- 3. Tastatur und Reflow --------------------------------------------------------------------
for (const p of PAGES.filter(x => x.name === 'Vereinsseite' || x.name === 'Team-Seite')) {
  test(`Tastatur: sichtbarer Fokus auf ${p.name}`, async ({ page }) => {
    await open(page, p.url, 'light', p.ready, p.action);
    const problems: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const shadow = s.boxShadow !== 'none';
        return { name: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`, visible: outline || shadow, width: parseFloat(s.outlineWidth) };
      });
      if (info && !info.visible) problems.push(info.name);
    }
    expect(problems, `Fokus nicht sichtbar bei: ${problems.join(', ')}`).toEqual([]);
  });
}

for (const p of PAGES) {
  test(`Reflow bei 320 px: ${p.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, p.url, 'light', p.ready, p.action);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontaler Scrollbereich bei 320 px').toBeLessThanOrEqual(1);
  });
}

const TEAM_URL = /(tsv-1861-noerdlingen\/[a-z0-9-]+\/(\?liga=\d+)?|team\.html\?id=\d+)$/;   // statische Teamseite, sonst (ohne Live-Daten) die alte Adresse

// ---- Team-Teaser: erkennbar und per Tastatur erreichbar ------------------------------------------
test('Team-Karten sind als Link erkennbar', async ({ page }) => {
  await open(page, '/bayern/noerdlingen/tsv-1861-noerdlingen/', 'light', '.verein-team-card .verein-team-liga:not(.verein-team-loading)');
  const cards = page.locator('.verein-team-card');
  await expect(cards).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const card = cards.nth(i);
    await expect(card.locator('.verein-team-cta')).toContainText('Tabelle & Spielplan');
    const link = card.getByRole('link').first();
    await expect(link).toHaveAttribute('href', TEAM_URL);
    // Der Link deckt die ganze Karte ab: ein Klick auf die Kartenmitte folgt ihm
    const box = (await card.boundingBox())!;
    await card.click({ position: { x: box.width / 2, y: box.height - 8 } });
    await expect(page).toHaveURL(TEAM_URL);
    await page.goBack();
    await page.locator('.verein-team-card').first().waitFor();
  }
});

test('Spielplan: Heim "vs." und Auswärts "@" mit Textalternative', async ({ page }) => {
  await open(page, '/team.html?id=151009', 'light', '.team-match');
  const home = page.locator('.team-match-ha--home').first();
  const away = page.locator('.team-match-ha--away').first();
  await expect(home).toContainText('vs.');
  await expect(home).toContainText('Heimspiel gegen');
  await expect(away).toContainText('@');
  await expect(away).toContainText('Auswärtsspiel bei');
  // die sichtbaren Zeichen sind für Screenreader verborgen, der Text bleibt
  await expect(home.locator('[aria-hidden="true"]')).toHaveText('vs.');
});

test('Nächstes Spiel zeigt die gemeldete Halle ohne "Voraussichtlich"', async ({ page }) => {
  await open(page, '/team.html?id=151009', 'light', '.next-game-venue');
  await expect(page.locator('.next-game-venue-name')).toHaveText('Sporthalle Schwabing (gemeldet)');
  await expect(page.locator('.next-game-venue-label')).toHaveText('Spielort');
  await expect(page.locator('.next-game-venue-note')).toHaveCount(0);
  await expect(page.locator('.next-game-map')).toHaveCount(1);
});

test('Alte Vereinsadresse leitet auf die statische Seite um', async ({ page }) => {
  await open(page, '/verein.html?id=1235', 'light', '.verein-team-card');
  await expect(page).toHaveURL(/\/bayern\/noerdlingen\/tsv-1861-noerdlingen\/$/);
});

test('Statische Vereinsseite: Canonical, Inhalt ohne JavaScript, Sitemap', async ({ page, request }) => {
  const res = await request.get('/bayern/noerdlingen/tsv-1861-noerdlingen/');
  const html = await res.text();
  expect(html).toContain('<h1>TSV 1861 Nördlingen</h1>');
  expect(html).toMatch(/rel="canonical" href="https:\/\/[^"]+\/bayern\/noerdlingen\/tsv-1861-noerdlingen\/"/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/bayern/muenchen/mtsv-schwabing/');
  expect((await (await request.get('/robots.txt')).text())).toContain('Sitemap:');
});

test('Startseite verlinkt die Regionen', async ({ page }) => {
  await open(page, '/index.html', 'light', '#regions a');
  await expect(page.locator('#regions a[href="bayern/"]')).toBeVisible();
});

test('Ligaseite: Tabelle mit Kopfzellen, Vereinslinks und Eintrag in der Sitemap', async ({ request }) => {
  const html = await (await request.get('/liga/regionalliga-suedost/1-regionalliga-herren-hr-sued/')).text();
  expect(html).toContain('<th scope="col">Mannschaft</th>');
  expect(html).toContain('href="bayern/noerdlingen/tsv-1861-noerdlingen/herren/"');
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/liga/regionalliga-suedost/1-regionalliga-herren-hr-sued/');
});

test('Alte Team-Adresse leitet auf die statische Teamseite um', async ({ page }) => {
  await open(page, '/team.html?id=151009', 'light', '.team-table');
  await expect(page).toHaveURL(/\/bayern\/noerdlingen\/tsv-1861-noerdlingen\/herren\/$/);
});

test('Statische Teamseite: Inhalt ohne JavaScript, Verlinkung und strukturierte Daten', async ({ request }) => {
  const html = await (await request.get('/bayern/noerdlingen/tsv-1861-noerdlingen/herren/')).text();
  expect(html).toContain('<h1>TSV 1861 Nördlingen</h1>');
  expect(html).toContain('"@type":"SportsTeam"');
  expect(html).toContain('href="liga/regionalliga-suedost/1-regionalliga-herren-hr-sued/"');
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/bayern/noerdlingen/tsv-1861-noerdlingen/herren/');
});
