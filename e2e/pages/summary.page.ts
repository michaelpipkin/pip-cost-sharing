import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';
import { formatMoney, formatShortDate } from '../utils/format';

/** One who-owes-whom row of the Summary table. */
export interface ExpectedBalance {
  owedBy: string;
  owedTo: string;
  amount: number;
}

/** A payment service the payment dialog can list (payment-dialog.component). */
export type PaymentService = 'venmo' | 'paypal' | 'cashapp' | 'zelle';

/** One category line of an expanded Summary row. */
export interface ExpectedCategoryLine {
  category: string;
  amount: number;
}

export class SummaryPage extends BasePage {
  readonly navSummaryLink: Locator;

  // Page
  readonly mainContainer: Locator;
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly currentGroupName: Locator;
  /** The group has no unpaid splits at all. */
  readonly noUnpaidSplitsPlaceholder: Locator;
  /** The group has unpaid splits, but none for the member / dates selected. */
  readonly noMemberSplitsPlaceholder: Locator;

  // Filters
  readonly memberSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly clearStartDateButton: Locator;
  readonly clearEndDateButton: Locator;

  // Who-owes-whom table: each column locator has one match per row, in order.
  readonly summaryRows: Locator;
  readonly owedByCells: Locator;
  readonly owedToCells: Locator;
  readonly amountCells: Locator;
  readonly payButtons: Locator;

  // Expanded detail. One row is expanded at a time, but a row collapsed by
  // expanding another keeps its detail in the DOM until its leave animation
  // ends, so scope to a row with rowDetail() rather than using `detail`.
  /** Every detail in the DOM (for counting). */
  readonly detail: Locator;

  // Payment dialog
  readonly paymentDialog: Locator;
  readonly paymentDialogTitle: Locator;
  /** Shown when the payee has saved payment IDs. */
  readonly paymentInstructions: Locator;
  /** One per saved payment ID (Venmo, PayPal, CashApp, Zelle). */
  readonly paymentMethods: Locator;
  /** Shown instead when the payee has none. */
  readonly noPaymentMethodsMessage: Locator;
  readonly paymentSaveButton: Locator;
  readonly paymentCancelButton: Locator;

  // Generic

  constructor(page: Page) {
    super(page);

    this.navSummaryLink = page.getByTestId('nav-summary');

    this.mainContainer = page.getByTestId('summary-main-container');
    this.pageTitle = page.getByTestId('summary-page-title');
    this.helpButton = page.getByTestId('summary-help-button');
    this.currentGroupName = this.mainContainer.getByTestId('current-group-name');
    this.noUnpaidSplitsPlaceholder = page.getByTestId(
      'no-unpaid-splits-placeholder-text'
    );
    this.noMemberSplitsPlaceholder = page.getByTestId(
      'no-member-splits-placeholder-text'
    );

    this.memberSelect = page.getByTestId('member-select');
    this.startDateInput = page.getByTestId('start-date-input');
    this.endDateInput = page.getByTestId('end-date-input');
    this.clearStartDateButton = page.getByTestId('clear-start-date-button');
    this.clearEndDateButton = page.getByTestId('clear-end-date-button');

    this.summaryRows = page.getByTestId('summary-row');
    this.owedByCells = this.summaryRows.getByTestId('summary-owed-by');
    this.owedToCells = this.summaryRows.getByTestId('summary-owed-to');
    this.amountCells = this.summaryRows.getByTestId('summary-amount');
    this.payButtons = this.summaryRows.getByTestId('pay-expenses-button');

    this.detail = page.getByTestId('summary-detail');

    this.paymentDialog = page.locator('mat-dialog-container');
    this.paymentDialogTitle = page.getByTestId('payment-dialog-title');
    this.paymentInstructions = page.getByTestId('payment-instructions');
    this.paymentMethods = page
      .getByTestId('payment-methods-list')
      .getByRole('listitem');
    this.noPaymentMethodsMessage = page.getByTestId(
      'no-payment-methods-message'
    );
    this.paymentSaveButton = page.getByTestId('submit-payment-button');
    this.paymentCancelButton = page.getByTestId('cancel-payment-button');

  }

  // ---- Navigation ---------------------------------------------------------

  /**
   * Opens Summary from the nav bar (the user must already be signed in) and
   * waits until it has loaded its splits. In-app rather than a page.goto:
   * a full load of a deep link right after sign-in can be redirected to
   * /expenses (see ExpensesPage.gotoList).
   */
  async goto(): Promise<void> {
    await this.navSummaryLink.click();
    await expect(this.page).toHaveURL(/\/analysis\/summary$/);
    await this.verifyPageLoaded();
  }

  /** Summary (already navigated to) has loaded and the overlay is gone. */
  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.helpButton).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Filters ------------------------------------------------------------

  /** Picks the member whose balances the table shows (default: you). */
  async filterByMember(memberName: string): Promise<void> {
    await this.chooseOption(this.memberSelect, memberName);
  }

  /** Types the given start and/or end date (inclusive) and blurs each. */
  async filterByDateRange(startDate?: Date, endDate?: Date): Promise<void> {
    if (startDate) {
      await this.fillDate(this.startDateInput, startDate);
    }
    if (endDate) {
      await this.fillDate(this.endDateInput, endDate);
    }
  }

  private async fillDate(input: Locator, date: Date): Promise<void> {
    const text = formatShortDate(date);
    await input.fill(text);
    await input.blur();
    await expect(input).toHaveValue(text);
  }

  /**
   * Clears whichever date filters are set: a set date shows a clear button
   * in place of its datepicker toggle.
   */
  async clearFilters(): Promise<void> {
    if ((await this.startDateInput.inputValue()) !== '') {
      await this.clearStartDateButton.click();
      await expect(this.startDateInput).toHaveValue('');
    }
    if ((await this.endDateInput.inputValue()) !== '') {
      await this.clearEndDateButton.click();
      await expect(this.endDateInput).toHaveValue('');
    }
  }

  // ---- Table --------------------------------------------------------------

  /**
   * Asserts the table shows exactly these who-owes-whom rows, in order (the
   * app lists them by the other member's display name).
   */
  async expectBalances(expected: ExpectedBalance[]): Promise<void> {
    await expect(this.summaryRows).toHaveCount(expected.length);
    await expect(this.owedByCells).toHaveText(expected.map((b) => b.owedBy));
    await expect(this.owedToCells).toHaveText(expected.map((b) => b.owedTo));
    await expect(this.amountCells).toHaveText(
      expected.map((b) => formatMoney(b.amount))
    );
  }

  /**
   * Row `rowIndex`'s expanded detail (each summary row is followed by its
   * own detail row, empty unless expanded).
   */
  rowDetail(rowIndex: number): Locator {
    return this.page
      .getByTestId('summary-expanded-row')
      .nth(rowIndex)
      .getByTestId('summary-detail');
  }

  /** Clicks row `rowIndex` (expands it, or collapses it if expanded). */
  async expandDetail(rowIndex: number): Promise<void> {
    await this.summaryRows.nth(rowIndex).click();
  }

  /**
   * Asserts row `rowIndex`'s expanded detail shows exactly these category
   * lines, in order (by category name).
   */
  async expectCategoryLines(
    rowIndex: number,
    expected: ExpectedCategoryLine[]
  ): Promise<void> {
    const detail = this.rowDetail(rowIndex);
    await expect(detail).toBeVisible();
    const lines = detail.getByTestId('summary-detail-row');
    await expect(lines).toHaveCount(expected.length);
    await expect(lines.getByTestId('summary-detail-category')).toHaveText(
      expected.map((l) => l.category)
    );
    await expect(lines.getByTestId('summary-detail-amount')).toHaveText(
      expected.map((l) => formatMoney(l.amount))
    );
  }

  /** Expands row `rowIndex` and copies its summary (waits for the snackbar). */
  async copyToClipboard(rowIndex: number): Promise<void> {
    await this.expandDetail(rowIndex);
    await this.rowDetail(rowIndex).getByTestId('copy-summary-button').click();
    await expect(
      this.snackbarWith('Summary copied to clipboard')
    ).toBeVisible();
  }

  // ---- Payment dialog -----------------------------------------------------

  /** Clicks row `rowIndex`'s Pay button and waits for the payment dialog. */
  async openPaymentDialog(rowIndex: number): Promise<void> {
    await this.payButtons.nth(rowIndex).click();
    await expect(this.paymentDialogTitle).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Records the payment (marks the pair's splits paid). */
  async submitPayment(): Promise<void> {
    await this.paymentSaveButton.click();
    await expect(this.paymentDialog).toBeHidden();
    await this.waitForLoadingComplete();
  }

  /**
   * In the open payment dialog: copies the payee's ID for `service` with its
   * copy icon (the service's link would also open the service's site in a
   * new tab) and waits for the confirmation snackbar. Reading the clipboard
   * needs the `seededPage` fixture.
   */
  async copyPaymentId(service: PaymentService): Promise<void> {
    await this.paymentDialog.getByTestId(`copy-${service}-id-button`).click();
    await expect(
      this.snackbarWith('Payment ID copied to clipboard')
    ).toBeVisible();
  }

  async cancelPayment(): Promise<void> {
    await this.paymentCancelButton.click();
    await expect(this.paymentDialog).toBeHidden();
  }

  // ---- Empty states -------------------------------------------------------

  /** The group has no unpaid splits. */
  async verifyEmptyState(): Promise<void> {
    await expect(this.noUnpaidSplitsPlaceholder).toBeVisible();
  }
}
