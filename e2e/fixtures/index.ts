import { Page, test as base } from '@playwright/test';

// Define types for our fixtures
type TestFixtures = {
  // Page with clipboard permissions. The test emulators are already running
  // and seeded by global setup (started via `pnpm e2e`), so no probes here.
  seededPage: Page;
  // Alias of seededPage; Plan 2 removes it once specs are migrated.
  preserveDataFirebasePage: Page;
};

// Extend base test with our fixtures
export const test = base.extend<TestFixtures>({
  seededPage: async ({ page }, use) => {
    // Grant clipboard permissions for copy-to-clipboard tests
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await use(page);
  },

  preserveDataFirebasePage: async ({ seededPage }, use) => {
    await use(seededPage);
  },
});

export { expect } from '@playwright/test';
