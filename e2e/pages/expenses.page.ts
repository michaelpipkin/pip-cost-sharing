import { expect, Locator, Page } from '@playwright/test';
import { formatMoney, formatShortDate } from '../utils/format';
import { BasePage } from './base.page';

export type SplitMethod = 'amount' | 'percentage' | 'shares';

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

  // Add Expense form
  readonly addExpenseContainer: Locator;
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly addExpenseForm: Locator;
  readonly payerSelect: Locator;
  readonly dateInput: Locator;
  readonly datePickerToggle: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly totalAmountInput: Locator;
  readonly proportionalAmountInput: Locator;
  readonly sharedRemainderAmount: Locator;
  readonly splitMethodToggles: Record<SplitMethod, Locator>;
  readonly addSplitButton: Locator;
  readonly addAllMembersButton: Locator;
  readonly saveButton: Locator;
  readonly saveAndAddAnotherButton: Locator;
  readonly cancelButton: Locator;

  // Receipt attachment
  readonly fileInput: Locator;
  readonly attachFileButton: Locator;
  readonly uploadPrompt: Locator;
  readonly attachedFilename: Locator;
  readonly removeFileButton: Locator;

  // Split rows: each locator has one match per split, in row order (.nth(i)).
  /** The per-split member selects - one per split, so also the split count. */
  readonly splitRows: Locator;
  readonly assignedAmountInputs: Locator;
  readonly percentageInputs: Locator;
  readonly sharesInputs: Locator;
  readonly allocatedAmounts: Locator;
  readonly deleteSplitButtons: Locator;

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
    this.pageTitle = page.getByTestId('page-title');
    this.helpButton = page.getByTestId('help-button');
    this.addExpenseForm = page.getByTestId('add-expense-form');
    this.payerSelect = page.getByTestId('payer-select');
    this.dateInput = page.getByTestId('date-input');
    this.datePickerToggle = page.getByTestId('date-picker-toggle');
    this.descriptionInput = page.getByTestId('description-input');
    this.categorySelect = page.getByTestId('category-select');
    this.totalAmountInput = page.getByTestId('total-amount-input');
    this.proportionalAmountInput = page.getByTestId(
      'proportional-amount-input'
    );
    this.sharedRemainderAmount = page.getByTestId('shared-remainder-amount');
    this.splitMethodToggles = {
      amount: page.getByTestId('split-by-amount-toggle'),
      percentage: page.getByTestId('split-by-percentage-toggle'),
      shares: page.getByTestId('split-by-shares-toggle'),
    };
    this.addSplitButton = page.getByTestId('add-split-button');
    this.addAllMembersButton = page.getByTestId('add-all-members-button');
    this.saveButton = page.getByTestId('save-button');
    this.saveAndAddAnotherButton = page.getByTestId(
      'save-and-add-another-button'
    );
    this.cancelButton = page.getByTestId('cancel-button');

    this.fileInput = page.getByTestId('file-input');
    this.attachFileButton = page.getByTestId('attach-file-button');
    this.uploadPrompt = page.getByTestId('upload-prompt');
    this.attachedFilename = page.getByTestId('attached-filename');
    this.removeFileButton = page.getByTestId('remove-file-button');

    this.splitRows = page.getByTestId('split-member-select');
    this.assignedAmountInputs = page.getByTestId('split-assigned-amount-input');
    this.percentageInputs = page.getByTestId('split-percentage-input');
    this.sharesInputs = page.getByTestId('split-shares-input');
    this.allocatedAmounts = page.getByTestId('allocated-amount');
    this.deleteSplitButtons = page.getByTestId('remove-split');

    this.formErrors = page.locator('mat-error');
    this.calendar = page.locator('mat-calendar');
    this.confirmDeleteButton = page.getByTestId('delete-confirm-button');
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

  // ---- Form fields --------------------------------------------------------

  async selectPayer(memberName: string): Promise<void> {
    await this.chooseOption(this.payerSelect, memberName);
  }

  async selectCategory(categoryName: string): Promise<void> {
    await this.chooseOption(this.categorySelect, categoryName);
  }

  /** Changes split row `index`'s member. */
  async selectSplitMember(index: number, memberName: string): Promise<void> {
    await this.chooseOption(this.splitRows.nth(index), memberName);
  }

  /**
   * Types an amount into a currency input and blurs it (which runs the
   * form's re-allocation); the input then shows it formatted to cents.
   */
  private async fillCurrency(input: Locator, amount: number): Promise<void> {
    await input.fill(amount.toString());
    await input.blur();
    await expect(input).toHaveValue(amount.toFixed(2));
  }

  async setDescription(description: string): Promise<void> {
    await this.descriptionInput.fill(description);
    await this.descriptionInput.blur();
    await expect(this.descriptionInput).toHaveValue(description);
  }

  async setTotalAmount(amount: number): Promise<void> {
    await this.fillCurrency(this.totalAmountInput, amount);
  }

  async setProportionalAmount(amount: number): Promise<void> {
    await this.fillCurrency(this.proportionalAmountInput, amount);
  }

  /**
   * Fills description, category (when given; a one-category group selects
   * its category itself), total and, when given, the proportional amount.
   */
  async fillExpenseForm(data: {
    description: string;
    amount: number;
    category?: string;
    proportionalAmount?: number;
  }): Promise<void> {
    await this.setDescription(data.description);
    if (data.category !== undefined) {
      await this.selectCategory(data.category);
    }
    await this.setTotalAmount(data.amount);
    if (data.proportionalAmount !== undefined) {
      await this.setProportionalAmount(data.proportionalAmount);
    }
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

  // ---- Splits -------------------------------------------------------------

  /**
   * Adds one split row. The form fills it with the first member not yet in a
   * split; pass `member` to change that, and `amount` to set its member
   * amount (amount split method).
   */
  async addSplit(member?: string, amount?: number): Promise<void> {
    const count = await this.splitRows.count();
    await this.addSplitButton.click();
    await expect(this.splitRows).toHaveCount(count + 1);
    if (member !== undefined) {
      await this.selectSplitMember(count, member);
    }
    if (amount !== undefined) {
      await this.updateSplitAmount(count, amount);
    }
  }

  /**
   * Adds a split for every active member not already in one. Waits until it
   * has: both add buttons disable once every member has a split.
   */
  async addAllMembers(): Promise<void> {
    await this.addAllMembersButton.click();
    await expect(this.addAllMembersButton).toBeDisabled();
  }

  async removeSplit(index: number): Promise<void> {
    const count = await this.splitRows.count();
    await this.deleteSplitButtons.nth(index).click();
    await expect(this.splitRows).toHaveCount(count - 1);
  }

  /** Sets split row `index`'s member amount (amount split method). */
  async updateSplitAmount(index: number, amount: number): Promise<void> {
    const input = this.assignedAmountInputs.nth(index);
    await input.fill(amount.toString());
    await input.blur();
  }

  /** Sets split row `index`'s percentage (not the last row: it's computed). */
  async setSplitPercentage(index: number, percentage: number): Promise<void> {
    const input = this.percentageInputs.nth(index);
    await input.fill(percentage.toString());
    await input.blur();
  }

  async setSplitShares(index: number, shares: number): Promise<void> {
    const input = this.sharesInputs.nth(index);
    await input.fill(shares.toString());
    await input.blur();
  }

  /** Switches the split method and waits for that method's split inputs. */
  async setSplitMethod(method: SplitMethod): Promise<void> {
    // A single-select mat-button-toggle renders its button as role=radio.
    const toggle = this.splitMethodToggles[method].getByRole('radio');
    await toggle.click();
    await expect(toggle).toBeChecked();
  }

  /** Asserts each split row's allocated amount, in row order. */
  async expectAllocatedAmounts(amounts: number[]): Promise<void> {
    await expect(this.allocatedAmounts).toHaveText(amounts.map((amount) => formatMoney(amount)));
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
