import { expect, Locator, Page } from '@playwright/test';
import { formatMoney } from '../utils/format';
import { BasePage } from './base.page';
import { ExpenseForm } from './expense-form';
import { ExpensesPage } from './expenses.page';

/** One split as a memorized row's expanded detail shows it. */
export interface ExpectedMemorizedSplit {
  member: string;
  amount: number;
}

/**
 * Memorized expenses: the list (/memorized), the Memorize form
 * (/memorized/add) and the edit form (/memorized/:id). Both forms are an
 * ExpenseForm scoped to their own container. "Create expense" on a row hands
 * the memorized expense to Add Expense through router state, so it is only
 * reachable in-app.
 */
export class MemorizedPage extends BasePage {
  readonly expenses: ExpensesPage;

  readonly navMemorizedLink: Locator;

  // List
  readonly listContainer: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly memorizeNewButton: Locator;
  readonly rows: Locator;
  readonly detailSplitRows: Locator;
  readonly noResults: Locator;
  /** The empty state of a group with no memorized expenses at all. */
  readonly emptyPlaceholder: Locator;

  // Forms
  readonly addContainer: Locator;
  readonly addForm: ExpenseForm;
  readonly editContainer: Locator;
  readonly editForm: ExpenseForm;
  readonly deleteButton: Locator;

  // Delete dialog
  readonly deleteDialog: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.expenses = new ExpensesPage(page);

    this.navMemorizedLink = page.getByTestId('nav-memorized');

    this.listContainer = page.getByTestId('memorized-main-container');
    this.searchInput = page.getByTestId('memorized-search-input');
    this.clearSearchButton = page.getByTestId('clear-memorized-search-button');
    this.memorizeNewButton = page.getByTestId('memorize-new-expense-button');
    this.rows = page.getByTestId('memorized-row');
    this.detailSplitRows = page.getByTestId('memorized-split-row');
    this.noResults = page.getByTestId('memorized-no-results');
    this.emptyPlaceholder = page.getByTestId('no-memorized-placeholder');

    this.addContainer = page.getByTestId('add-memorized-container');
    this.addForm = new ExpenseForm(page, this.addContainer);
    this.editContainer = page.getByTestId('edit-memorized-container');
    this.editForm = new ExpenseForm(page, this.editContainer);
    this.deleteButton = this.editContainer.getByTestId('delete-button');

    this.deleteDialog = page.locator('mat-dialog-container');
    this.confirmDeleteButton = this.deleteDialog.getByTestId(
      'delete-confirm-button'
    );
  }

  // ---- Navigation ---------------------------------------------------------

  /** Opens Memorized from the nav bar (no reload) and waits for its list. */
  async navigateToList(): Promise<void> {
    await this.navMemorizedLink.click();
    await this.waitForList();
  }

  /** Waits for the Memorized list (already navigated to) to finish loading. */
  async waitForList(): Promise<void> {
    await expect(this.page).toHaveURL(/\/memorized$/);
    await expect(this.listContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * From the list: Memorize New Expense. Waits until the form has its group
   * data: the payer select shows the signed-in member, the default payer.
   */
  async openNew(): Promise<void> {
    await this.memorizeNewButton.click();
    await expect(this.page).toHaveURL(/\/memorized\/add$/);
    await expect(this.addContainer).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.addForm.payerSelect).toHaveText(/\S/);
  }

  /**
   * From the list: opens the memorized expense with this description for
   * editing and waits for its form to be filled in.
   */
  async openEdit(description: string): Promise<void> {
    await this.row(description).click();
    await expect(this.page).toHaveURL(/\/memorized\/[^/]+$/);
    await expect(this.editContainer).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.editForm.descriptionInput).toHaveValue(description);
  }

  // ---- Saving -------------------------------------------------------------

  /**
   * Saves the Memorize form and waits for the success snackbar and the
   * (loaded) list.
   */
  async saveNew(): Promise<void> {
    await expect(this.addForm.saveButton).toBeEnabled();
    await this.addForm.saveButton.click();
    await expect(this.snackbarWith('Memorized expense added')).toBeVisible();
    await this.waitForList();
  }

  /** Saves the edit form and waits for the snackbar and the (loaded) list. */
  async saveEdit(): Promise<void> {
    await expect(this.editForm.saveButton).toBeEnabled();
    await this.editForm.saveButton.click();
    await expect(this.snackbarWith('Memorized expense updated')).toBeVisible();
    await this.waitForList();
  }

  /** Deletes the memorized expense being edited, confirming the dialog. */
  async deleteEdited(): Promise<void> {
    await this.deleteButton.click();
    await expect(this.deleteDialog).toBeVisible();
    await this.confirmDeleteButton.click();
    await expect(this.deleteDialog).toBeHidden();
    await expect(this.snackbarWith('Memorized expense deleted')).toBeVisible();
    await this.waitForList();
  }

  // ---- List ---------------------------------------------------------------

  /** The list row for the memorized expense with this (unique) description. */
  row(description: string): Locator {
    return this.rows.filter({ hasText: description });
  }

  /** Types into the search box and waits for it to hold the text. */
  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
    await expect(this.searchInput).toHaveValue(text);
  }

  /** Asserts the list shows exactly these descriptions, in order. */
  async expectDescriptions(descriptions: string[]): Promise<void> {
    await expect(this.rows).toHaveCount(descriptions.length);
    for (const [i, description] of descriptions.entries()) {
      await expect(this.rows.nth(i)).toContainText(description);
    }
  }

  /**
   * Asserts the list has exactly one row for `description` with the payer,
   * category and total, then expands it and asserts exactly its splits.
   */
  async expectRow(
    description: string,
    expected: {
      payer: string;
      category: string;
      total: number;
      splits: ExpectedMemorizedSplit[];
    }
  ): Promise<void> {
    const row = this.row(description);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(expected.payer);
    await expect(row).toContainText(expected.category);
    await expect(row).toContainText(formatMoney(expected.total));

    await row.getByTestId('memorized-expand-button').click();
    await expect(this.detailSplitRows).toHaveCount(expected.splits.length);
    for (const split of expected.splits) {
      await expect(
        this.detailSplitRows.filter({
          has: this.page.getByRole('cell', {
            name: split.member,
            exact: true,
          }),
        })
      ).toContainText(formatMoney(split.amount));
    }
  }

  /**
   * Clicks the row's "create expense" button and waits for Add Expense (the
   * router-state hand-off: a reload there would show a blank form).
   */
  async createExpenseFrom(description: string): Promise<void> {
    await this.row(description)
      .getByTestId('memorized-create-expense-button')
      .click();
    await expect(this.page).toHaveURL(/\/expenses\/add$/);
    await expect(this.expenses.addExpenseContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }
}
