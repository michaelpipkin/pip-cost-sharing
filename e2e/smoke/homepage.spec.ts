import { expect, test } from '../fixtures';
import { HomePage } from '../pages/home.page';

test.describe('Homepage - Basic Setup Validation', { tag: '@home' }, () => {
  test('should load the homepage successfully', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Basic checks to ensure the page loaded
    await expect(page).toHaveTitle(/PipSplit/i);

    // Check that we can see some basic content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have responsive viewport', async ({ page }) => {
    const homePage = new HomePage(page);
    await page.goto('/');

    // The toolbar renders the desktop or the mobile layout (BreakpointObserver),
    // each with its own app title; the other layout's title is not in the DOM.
    await homePage.setViewport(1200, 800);
    await expect(homePage.desktopAppTitle).toBeVisible();
    await expect(homePage.mobileAppTitle).toHaveCount(0);

    await homePage.setViewport(375, 667);
    await expect(homePage.mobileAppTitle).toBeVisible();
    await expect(homePage.desktopAppTitle).toHaveCount(0);
  });

  test('should open the feature tour dialog', async ({ page }) => {
    const homePage = new HomePage(page);
    // Plain goto (not homePage.goto()) - background analytics requests can
    // keep networkidle from ever settling; the assertions below auto-wait.
    await page.goto('/');

    await expect(homePage.featureTourButton).toBeVisible();
    await expect(homePage.featureTourButton).toContainText(
      'See what PipSplit can do'
    );

    await homePage.openFeatureTour();
    await expect(homePage.featureTourDialog).toBeVisible();
  });
});
