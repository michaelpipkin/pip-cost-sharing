import { expect, test } from '../fixtures';
import { TEST_CONFIG } from '../constants';
import type { Page } from '@playwright/test';

/**
 * Helper function to wait for page load
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForSelector('app-root', { timeout: 10000 });
}

test.describe('Navigation - Public Routes', () => {
  test('should navigate to home page', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Check we're on the home page
    await expect(page).toHaveURL('/');
    await expect(page).toHaveTitle(/PipSplit.*Home/i);
  });

  test('should navigate to help page', async ({ page }) => {
    await page.goto('/help');
    await waitForPageLoad(page);

    // Check we're on the help page
    await expect(page).toHaveURL('/help');
    await expect(page).toHaveTitle(/PipSplit.*Help/i);
  });

  test('should navigate to split expense page', async ({ page }) => {
    await page.goto('/split');
    await waitForPageLoad(page);

    // Check we're on the split page
    await expect(page).toHaveURL('/split');
    await expect(page).toHaveTitle(/PipSplit.*Split Expense/i);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/auth/login');
    await waitForPageLoad(page);

    // Check we're on the login page
    await expect(page).toHaveURL('/auth/login');
    await expect(page).toHaveTitle(/PipSplit.*Login/i);
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/auth/register');
    await waitForPageLoad(page);

    // Check we're on the register page
    await expect(page).toHaveURL('/auth/register');
    await expect(page).toHaveTitle(/PipSplit.*Register/i);
  });
});

test.describe('Navigation - Route Redirects', () => {
  test('should redirect from root to home', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // The route config shows '' redirects to '', so we should stay on root
    await expect(page).toHaveURL('/');
  });

  test('should redirect unknown routes to home', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await waitForPageLoad(page);

    // Should redirect to home due to wildcard route
    await expect(page).toHaveURL('/');
  });
});

test.describe('Navigation - Protected Routes (Unauthenticated)', () => {
  test('should handle protected groups route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/administration/groups');
    await waitForPageLoad(page);

    // Should redirect to login due to authGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected members route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/administration/members');
    await waitForPageLoad(page);

    // Should redirect due to authGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected categories route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/administration/categories');
    await waitForPageLoad(page);

    // Should redirect due to authGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected summary route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/analysis/summary');
    await waitForPageLoad(page);

    // Should redirect due to authGuard + groupGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected history route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/analysis/history');
    await waitForPageLoad(page);

    // Should redirect due to authGuard + groupGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });
});
