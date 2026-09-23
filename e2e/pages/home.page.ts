import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  readonly title: Locator;
  readonly navigationToolbar: Locator;
  readonly themeToggleButton: Locator;
  readonly splitPageLink: Locator;
  readonly featureTourButton: Locator;
  readonly featureTourDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.title = this.getByTestId('welcome-title');
    this.navigationToolbar = this.getByTestId('main-toolbar');
    this.themeToggleButton = this.getByTestId('theme-toggle-desktop');
    this.splitPageLink = this.getByTestId('split-expense-button');
    // "See what PipSplit can do" - opens the feature-tour screenshot
    // carousel dialog. Visible whether logged in or out.
    this.featureTourButton = this.getByTestId('feature-tour-button');
    this.featureTourDialog = this.page.locator('mat-dialog-container');
  }

  /**
   * Open the feature-tour dialog from the home page
   */
  async openFeatureTour() {
    await this.featureTourButton.click();
    await this.featureTourDialog.waitFor({ state: 'visible' });
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
    await this.waitForLoadingComplete();
  }

  /**
   * Check if user is authenticated by looking for specific elements
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getByTestId('logout-button-desktop').waitFor({
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
