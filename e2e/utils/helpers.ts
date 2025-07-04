import { Page } from '@playwright/test';

/**
 * Wait for Angular to be ready
 */
export async function waitForAngular(page: Page) {
  await page.waitForFunction(() => {
    return (window as any)
      .getAllAngularTestabilities?.()
      .every((testability: any) => testability.isStable());
  });
}

/**
 * Fill form field and wait for validation
 */
export async function fillAndValidate(
  page: Page,
  selector: string,
  value: string
) {
  await page.fill(selector, value);
  await page.locator(selector).blur();
  await waitForAngular(page);
}

/**
 * Check if element is visible
 */
export async function isVisible(
  page: Page,
  selector: string
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if element exists in DOM
 */
export async function exists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(page: Page, url?: string) {
  if (url) {
    await page.waitForURL(url);
  } else {
    await page.waitForLoadState('networkidle');
  }
  await waitForAngular(page);
}

/**
 * Take screenshot with timestamp
 */
export async function takeScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  url: string | RegExp,
  response: any,
  status: number = 200
) {
  await page.route(url, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Clear local storage and session storage
 */
export async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
