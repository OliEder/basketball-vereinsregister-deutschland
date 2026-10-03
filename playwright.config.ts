import { defineConfig } from '@playwright/test';

// Accessibility-Tests (WCAG 2.2) gegen eine lokal gebaute Kopie des Portals mit Testdaten.
// Aufruf: npm run test:a11y   (Browser: PLAYWRIGHT_BROWSERS_PATH bzw. `npx playwright install chromium`)
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/a11y',
  testMatch: '**/*.a11y.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath }
  },
  webServer: {
    command: 'node tests/a11y/serve.js',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI
  }
});
