import { expect, test } from '../fixtures';
import type { Page } from '@playwright/test';

/**
 * Helper function to wait for page load
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForSelector('app-root', { timeout: 10000 });
}

test.describe('Homepage - Basic Setup Validation', () => {
  test('should load the homepage successfully', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to load and handle LoadingService overlay
    await waitForPageLoad(page);

    // Basic checks to ensure the page loaded
    await expect(page).toHaveTitle(/PipSplit/i);

    // Check that we can see some basic content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have responsive viewport', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Test that page works on different viewport sizes
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should connect to Firebase emulators', async ({ preserveDataFirebasePage }) => {
    await preserveDataFirebasePage.goto('/');
    await waitForPageLoad(preserveDataFirebasePage);

    // Test that Firebase emulators are accessible
    // This validates our emulator integration
    const firestoreHealth = await preserveDataFirebasePage.request.get(
      'http://localhost:8080'
    );
    expect(firestoreHealth.ok()).toBeTruthy();

    const authHealth = await preserveDataFirebasePage.request.get('http://localhost:9099');
    expect(authHealth.ok()).toBeTruthy();
  });
});
