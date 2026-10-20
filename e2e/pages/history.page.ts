import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';
import { formatMoney, formatShortDate } from './expenses.page';

/** A payment as the History table (and the payment detail page) shows it. */
export interface ExpectedPayment {
  date: Date;
  paidBy: string;
  paidTo: string;
  amount: number;
}

/** One paid split as the payment detail page's split table shows it. */
export interface ExpectedPaidSplit {
  date: Date;
  category: string;
}

export class HistoryPage extends BasePage {
  readonly navHistoryLink: Locator;

  // History list
  readonly mainContainer: Locator;
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly currentGroupName: Locator;
  /** The group has no payments at all. */
  readonly noHistoryPlaceholder: Locator;
  /** The group has payments, but none for the member / dates selected. */
  readonly noFilteredHistoryPlaceholder: Locator;
  readonly memberSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;

  // History table: each column locator has one match per row, in order.
  readonly historyRows: Locator;
  readonly dateCells: Locator;
  readonly paidToCells: Locator;
  readonly paidByCells: Locator;
  readonly amountCells: Locator;

  // Payment detail page
  readonly detailContainer: Locator;
  readonly detailTitle: Locator;
  readonly backButton: Locator;
  readonly paidByName: Locator;
  readonly paidToName: Locator;
  readonly paymentDate: Locator;
  readonly paymentTotal: Locator;
  readonly copyButton: Locator;
  readonly unpayAllButton: Locator;
  readonly splitRows: Locator;

  // Confirm dialog (Unpay Payment)
  readonly confirmDialog: Locator;
  readonly confirmDialogText: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  // Generic
  readonly snackbar: Locator;
  readonly loadingOverlay: Locator;

  constructor(page: Page) {
    super(page);

    this.navHistoryLink = page.getByTestId('nav-history');

    this.mainContainer = page.getByTestId('history-main-container');
    this.pageTitle = page.getByTestId('history-page-title');
    this.helpButton = page.getByTestId('history-help-button');
    this.currentGroupName = this.mainContainer.getByTestId('current-group-name');
    this.noHistoryPlaceholder = page.getByTestId('no-history-placeholder-text');
    this.noFilteredHistoryPlaceholder = page.getByTestId(
      'no-filtered-history-placeholder-text'
    );
    this.memberSelect = page.getByTestId('member-select');
    this.startDateInput = page.getByTestId('start-date-input');
    this.endDateInput = page.getByTestId('end-date-input');

    this.historyRows = page.getByTestId('history-row');
    this.dateCells = this.historyRows.getByTestId('history-date');
    this.paidToCells = this.historyRows.getByTestId('history-paid-to');
    this.paidByCells = this.historyRows.getByTestId('history-paid-by');
    this.amountCells = this.historyRows.getByTestId('history-amount');

    this.detailContainer = page.getByTestId('history-detail-container');
    this.detailTitle = page.getByTestId('history-detail-page-title');
    this.backButton = this.detailContainer.getByTestId('back-button');
    this.paidByName = page.getByTestId('paid-by-name');
    this.paidToName = page.getByTestId('paid-to-name');
    this.paymentDate = page.getByTestId('payment-date');
    this.paymentTotal = page.getByTestId('payment-total');
    this.copyButton = this.detailContainer.getByTestId('copy-button');
    this.unpayAllButton = page.getByTestId('unpay-all-button');
    this.splitRows = page.getByTestId('history-split-row');

    this.confirmDialog = page.locator('mat-dialog-container');
    this.confirmDialogText = this.confirmDialog.getByTestId('confirmation-text');
    this.confirmButton = this.confirmDialog.getByTestId('confirm-button');
    this.cancelButton = this.confirmDialog.getByTestId('cancel-button');

    this.snackbar = page.getByTestId('snackbar');
    this.loadingOverlay = page.getByTestId('loading-spinner-container');
  }

  // ---- Navigation ---------------------------------------------------------

  /**
   * Opens History from the nav bar (the user must already be signed in) and
   * waits until it has loaded. In-app rather than a page.goto: a full load
   * of a deep link right after sign-in can be redirected to /expenses (see
   * ExpensesPage.gotoList).
   */
  async goto(): Promise<void> {
    await this.navHistoryLink.click();
    await expect(this.page).toHaveURL(/\/analysis\/history$/);
    await this.verifyPageLoaded();
  }

  /** History (already navigated to) has loaded and the overlay is gone. */
  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.helpButton).toBeVisible();
    await expect(this.loadingOverlay).toBeHidden();
  }

  /**
   * The snackbar showing `message`. Matched by text because an earlier
   * snackbar can still be in the DOM (exit animation) when a new one opens.
   */
  snackbarWith(message: string): Locator {
    return this.snackbar.filter({ hasText: message });
  }

  // ---- History list -------------------------------------------------------

  /** Asserts the table shows exactly these payments, in order. */
  async expectPayments(expected: ExpectedPayment[]): Promise<void> {
    await expect(this.historyRows).toHaveCount(expected.length);
    await expect(this.dateCells).toHaveText(
      expected.map((p) => formatShortDate(p.date))
    );
    await expect(this.paidToCells).toHaveText(expected.map((p) => p.paidTo));
    await expect(this.paidByCells).toHaveText(expected.map((p) => p.paidBy));
    await expect(this.amountCells).toHaveText(
      expected.map((p) => formatMoney(p.amount))
    );
  }

  /** Row `rowIndex`'s cells, as text. */
  async getHistoryRecord(rowIndex: number): Promise<{
    paidBy: string;
    paidTo: string;
    amount: string;
    date: string;
  }> {
    const text = async (cells: Locator) =>
      ((await cells.nth(rowIndex).textContent()) ?? '').trim();
    return {
      date: await text(this.dateCells),
      paidTo: await text(this.paidToCells),
      paidBy: await text(this.paidByCells),
      amount: await text(this.amountCells),
    };
  }

  /** The group has no payments. */
  async verifyEmptyState(): Promise<void> {
    await expect(this.noHistoryPlaceholder).toBeVisible();
  }

  // ---- Payment detail -----------------------------------------------------

  /**
   * Clicks row `rowIndex`, which opens that payment's detail page, and waits
   * for it (and its paid splits) to load.
   */
  async openDetail(rowIndex: number): Promise<void> {
    await this.historyRows.nth(rowIndex).click();
    await expect(this.page).toHaveURL(/\/analysis\/history\/[^/]+$/);
    await expect(this.detailTitle).toBeVisible();
    await expect(this.loadingOverlay).toBeHidden();
  }

  /**
   * Asserts the open detail page's payer, payee and date. Amounts are
   * asserted separately (expectDetailAmounts): the detail page formats them
   * with Angular's CurrencyPipe rather than the app's, a known bug pinned in
   * history.spec.ts.
   */
  async expectDetail(expected: ExpectedPayment): Promise<void> {
    await expect(this.paidByName).toHaveText(`Paid By: ${expected.paidBy}`);
    await expect(this.paidToName).toHaveText(`Paid To: ${expected.paidTo}`);
    await expect(this.paymentDate).toHaveText(
      `Date: ${formatShortDate(expected.date)}`
    );
  }

  /**
   * Asserts the open detail page's split table (Split Details view), in
   * order, without amounts (see expectDetail).
   */
  async expectPaidSplits(expected: ExpectedPaidSplit[]): Promise<void> {
    await expect(this.splitRows).toHaveCount(expected.length);
    await expect(this.splitRows.getByTestId('split-date')).toHaveText(
      expected.map((s) => formatShortDate(s.date))
    );
    await expect(this.splitRows.getByTestId('split-category')).toHaveText(
      expected.map((s) => s.category)
    );
  }

  /**
   * Asserts the open detail page's total and split amounts, formatted the
   * way the rest of the app shows money in this (USD) group.
   */
  async expectDetailAmounts(
    total: number,
    splitAmounts: number[]
  ): Promise<void> {
    await expect(this.paymentTotal).toHaveText(
      `Amount: ${formatMoney(total)}`
    );
    await expect(this.splitRows.getByTestId('split-amount')).toHaveText(
      splitAmounts.map(formatMoney)
    );
  }

  /** Back to the History list (from the detail page). */
  async backToList(): Promise<void> {
    await this.backButton.click();
    await expect(this.page).toHaveURL(/\/analysis\/history$/);
    await this.verifyPageLoaded();
  }

  /**
   * On the open detail page: copies the payment summary. Its category
   * breakdown comes from the paid splits, so wait for those first.
   */
  async copyDetailToClipboard(): Promise<void> {
    await this.copyButton.click();
    await expect(
      this.snackbarWith('Payment summary copied to clipboard')
    ).toBeVisible();
  }

  /** Opens row `rowIndex`'s detail page and copies its payment summary. */
  async copyToClipboard(rowIndex: number): Promise<void> {
    await this.openDetail(rowIndex);
    await this.copyDetailToClipboard();
  }

  /**
   * On the open detail page (as a group admin): Unpay Payment, which asks
   * for confirmation. Confirming (confirmButton) marks the payment's splits
   * unpaid, deletes the history record and returns to the History list;
   * cancelButton keeps it.
   */
  async openUnpayDialog(): Promise<void> {
    await this.unpayAllButton.click();
    await expect(this.confirmDialogText).toBeVisible();
  }

  // ---- Legacy -------------------------------------------------------------
  // Kept only so e2e/critical-flows/expense-to-payment-flow.spec.ts compiles
  // until it is repaired (Plan 2 Task 7). History rows no longer expand: they
  // open the payment detail page (openDetail / splitRows).

  /** @deprecated Use openDetail; see the Legacy note above. */
  async expandDetail(rowIndex: number): Promise<void> {
    await this.openDetail(rowIndex);
  }

  /** @deprecated Use splitRows; see the Legacy note above. */
  get detailRows(): Locator {
    return this.splitRows;
  }
}
