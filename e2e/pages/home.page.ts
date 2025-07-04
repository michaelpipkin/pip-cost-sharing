import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  readonly title: Locator;
  readonly navigationToolbar: Locator;
  readonly themeToggleButton: Locator;
  readonly splitPageLink: Locator;

  constructor(page: Page) {
    super(page);
    this.title = this.getByTestId('app-title');
    this.navigationToolbar = this.getByTestId('navigation-toolbar');
    this.themeToggleButton = this.getByTestId('theme-toggle');
    this.splitPageLink = this.getByTestId('split-page-link');
  }

  /**
   * Navigate to the home page
   */
  async goto() {
    await super.goto('/');
    await this.waitForLoad();
  }

  /**
   * Toggle the theme
   */
  async toggleTheme() {
    await this.themeToggleButton.click();
  }

  /**
   * Navigate to split page
   */
  async goToSplitPage() {
    await this.splitPageLink.click();
  }

  /**
   * Check if user is authenticated by looking for specific elements
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // Adjust this selector based on your actual authenticated state indicators
      await this.getByTestId('user-menu').waitFor({
        state: 'visible',
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the page is responsive on mobile
   */
  async checkMobileResponsiveness() {
    await this.page.setViewportSize({ width: 375, height: 667 });
    await this.waitForLoad();
    // Add specific mobile checks here
  }
}
