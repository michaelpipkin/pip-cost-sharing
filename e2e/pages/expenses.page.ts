import { expect, Locator, Page } from '@playwright/test';
import { formatMoney, formatShortDate } from '../utils/format';
import { BasePage } from './base.page';
import { ExpenseForm, type SplitMethod } from './expense-form';

export type { SplitMethod } from './expense-form';

/** One split as the Expenses page's detail table shows it. */
export interface ExpectedSplit {
  member: string;
  amount: number;
}

/** A saved expense as its Expenses page row (and expanded detail) shows it. */
export interface ExpectedExpense {
  payer: string;
  category: string;
  total: number;
  splits: ExpectedSplit[];
  /** Shown as M/d/yyyy; defaults to not checked. */
  date?: Date;
}

export class ExpensesPage extends BasePage {
  readonly navExpensesLink: Locator;

  // Expenses list page
  readonly expensesContainer: Locator;
  /** The current group's name, shown above the list. */
  readonly currentGroupName: Locator;
  readonly addExpenseButton: Locator;
  /** "Enter Manual Expense" in the Add New Expense options dialog. */
  readonly manualExpenseButton: Locator;
  /** One per expense (not the expanded-detail rows). */
  readonly expenseRows: Locator;
  /** The expanded expense's split table (one expense is expanded at a time). */
  readonly expenseDetail: Locator;
  readonly expenseSplitRows: Locator;

  // Add Expense form. The form's fields, split rows and actions live in
  // ExpenseForm (shared with the memorized forms); the members below
  // delegate to it so specs keep using them directly.
  readonly form: ExpenseForm;
  readonly addExpenseContainer: Locator;
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly addExpenseForm: Locator;
  readonly dateInput: Locator;
  readonly datePickerToggle: Locator;
  readonly saveAndAddAnotherButton: Locator;
  readonly payerSelect: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly totalAmountInput: Locator;
  readonly proportionalAmountInput: Locator;
  readonly sharedRemainderAmount: Locator;
  readonly splitMethodToggles: Record<SplitMethod, Locator>;
  readonly addSplitButton: Locator;
  readonly addAllMembersButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  /** The per-split member selects - one per split, so also the split count. */
  readonly splitRows: Locator;
  readonly assignedAmountInputs: Locator;
  readonly percentageInputs: Locator;
  readonly sharesInputs: Locator;
  readonly allocatedAmounts: Locator;
  readonly deleteSplitButtons: Locator;

  // Receipt attachment
  readonly fileInput: Locator;
  readonly attachFileButton: Locator;
  readonly uploadPrompt: Locator;
  readonly attachedFilename: Locator;
  readonly removeFileButton: Locator;

  // Generic elements
  readonly formErrors: Locator;
  readonly calendar: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    super(page);

    this.navExpensesLink = page.getByTestId('nav-expenses');

    this.expensesContainer = page.getByTestId('expenses-container');
    this.currentGroupName = page.getByTestId('current-group-name');
    this.addExpenseButton = page.getByTestId('add-expense-button');
    this.manualExpenseButton = page.getByTestId('manual-expense-button');
    this.expenseRows = page.getByTestId('expense-row');
    this.expenseDetail = page.getByTestId('expense-detail');
    this.expenseSplitRows = this.expenseDetail.getByTestId('expense-split-row');

    this.addExpenseContainer = page.getByTestId('add-expense-container');
    this.form = new ExpenseForm(page, this.addExpenseContainer);
    this.pageTitle = page.getByTestId('page-title');
    this.helpButton = page.getByTestId('help-button');
    this.addExpenseForm = page.getByTestId('add-expense-form');
    this.dateInput = page.getByTestId('date-input');
    this.datePickerToggle = page.getByTestId('date-picker-toggle');
    this.saveAndAddAnotherButton = page.getByTestId(
      'save-and-add-another-button'
    );

    this.fileInput = page.getByTestId('file-input');
    this.attachFileButton = page.getByTestId('attach-file-button');
    this.uploadPrompt = page.getByTestId('upload-prompt');
    this.attachedFilename = page.getByTestId('attached-filename');
    this.removeFileButton = page.getByTestId('remove-file-button');

    this.formErrors = page.locator('mat-error');
    this.calendar = page.locator('mat-calendar');
    this.confirmDeleteButton = page.getByTestId('delete-confirm-button');

    const form = this.form;
    this.payerSelect = form.payerSelect;
    this.descriptionInput = form.descriptionInput;
    this.categorySelect = form.categorySelect;
    this.totalAmountInput = form.totalAmountInput;
    this.proportionalAmountInput = form.proportionalAmountInput;
    this.sharedRemainderAmount = form.sharedRemainderAmount;
    this.splitMethodToggles = form.splitMethodToggles;
    this.addSplitButton = form.addSplitButton;
    this.addAllMembersButton = form.addAllMembersButton;
    this.saveButton = form.saveButton;
    this.cancelButton = form.cancelButton;
    this.splitRows = form.splitRows;
    this.assignedAmountInputs = form.assignedAmountInputs;
    this.percentageInputs = form.percentageInputs;
    this.sharesInputs = form.sharesInputs;
    this.allocatedAmounts = form.allocatedAmounts;
    this.deleteSplitButtons = form.deleteSplitButtons;
  }

  // ---- Navigation ---------------------------------------------------------

  /**
   * Loads Expenses with a full page load and waits for the current group's
   * list. A full load is only safe for /expenses itself, so other expense
   * pages are reached in-app: once the user's groups load,
   * GroupService.handleGroupsSnapshot redirects to /expenses whenever router.url is
   * '/' - and router.url stays '/' until the initial navigation commits, so
   * a deep link whose lazy route is still loading (a cold page load) gets
   * replaced by /expenses.
   */
  async gotoList(): Promise<void> {
    await this.page.goto('/expenses');
    await this.waitForList();
  }

  /** Opens Expenses from the nav bar (no reload) and waits for its list. */
  async navigateToList(): Promise<void> {
    await this.navExpensesLink.click();
    await expect(this.page).toHaveURL(/\/expenses$/);
    await this.waitForList();
  }

  /**
   * Opens Add Expense for the current group the way a user does (Expenses,
   * Add New Expense, Enter Manual Expense) and waits until the form has its
   * group data: the payer select shows the signed-in member (the default
   * payer, applied once the member has loaded) and the overlay is gone.
   */
  async gotoAddExpense(): Promise<void> {
    await this.gotoList();
    await this.openAddExpense();
  }

  /** From the Expenses list: Add New Expense, then Enter Manual Expense. */
  async openAddExpense(): Promise<void> {
    await this.addExpenseButton.click();
    await this.manualExpenseButton.click();
    await expect(this.page).toHaveURL(/\/expenses\/add$/);
    await expect(this.addExpenseContainer).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.payerSelect).toHaveText(/\S/);
  }

  /** Waits for the Expenses page (already navigated to) to load its list. */
  async waitForList(): Promise<void> {
    await expect(this.expensesContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Form fields and splits (delegating to ExpenseForm) ------------------

  async selectPayer(memberName: string): Promise<void> {
    await this.form.selectPayer(memberName);
  }

  async selectCategory(categoryName: string): Promise<void> {
    await this.form.selectCategory(categoryName);
  }

  /** Changes split row `index`'s member. */
  async selectSplitMember(index: number, memberName: string): Promise<void> {
    await this.form.selectSplitMember(index, memberName);
  }

  async setDescription(description: string): Promise<void> {
    await this.form.setDescription(description);
  }

  async setTotalAmount(amount: number): Promise<void> {
    await this.form.setTotalAmount(amount);
  }

  async setProportionalAmount(amount: number): Promise<void> {
    await this.form.setProportionalAmount(amount);
  }

  /** See ExpenseForm.fillExpenseForm. */
  async fillExpenseForm(data: {
    description: string;
    amount: number;
    category?: string;
    proportionalAmount?: number;
  }): Promise<void> {
    await this.form.fillExpenseForm(data);
  }

  /** Picks a day of the month currently shown in the date picker. */
  async pickDate(date: Date): Promise<void> {
    await this.datePickerToggle.click();
    await expect(this.calendar).toBeVisible();
    const label = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    await this.calendar.getByRole('button', { name: label, exact: true }).click();
    await expect(this.calendar).toBeHidden();
    await expect(this.dateInput).toHaveValue(formatShortDate(date));
  }

  /** See ExpenseForm.addSplit. */
  async addSplit(member?: string, amount?: number): Promise<void> {
    await this.form.addSplit(member, amount);
  }

  async addAllMembers(): Promise<void> {
    await this.form.addAllMembers();
  }

  async removeSplit(index: number): Promise<void> {
    await this.form.removeSplit(index);
  }

  /** Sets split row `index`'s member amount (amount split method). */
  async updateSplitAmount(index: number, amount: number): Promise<void> {
    await this.form.updateSplitAmount(index, amount);
  }

  /** Sets split row `index`'s percentage (not the last row: it's computed). */
  async setSplitPercentage(index: number, percentage: number): Promise<void> {
    await this.form.setSplitPercentage(index, percentage);
  }

  async setSplitShares(index: number, shares: number): Promise<void> {
    await this.form.setSplitShares(index, shares);
  }

  async setSplitMethod(method: SplitMethod): Promise<void> {
    await this.form.setSplitMethod(method);
  }

  /** Asserts each split row's allocated amount, in row order. */
  async expectAllocatedAmounts(amounts: number[]): Promise<void> {
    await this.form.expectAllocatedAmounts(amounts);
  }

  // ---- Receipt ------------------------------------------------------------

  /** Attaches a receipt through the form's file input (skips the picker). */
  async uploadReceipt(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    await expect(this.attachedFilename).toBeVisible();
  }

  async removeReceipt(): Promise<void> {
    await this.removeFileButton.click();
    await expect(this.uploadPrompt).toBeVisible();
  }

  // ---- Actions ------------------------------------------------------------

  /** Saves and waits for the app to return to the (loaded) Expenses list. */
  async saveExpense(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/expenses$/);
    await this.waitForList();
  }

  /** Saves with "Save & Add Another" and waits for the form to reset. */
  async saveAndAddAnother(): Promise<void> {
    await expect(this.saveAndAddAnotherButton).toBeEnabled();
    await this.saveAndAddAnotherButton.click();
    await expect(this.snackbarWith('Expense added')).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.descriptionInput).toHaveValue('');
  }

  /** Cancels and waits for the (loaded) Expenses list. */
  async cancelExpense(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.page).toHaveURL(/\/expenses$/);
    await this.waitForList();
  }

  // ---- Expenses list ------------------------------------------------------

  /** The list row for the expense with this (unique) description. */
  expenseRow(description: string): Locator {
    return this.expenseRows.filter({ hasText: description });
  }

  /**
   * Asserts the Expenses list (already open) shows exactly one row for
   * `description` with the expected payer, category, total and date, then
   * expands it and asserts exactly the expected splits.
   */
  async expectSavedExpense(
    description: string,
    expected: ExpectedExpense
  ): Promise<void> {
    const row = this.expenseRow(description);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(expected.payer);
    await expect(row).toContainText(expected.category);
    await expect(row).toContainText(formatMoney(expected.total));
    if (expected.date !== undefined) {
      await expect(row).toContainText(formatShortDate(expected.date));
    }

    await row.getByTestId('expand-expense-button').click();
    await expect(this.expenseDetail).toBeVisible();
    await expect(this.expenseSplitRows).toHaveCount(expected.splits.length);
    await Promise.all(
      expected.splits.map((split) =>
        expect(
          this.expenseSplitRows.filter({
            has: this.page.getByRole('cell', {
              name: split.member,
              exact: true,
            }),
          })
        ).toContainText(formatMoney(split.amount))
      )
    );
  }
}
