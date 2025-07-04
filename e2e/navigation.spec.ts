import { expect, test } from '@playwright/test';
import { TEST_CONFIG } from './constants';

test.describe('Navigation - Public Routes', () => {
  test('should navigate to home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check we're on the home page
    await expect(page).toHaveURL('/');
    await expect(page).toHaveTitle(/PipSplit.*Home/i);
  });

  test('should navigate to help page', async ({ page }) => {
    await page.goto('/help');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check we're on the help page
    await expect(page).toHaveURL('/help');
    await expect(page).toHaveTitle(/PipSplit.*Help/i);
  });

  test('should navigate to split expense page', async ({ page }) => {
    await page.goto('/split');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check we're on the split page
    await expect(page).toHaveURL('/split');
    await expect(page).toHaveTitle(/PipSplit.*Split Expense/i);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check we're on the login page
    await expect(page).toHaveURL('/auth/login');
    await expect(page).toHaveTitle(/PipSplit.*Login/i);
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/auth/register');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Check we're on the register page
    await expect(page).toHaveURL('/auth/register');
    await expect(page).toHaveTitle(/PipSplit.*Register/i);
  });
});

test.describe('Navigation - Route Redirects', () => {
  test('should redirect from root to home', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // The route config shows '' redirects to '', so we should stay on root
    await expect(page).toHaveURL('/');
  });

  test('should redirect unknown routes to home', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Should redirect to home due to wildcard route
    await expect(page).toHaveURL('/');
  });
});

test.describe('Navigation - Protected Routes (Unauthenticated)', () => {
  test('should handle protected groups route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/groups');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Should either redirect to login or show some auth prompt
    // The exact behavior depends on your authGuard implementation
    // We'll just check that we're not stuck on the groups page without auth
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected members route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/members');
    await page.waitForSelector('app-root', { timeout: 10000 });

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
    await page.goto('/categories');
    await page.waitForSelector('app-root', { timeout: 10000 });

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
    await page.goto('/summary');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Should redirect due to authGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });

  test('should handle protected history route when not authenticated', async ({
    page,
  }) => {
    await page.goto('/history');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Should redirect due to authGuard
    const currentUrl = page.url();
    const isRedirected =
      currentUrl.includes('/auth/login') ||
      currentUrl === `${TEST_CONFIG.baseUrl}/`;

    expect(isRedirected).toBeTruthy();
  });
});
