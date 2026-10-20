import { Page } from '@playwright/test';

/**
 * Configure Firebase to use emulators in the browser context.
 *
 * Kept exported only because e2e/feature-tour/feature-tour.capture.ts still
 * imports it; it does nothing against the real app (which picks its emulators
 * from the build environment).
 */
export async function configureFirebaseEmulators(page: Page) {
  await page.addInitScript(() => {
    // This script runs before the page loads and configures Firebase to use emulators
    // Set environment variable to match the app's expectation
    (window as any).environment = {
      production: false,
      useEmulators: true,
      buildDate: new Date(),
    };
  });
}
