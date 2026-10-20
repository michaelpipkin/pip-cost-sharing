import { Page, test as base } from '@playwright/test';
import { FIRST_NAVIGATION_TIMEOUT_MS } from '../constants';
import { AuthPage } from '../pages/auth.page';

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
  // The first page load of each freshly launched Chromium stalls 10-33 s on
  // this machine even when the dev server is warm (see
  // FIRST_NAVIGATION_TIMEOUT_MS); the worker's later contexts load in 1-3 s.
  // Pay that once per worker here, with a generous bound, so it can't land
  // on a test's own timeouts and hide real load regressions. Waits for the
  // rendered login form (most tests' first page), not just the document: the
  // stall can also hit the route's lazily loaded dependencies after
  // DOMContentLoaded.
  browserWarmUp: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await new AuthPage(page).gotoLogin({
          timeout: FIRST_NAVIGATION_TIMEOUT_MS,
        });
      } finally {
        await context.close();
      }
      await use();
    },
    {
      scope: 'worker',
      auto: true,
      timeout: FIRST_NAVIGATION_TIMEOUT_MS + 30_000,
    },
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
