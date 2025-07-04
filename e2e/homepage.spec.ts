import { expect, test } from './fixtures';

test.describe('Homepage - Basic Setup Validation', () => {
  test('should load the homepage successfully', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Basic checks to ensure the page loaded
    await expect(page).toHaveTitle(/PipSplit/i);

    // Check that we can see some basic content
    // Adjust these selectors based on your actual homepage content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have responsive viewport', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test that page works on different viewport sizes
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should connect to Firebase emulators', async ({ firebasePage }) => {
    await firebasePage.goto('/');
    await firebasePage.waitForLoadState('networkidle');

    // Test that Firebase emulators are accessible
    // This validates our emulator integration
    const firestoreHealth = await firebasePage.request.get(
      'http://localhost:8080'
    );
    expect(firestoreHealth.ok()).toBeTruthy();

    const authHealth = await firebasePage.request.get('http://localhost:9099');
    expect(authHealth.ok()).toBeTruthy();
  });
});
