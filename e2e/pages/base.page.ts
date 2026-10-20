import { expect, Locator, Page } from '@playwright/test';
import { TEST_CONFIG } from '../constants';

export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a specific path
   */
  async goto(
    path: string = '',
    options?: Parameters<Page['goto']>[1]
  ) {
    const fullUrl = path.startsWith('http')
      ? path
      : `${TEST_CONFIG.baseUrl}${path}`;
    await this.page.goto(fullUrl, options);
  }

  /**
   * Wait for the page to be loaded
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `test-results/${name}.png` });
  }

  /**
   * Get element by test id
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * Get element by role
   */
  getByRole(
    role: Parameters<Page['getByRole']>[0],
    options?: Parameters<Page['getByRole']>[1]
  ): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * Get element by text
   */
  getByText(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /**
   * Get element by label
   */
  getByLabel(text: string | RegExp): Locator {
    return this.page.getByLabel(text);
  }

  /**
   * Get element by placeholder
   */
  getByPlaceholder(text: string | RegExp): Locator {
    return this.page.getByPlaceholder(text);
  }

  /**
   * Waits until a full page load's initial navigation has committed: the
   * routed component renders as a sibling of <router-outlet> only then.
   * After it, the app's post-load redirect to /expenses (which only fires
   * while the router is still on '/') can no longer happen, so in-app
   * navigation is safe.
   */
  async waitForInitialNavigation() {
    await expect(
      this.page
        .getByTestId('main-content')
        .locator(':scope > :not(router-outlet)')
        .first()
    ).toBeVisible();
  }

  /**
   * Waits until the LoadingService overlay is gone. The overlay exists only
   * while loading is on, so this returns at once when nothing is loading:
   * callers that start a load must first wait for something the load is for
   * (a dialog closing, a URL), not on the overlay appearing.
   */
  async waitForLoadingComplete() {
    await this.page
      .getByTestId('loading-spinner-container')
      .waitFor({ state: 'hidden' });
  }
}
