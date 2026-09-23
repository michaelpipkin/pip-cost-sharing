import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Repo root (two levels up from e2e/feature-tour/) - the webServer command
// must run there, since Playwright otherwise spawns it from this file's dir.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Playwright config for capturing the home page feature-tour screenshots.
 *
 * Deliberately separate from the root playwright.config.ts: that config's
 * `globalSetup` WIPES the Auth and Firestore emulators before every run.
 * This config has NO globalSetup, so running it leaves existing emulator
 * data (e.g. seed-data) alone - the capture script only adds its own
 * uniquely-named user/group.
 *
 * Relative paths below resolve against THIS file's directory
 * (e2e/feature-tour/), not the repo root.
 *
 * Run: pnpm screenshots:feature-tour
 * See feature-tour.capture.ts for prerequisites and output location.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.capture.ts',
  outputDir: '../../test-results/screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  // Setup (group, members, expenses, memorized) runs through the real UI
  // against the emulators, so allow more headroom than the e2e suite.
  timeout: 180 * 1000,
  expect: { timeout: 15 * 1000 },
  use: {
    baseURL: 'http://localhost:4200',
    actionTimeout: 30 * 1000,
    navigationTimeout: 30 * 1000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        // Tall enough that table pages (which fit their tables to the
        // available height) don't scroll rows out of view; captures are
        // cropped to the feature, so the extra height costs nothing.
        viewport: { width: 1280, height: 1000 },
      },
    },
    {
      // Pixel 7 is a Chromium device (412x839 CSS px @ 2.625 DPR), so
      // screenshots stay crisp and legible at phone width.
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer: {
    command: 'pnpm start',
    cwd: repoRoot,
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
