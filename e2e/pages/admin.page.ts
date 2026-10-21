import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/** A delivery-state filter chip of the email log (the testid suffix). */
export type EmailState =
  'all' | 'pending' | 'processing' | 'success' | 'error' | 'retry';

/**
 * The site-admin area (/admin/...): reached from the Account sidebar's Admin
 * link, then the tab bar. Reports, the email log and the error log.
 *
 * mail and app_errors are global collections other specs write to, so rows
 * are always found by the text a spec seeded (a subject or a component name),
 * never by position or by counting every row.
 */
export class AdminPage extends BasePage {
  readonly navAdminLink: Locator;
  readonly reportsTab: Locator;
  readonly emailLogTab: Locator;
  readonly errorLogTab: Locator;

  // Reports
  readonly reportSelect: Locator;
  readonly runReportButton: Locator;
  readonly reportResults: Locator;

  // Email log
  readonly emailRows: Locator;
  readonly emailDetailDeleteButton: Locator;
  readonly emailDetailCloseButton: Locator;

  // Error log
  readonly errorRows: Locator;
  readonly individualToggle: Locator;
  readonly groupedToggle: Locator;
  readonly errorDetailDeleteButton: Locator;
  readonly errorDetailCloseButton: Locator;

  // The shared delete confirmation
  readonly deleteConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.navAdminLink = page.getByTestId('nav-admin');
    this.reportsTab = page.getByTestId('admin-tab-reports');
    this.emailLogTab = page.getByTestId('admin-tab-email-log');
    this.errorLogTab = page.getByTestId('admin-tab-error-log');

    this.reportSelect = page.getByTestId('report-select');
    this.runReportButton = page.getByTestId('run-report-button');
    this.reportResults = page.getByTestId('report-results');

    this.emailRows = page.getByTestId('email-row');
    this.emailDetailDeleteButton = page.getByTestId(
      'email-detail-delete-button'
    );
    this.emailDetailCloseButton = page.getByTestId('email-detail-close-button');

    this.errorRows = page.getByTestId('error-row');
    this.individualToggle = page.getByTestId('error-view-toggle-individual');
    this.groupedToggle = page.getByTestId('error-view-toggle-grouped');
    this.errorDetailDeleteButton = page.getByTestId(
      'error-detail-delete-button'
    );
    this.errorDetailCloseButton = page.getByTestId('error-detail-close-button');

    this.deleteConfirmButton = page.getByTestId('delete-confirm-button');
  }

  // ---- Navigation ---------------------------------------------------------

  /**
   * Opens the admin area from the Account sidebar (which must be showing)
   * and waits for the Reports tab, the area's landing page.
   */
  async openFromAccount(): Promise<void> {
    await this.navAdminLink.click();
    await expect(this.page).toHaveURL(/\/admin\/reports$/);
    await expect(this.reportSelect).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Switches to the Email Log tab and waits for it to render. */
  async openEmailLog(): Promise<void> {
    await this.emailLogTab.click();
    await expect(this.page).toHaveURL(/\/admin\/email-log$/);
    await expect(
      this.page.getByRole('heading', { name: 'Email Delivery Log' })
    ).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Switches to the Error Log tab and waits for it to render. */
  async openErrorLog(): Promise<void> {
    await this.errorLogTab.click();
    await expect(this.page).toHaveURL(/\/admin\/error-log$/);
    await expect(
      this.page.getByRole('heading', { name: 'App Error Log' })
    ).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Reports ------------------------------------------------------------

  /** Picks the first report in the list (whatever it is) and runs it. */
  async runFirstReport(): Promise<void> {
    await this.reportSelect.click();
    await expect(this.selectPanel).toBeVisible();
    await this.selectPanel.getByRole('option').first().click();
    await expect(this.selectPanel).toBeHidden();
    await this.runReportButton.click();
  }

  // ---- Email log ----------------------------------------------------------

  /** The state filter chip. */
  emailChip(state: EmailState): Locator {
    return this.page.getByTestId(`email-state-chip-${state}`);
  }

  /** Selects a state filter and waits for the chip to show it pressed. */
  async filterEmails(state: EmailState): Promise<void> {
    await this.emailChip(state).click();
    await expect(this.emailChip(state)).toHaveAttribute('aria-pressed', 'true');
  }

  /** The email-log row(s) whose text includes `subject`. */
  emailRow(subject: string): Locator {
    return this.emailRows.filter({ hasText: subject });
  }

  /** Opens an email row's detail dialog, deletes it and confirms. */
  async deleteEmail(subject: string): Promise<void> {
    await this.deleteViaDetail(
      this.emailRow(subject),
      this.emailDetailDeleteButton,
      'Email deleted successfully'
    );
  }

  // ---- Error log ----------------------------------------------------------

  /** The error-log row(s) whose text includes `component`. */
  errorRow(component: string): Locator {
    return this.errorRows.filter({ hasText: component });
  }

  /** Switches to the individual view and waits for the toggle to show it. */
  async showIndividual(): Promise<void> {
    await this.individualToggle.locator('button').click();
    await expect(this.individualToggle).toHaveClass(
      /mat-button-toggle-checked/
    );
  }

  /** Switches to the grouped view and waits for the toggle to show it. */
  async showGrouped(): Promise<void> {
    await this.groupedToggle.locator('button').click();
    await expect(this.groupedToggle).toHaveClass(/mat-button-toggle-checked/);
  }

  /** Opens an error row's detail dialog, deletes it and confirms. */
  async deleteError(component: string): Promise<void> {
    await this.deleteViaDetail(
      this.errorRow(component),
      this.errorDetailDeleteButton,
      'Error(s) deleted successfully'
    );
  }

  // ---- Shared -------------------------------------------------------------

  /**
   * Opens a log row's detail dialog, presses its Delete button, confirms in
   * the shared delete dialog and waits for the success snackbar and overlay.
   */
  private async deleteViaDetail(
    row: Locator,
    detailDeleteButton: Locator,
    successMessage: string
  ): Promise<void> {
    await row.click();
    await detailDeleteButton.click();
    await this.deleteConfirmButton.click();
    await expect(this.snackbarWith(successMessage)).toBeVisible();
    await this.waitForLoadingComplete();
  }
}
