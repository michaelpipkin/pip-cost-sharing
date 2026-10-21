import { expect, Locator, Page } from '@playwright/test';
import { formatMoney } from '../utils/format';
import { BasePage } from './base.page';
import { ExpensesPage } from './expenses.page';
import { ReceiptPicker } from './receipt-picker';

/**
 * Create Expense From Receipt (/expenses/scan-receipt). The wizard hands its
 * result to Add Expense through an in-memory service, so it is only
 * reachable from the Expenses list in-app and Continue only works without a
 * reload in between. The scanReceipt callable must be mocked first
 * (mockScanReceipt).
 */
export class ScanReceiptPage extends BasePage {
  readonly expenses: ExpensesPage;
  readonly picker: ReceiptPicker;

  readonly container: Locator;
  /** The hidden file input: always in the DOM, so tests skip the dialogs. */
  readonly fileInput: Locator;
  readonly placeholder: Locator;
  readonly selectPhotoButton: Locator;
  readonly scannedFilename: Locator;
  readonly totalAmountInput: Locator;
  readonly taxAmountInput: Locator;
  readonly tipAmountInput: Locator;
  readonly descriptionInput: Locator;
  readonly lineItemRows: Locator;
  readonly memberSubtotals: Locator;
  readonly unassignedTotal: Locator;
  readonly taxTipTotal: Locator;
  readonly continueButton: Locator;

  /** The "Receipt Not Readable" ConfirmDialog. */
  readonly notReadableDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.expenses = new ExpensesPage(page);
    this.picker = new ReceiptPicker(page);

    this.container = page.getByTestId('scan-receipt-container');
    this.fileInput = this.container.getByTestId('file-input');
    this.placeholder = page.getByTestId('select-photo-placeholder');
    this.selectPhotoButton = page.getByTestId('select-photo-button');
    this.scannedFilename = page.getByTestId('scanned-filename');
    this.totalAmountInput = page.getByTestId('total-amount-input');
    this.taxAmountInput = page.getByTestId('tax-amount-input');
    this.tipAmountInput = page.getByTestId('tip-amount-input');
    this.descriptionInput = this.container.getByTestId('description-input');
    this.lineItemRows = page.getByTestId('line-item-row');
    this.memberSubtotals = page.getByTestId('member-subtotal');
    this.unassignedTotal = page.getByTestId('unassigned-items-total');
    this.taxTipTotal = page.getByTestId('tax-tip-total');
    this.continueButton = page.getByTestId('continue-button');

    this.notReadableDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Receipt Not Readable' });
  }

  /** From the Expenses list: Add New Expense, then Create From Receipt. */
  async openFromList(): Promise<void> {
    await this.expenses.addExpenseButton.click();
    await this.page.getByTestId('receipt-expense-button').click();
    await expect(this.page).toHaveURL(/\/expenses\/scan-receipt$/);
    await expect(this.container).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.placeholder).toBeVisible();
  }

  /** Feeds `file` to the scan (skipping the policy and picker dialogs). */
  async scanFile(file: string): Promise<void> {
    await this.fileInput.setInputFiles(file);
  }

  /** The assignee select of line item `index`. */
  assignee(index: number): Locator {
    return this.page.getByTestId(`line-item-assignee-${index}`);
  }

  async assignItem(index: number, member: string): Promise<void> {
    await this.chooseOption(this.assignee(index), member);
  }

  /** Asserts the running totals: per-member subtotals (in member order), then the two pools. */
  async expectTotals(expected: {
    members: { member: string; amount: number }[];
    unassigned: number;
    taxTip: number;
  }): Promise<void> {
    await expect(this.memberSubtotals).toHaveCount(expected.members.length);
    for (const [i, { member, amount }] of expected.members.entries()) {
      await expect(this.memberSubtotals.nth(i)).toContainText(member);
      await expect(this.memberSubtotals.nth(i)).toContainText(
        formatMoney(amount)
      );
    }
    await expect(this.unassignedTotal).toContainText(
      formatMoney(expected.unassigned)
    );
    await expect(this.taxTipTotal).toContainText(formatMoney(expected.taxTip));
  }

  /** Continue, then waits for Add Expense (prefilled) to be showing. */
  async continueToAddExpense(): Promise<void> {
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    await expect(this.page).toHaveURL(/\/expenses\/add$/);
    await expect(this.expenses.addExpenseContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }
}
