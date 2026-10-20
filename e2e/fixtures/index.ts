import { Page, test as base } from '@playwright/test';
import { TEST_CONFIG } from '../constants';

// Define types for our fixtures
type TestFixtures = {
  // Page with clipboard permissions. The test emulators are already running
  // and seeded by global setup (started via `pnpm e2e`), so no probes here.
  seededPage: Page;
};

type WorkerFixtures = {
  // Absorbs a fresh browser's slow first navigation; see the fixture below.
  browserWarmUp: void;
};

// Extend base test with our fixtures
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // The first navigation of each freshly launched Chromium stalls 10-30 s on
  // this machine (measured: 11 s, 21 s, 33 s) even when the dev server is
  // warm and answers other clients in well under a second (seen when
  // workers start together); the worker's later contexts load in ~1 s.
  // Pay that once per worker here, with a generous bound, so it can't land
  // on a test's own 30 s navigation timeout and hide real load regressions.
  browserWarmUp: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.goto(TEST_CONFIG.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
      } finally {
        await context.close();
      }
      await use();
    },
    { scope: 'worker', auto: true, timeout: 150_000 },
  ],

  seededPage: async ({ page }, use) => {
    // Grant clipboard permissions for copy-to-clipboard tests
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await use(page);
  },
});

export { expect } from '@playwright/test';
