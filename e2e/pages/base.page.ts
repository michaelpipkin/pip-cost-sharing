import { expect, Locator, Page } from '@playwright/test';
import { TEST_CONFIG } from '../constants';

export abstract class BasePage {
  readonly page: Page;
  /** Every snackbar in the DOM; see snackbarWith. */
  readonly snackbar: Locator;
  /** The open mat-select panel. */
  readonly selectPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.snackbar = page.getByTestId('snackbar');
    this.selectPanel = page.getByRole('listbox');
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
   * The snackbar showing `message`. Matched by text because an earlier
   * snackbar can still be in the DOM (exit animation) when a new one opens.
   */
  snackbarWith(message: string): Locator {
    return this.snackbar.filter({ hasText: message });
  }

  /** A mat-select option in the open panel, matched on its full text. */
  option(name: string): Locator {
    return this.selectPanel.getByRole('option', { name, exact: true });
  }

  /**
   * Picks `name` in a mat-select: opens it, clicks the exact option (without
   * `exact`, "Bob" would also match "Bobby"), then waits for the panel to
   * close and the select to show the name.
   */
  async chooseOption(select: Locator, name: string): Promise<void> {
    await select.click();
    await expect(this.selectPanel).toBeVisible();
    await this.option(name).click();
    await expect(this.selectPanel).toBeHidden();
    await expect(select).toHaveText(name);
  }

  /** The switch inside a mat-slide-toggle (it carries the checked state). */
  switchOf(toggle: Locator): Locator {
    return toggle.getByRole('switch');
  }

  /**
   * Sets a mat-slide-toggle to `checked`: clicks its switch only when it
   * isn't already, then waits for the state to take. Not setChecked(): that
   * re-reads the state synchronously after its click, but aria-checked only
   * updates on the app's next (zoneless) change detection.
   */
  async setSwitch(toggle: Locator, checked: boolean): Promise<void> {
    const control = this.switchOf(toggle);
    if ((await control.isChecked()) !== checked) {
      await control.click();
    }
    await expect(control).toBeChecked({ checked });
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
