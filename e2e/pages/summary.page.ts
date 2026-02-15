import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class SummaryPage extends BasePage {
  // Main page elements
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly tourButton: Locator;

  // Filter elements
  readonly memberSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly clearFiltersButton: Locator;

  // Summary table elements
  readonly summaryTable: Locator;
  readonly summaryRows: Locator;
  readonly noDataMessage: Locator;

  // Detail elements
  readonly expandButtons: Locator;
  readonly detailRows: Locator;

  // Action buttons
  readonly payButtons: Locator;

  // Payment dialog elements
  readonly paymentDialog: Locator;
  readonly paymentDialogTitle: Locator;
  readonly paymentMethodSelect: Locator;
  readonly paymentAmountInput: Locator;
  readonly paymentSaveButton: Locator;
  readonly paymentCancelButton: Locator;

  // Generic elements
  readonly snackbar: Locator;

  constructor(page: Page) {
    super(page);

    // Main page
    this.pageTitle = page.getByTestId('summary-page-title');
    this.helpButton = page.getByTestId('summary-help-button');
    this.tourButton = page.getByTestId('summary-tour-button');

    // Filters
    this.memberSelect = page.locator('mat-select[name="member"]');
    // Date inputs don't have testids - use label-based selectors
    this.startDateInput = page.getByLabel('Start date');
    this.endDateInput = page.getByLabel('End date');
    this.clearFiltersButton = page.getByTestId('clear-filters-button');

    // Summary table - no data-testid on table, use Material classes
    // Angular Material renders mat-table directive as .mat-mdc-table class
    this.summaryTable = page.locator('table.mat-mdc-table');
    this.summaryRows = page.locator(
      'table.mat-mdc-table tbody tr.mat-mdc-row.summary-row'
    );
    this.noDataMessage = page.getByText('No outstanding expenses found');

    // Detail - Summary rows are clickable to expand/collapse (no separate buttons)
    this.expandButtons = page.locator('tr.mat-mdc-row.summary-row');
    this.detailRows = page.locator('tr.mat-mdc-row.detail-row');

    // Actions - Pay button has mat-icon "paid" inside
    this.payButtons = page.locator('button:has(mat-icon:text("paid"))');

    // Payment dialog
    this.paymentDialog = page.locator('mat-dialog-container');
    this.paymentDialogTitle = page.getByTestId('payment-dialog-title');
    this.paymentMethodSelect = page.getByTestId('payment-method-select');
    this.paymentAmountInput = page.getByTestId('payment-amount-input');
    this.paymentSaveButton = page.getByTestId('submit-payment-button');
    this.paymentCancelButton = page.getByTestId('cancel-payment-button');

    // Generic
    this.snackbar = page.locator('app-custom-snackbar');
  }

  async goto(): Promise<void> {
    await this.page.goto('/summary');
    await this.waitForLoadingComplete();
  }

  async filterByMember(memberName: string): Promise<void> {
    await this.memberSelect.click();
    await this.page.locator(`mat-option:has-text("${memberName}")`).click();
    await this.page.waitForTimeout(500);
  }

  async filterByDateRange(startDate?: Date, endDate?: Date): Promise<void> {
    if (startDate) {
      await this.startDateInput.fill(startDate.toLocaleDateString());
      await this.startDateInput.blur();
    }
    if (endDate) {
      await this.endDateInput.fill(endDate.toLocaleDateString());
      await this.endDateInput.blur();
    }
    await this.page.waitForTimeout(500);
  }

  async clearFilters(): Promise<void> {
    // Each date input has its own clear button (aria-label="Clear")
    // that only appears when there's a value
    const clearButtons = this.page.locator('button[aria-label="Clear"]');
    const count = await clearButtons.count();

    // Click all visible clear buttons (from right to left to avoid index shifts)
    for (let i = count - 1; i >= 0; i--) {
      await clearButtons.nth(i).click();
      await this.page.waitForTimeout(200);
    }

    await this.page.waitForTimeout(300);
  }

  async expandDetail(rowIndex: number): Promise<void> {
    await this.expandButtons.nth(rowIndex).click();
    await this.page.waitForTimeout(300);
  }

  async getNetAmount(rowIndex: number): Promise<string> {
    const row = this.summaryRows.nth(rowIndex);
    const amountCell = row.locator('td').nth(2); // Assuming amount is in 3rd column
    return (await amountCell.textContent()) || '';
  }

  async openPaymentDialog(rowIndex: number): Promise<void> {
    await this.payButtons.nth(rowIndex).click();
    await this.page.waitForTimeout(500);
    await expect(this.paymentDialog).toBeVisible();
    await this.waitForLoadingComplete();
  }

  async fillPaymentForm(data: {
    paymentMethod?: string;
    amount?: number;
  }): Promise<void> {
    if (data.paymentMethod) {
      await this.paymentMethodSelect.click();
      await this.page
        .locator(`mat-option:has-text("${data.paymentMethod}")`)
        .click();
    }

    if (data.amount) {
      await this.paymentAmountInput.fill(data.amount.toString());
    }
  }

  async submitPayment(): Promise<void> {
    await this.paymentSaveButton.click();
    await expect(this.paymentDialog).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async cancelPayment(): Promise<void> {
    await this.paymentCancelButton.click();
    await expect(this.paymentDialog).toBeHidden();
  }

  async copyToClipboard(rowIndex: number): Promise<void> {
    // First expand the detail row if not already expanded
    await this.expandDetail(rowIndex);
    // Click on the detail content to copy to clipboard
    const detailContent = this.detailRows
      .nth(rowIndex)
      .locator('.detail-table-container');
    await detailContent.click();
    await this.page.waitForTimeout(500);
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.helpButton).toBeVisible();
  }

  async verifySummaryCount(expectedCount: number): Promise<void> {
    const count = await this.summaryRows.count();
    expect(count).toBe(expectedCount);
  }

  async verifyEmptyState(): Promise<void> {
    await expect(this.noDataMessage).toBeVisible();
  }
}
