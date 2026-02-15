import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HistoryPage extends BasePage {
  // Main page elements
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly tourButton: Locator;

  // Filter elements
  readonly memberSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly clearFiltersButton: Locator;

  // Table elements
  readonly historyTable: Locator;
  readonly historyRows: Locator;
  readonly noDataMessage: Locator;
  readonly sortHeaders: Locator;

  // Detail elements
  readonly expandButtons: Locator;
  readonly detailRows: Locator;

  // Action buttons
  readonly deleteButtons: Locator;

  // Delete confirmation dialog
  readonly deleteDialog: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  // Generic elements
  readonly snackbar: Locator;

  constructor(page: Page) {
    super(page);

    // Main page - History component uses prefixed testids
    this.pageTitle = page.getByTestId('history-page-title');
    this.helpButton = page.getByTestId('history-help-button');
    this.tourButton = page.getByTestId('history-tour-button');

    // Filters
    this.memberSelect = page.getByTestId('member-select');
    this.startDateInput = page.getByTestId('start-date-input');
    this.endDateInput = page.getByTestId('end-date-input');
    this.clearFiltersButton = page.getByTestId('clear-filters-button');

    // Table - no data-testid, uses Material classes
    this.historyTable = page.locator('table.mat-mdc-table');
    this.historyRows = page.locator('table.mat-mdc-table tbody tr.mat-mdc-row');
    this.noDataMessage = page.getByText('No history found');
    this.sortHeaders = page.locator('th[mat-sort-header]');

    // Detail - History rows are clickable to expand/collapse (no separate buttons)
    this.expandButtons = page.locator(
      'table.mat-mdc-table tbody tr.mat-mdc-row'
    );
    this.detailRows = page.locator('tr.mat-mdc-row.detail-row');

    // Actions
    this.deleteButtons = page.getByTestId('delete-button');

    // Delete dialog
    this.deleteDialog = page.locator('mat-dialog-container');
    this.confirmDeleteButton = page.getByTestId('delete-confirm-button');
    this.cancelDeleteButton = page.getByTestId('delete-cancel-button');

    // Generic
    this.snackbar = page.locator('app-custom-snackbar');
  }

  async goto(): Promise<void> {
    await this.page.goto('/history');
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
    await this.clearFiltersButton.click();
    await this.page.waitForTimeout(500);
  }

  async sortBy(columnName: string): Promise<void> {
    const header = this.sortHeaders.filter({ hasText: columnName });
    await header.click();
    await this.page.waitForTimeout(300);
  }

  async expandDetail(rowIndex: number): Promise<void> {
    await this.expandButtons.nth(rowIndex).click();
    await this.page.waitForTimeout(300);
  }

  async deleteHistory(
    rowIndex: number,
    confirm: boolean = true
  ): Promise<void> {
    await this.deleteButtons.nth(rowIndex).click();
    await expect(this.deleteDialog).toBeVisible();

    if (confirm) {
      await this.confirmDeleteButton.click();
      await expect(this.deleteDialog).toBeHidden();
      await this.waitForLoadingComplete();
    } else {
      await this.cancelDeleteButton.click();
      await expect(this.deleteDialog).toBeHidden();
    }
  }

  async copyToClipboard(rowIndex: number): Promise<void> {
    // First expand the detail row if not already expanded
    await this.expandDetail(rowIndex);
    // Click on the detail row to copy to clipboard
    await this.detailRows.nth(rowIndex).click();
    await this.page.waitForTimeout(500);
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.helpButton).toBeVisible();
  }

  async verifyHistoryCount(expectedCount: number): Promise<void> {
    const count = await this.historyRows.count();
    expect(count).toBe(expectedCount);
  }

  async verifyEmptyState(): Promise<void> {
    await expect(this.noDataMessage).toBeVisible();
  }

  async getHistoryRecord(rowIndex: number): Promise<{
    paidBy: string;
    paidTo: string;
    amount: string;
    date: string;
  }> {
    const row = this.historyRows.nth(rowIndex);
    const cells = row.locator('td');

    return {
      date: (await cells.nth(0).textContent()) || '',
      paidTo: (await cells.nth(1).textContent()) || '',
      paidBy: (await cells.nth(2).textContent()) || '',
      amount: (await cells.nth(3).textContent()) || '',
    };
  }
}
