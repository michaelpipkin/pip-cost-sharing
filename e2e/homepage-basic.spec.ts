import { expect, test } from '@playwright/test';

test.describe('Homepage - Basic Setup (No Firebase)', () => {
  test('should load the homepage successfully', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Angular to be ready
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Basic checks to ensure the page loaded
    await expect(page).toHaveTitle(/PipSplit/i);

    // Check that we can see the main Angular component
    await expect(page.locator('app-root')).toBeVisible();
  });

  test('should have responsive viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Test that page works on different viewport sizes
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('app-root')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('app-root')).toBeVisible();
  });

  test('should load without critical console errors', async ({ page }) => {
    const errors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check that we don't have critical console errors
    // Filter out common non-critical errors (fonts, favicons, etc.)
    const criticalErrors = errors.filter(
      (error) =>
        !error.includes('favicon.ico') &&
        !error.includes('Material Symbols') &&
        !error.includes('fonts.gstatic.com') &&
        !error.includes('net::ERR_FAILED') &&
        !error.includes('DevTools')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
