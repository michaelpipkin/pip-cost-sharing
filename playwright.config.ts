import { defineConfig, devices } from '@playwright/test';
import { E2E_APP_PORT } from './scripts/test-env/config.mjs';

const baseURL = `http://localhost:${E2E_APP_PORT}`;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Global setup - verifies the test emulators are up, resets them and seeds data */
  globalSetup: './e2e/global-setup.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* A stray test.only must fail the run, not silently run one test and pass. */
  forbidOnly: true,
  retries: 0,
  /* 2 workers: 4 concurrent first page loads time out on the ng dev server here. Tests are isolated by seeded data each spec owns (see the pip-angular-testing skill). */
  workers: 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    actionTimeout: 30000,
    navigationTimeout: 30000,

    /* Keep a trace for failed tests (cheaper than video). See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording makes first page loads time out; traces cover failures. */
    video: 'off',
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Test against mobile viewports - disabled by default due to responsive design differences */
    /* To run mobile tests, use: playwright test --project="Mobile Chrome" */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
  timeout: 60 * 1000,
  /* Assertion timeout for every expect(). The 5 s default is shorter than a
     stall this machine shows (suspected AV scanning): in a 2-worker probe of
     80 iterations of "load login, sign in, full-load a deep link" (e2e
     repair, Task 8), 42 steps stalled for a near-constant extra 10-11.5 s
     while the rest settled in about 1.5 s. Seven stalls landed on an
     expect() (route render 10.3 s, loading overlay 10.4-12.5 s). 15 s clears
     the worst one measured. One config-level value on purpose: never raise
     a single call's timeout to hide it. */
  expect: { timeout: 15_000 },
  /* Dev server built with the e2e configuration (test emulators, demo project).
     The emulators themselves are started by `pnpm e2e` (with-test-emulators).
     reuseExistingServer is false on purpose: Playwright stops the server it
     starts, so reuse could only ever pick up a foreign server on 4300 (e.g. a
     dev-config ng serve pointing at the dev emulators). Fail loudly instead. */
  webServer: {
    command: 'pnpm exec ng serve --configuration e2e --host 127.0.0.1 --port 4300',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
