import { Page, test as base } from '@playwright/test';
import {
  FIRST_NAVIGATION_TIMEOUT_MS,
  SHARED_BROWSER_WS_ENDPOINT_ENV,
} from '../constants';
import { AuthPage } from '../pages/auth.page';

// Define types for our fixtures
type TestFixtures = {
  // Page with clipboard permissions. The test emulators are already running
  // and seeded by global setup (started via `pnpm e2e`), so no probes here.
  seededPage: Page;
};

type WorkerFixtures = {
  // Loads the login page once per worker; see the fixture below.
  browserWarmUp: void;
};

// Extend base test with our fixtures
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Workers connect to the browser global setup launched and warmed
  // (e2e/global-setup.ts) instead of launching their own: a fresh Chromium's
  // first page loads set off a machine-wide stall here (see
  // FIRST_NAVIGATION_TIMEOUT_MS) that also froze the other worker's test.
  // Connect options Playwright already has (the config, or a tool such as
  // the VS Code extension's "show browser") win. Without the variable
  // (feature-tour config, which has no global setup; headed and --debug
  // runs) each worker launches a browser as usual.
  connectOptions: [
    async ({ connectOptions }, use) => {
      const wsEndpoint = process.env[SHARED_BROWSER_WS_ENDPOINT_ENV];
      await use(connectOptions ?? (wsEndpoint ? { wsEndpoint } : undefined));
    },
    { scope: 'worker' },
  ],

  // Loads the login page once per worker before its first test, with a
  // generous bound. In the suite the browser is the shared, already warmed
  // one, so this takes a second or two; where a worker launches its own
  // browser (feature-tour), it absorbs that browser's first-load stall (one
  // to six ~10 s units) so it can't land on a test's own timeouts. Waits for
  // the rendered login form (most tests' first page), not just the
  // document: the stall can also hit the route's lazily loaded dependencies
  // after DOMContentLoaded.
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
