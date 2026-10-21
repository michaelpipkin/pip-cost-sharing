import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';
import { ExpensesPage } from './expenses.page';

/**
 * The Categories page (/administration/categories) with its Add and Edit
 * dialogs. A row's test id is `category-row-<category id>`; the seeded keys
 * are the ids (see e2e/seed/datasets/categories.ts), and a category created
 * in the UI is found by its name.
 */
export class CategoriesPage extends BasePage {
  readonly navCategoriesLink: Locator;
  readonly mainContainer: Locator;
  readonly pageTitle: Locator;
  readonly addCategoryButton: Locator;
  readonly activeOnlyToggle: Locator;
  readonly table: Locator;

  // Add dialog
  readonly addTitle: Locator;
  readonly addNameInput: Locator;
  readonly addSaveButton: Locator;

  // Edit dialog
  readonly editTitle: Locator;
  readonly editNameInput: Locator;
  readonly editActiveToggle: Locator;
  readonly editSaveButton: Locator;
  readonly editDeleteButton: Locator;
  readonly editCancelButton: Locator;

  // The shared delete confirmation, opened over the Edit dialog.
  readonly deleteDialogTitle: Locator;
  readonly deleteConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.navCategoriesLink = page.getByTestId('nav-categories');
    this.mainContainer = page.getByTestId('categories-main-container');
    this.pageTitle = page.getByTestId('categories-page-title');
    this.addCategoryButton = page.getByTestId('add-category-button');
    this.activeOnlyToggle = page.getByTestId('active-categories-only-toggle');
    this.table = page.getByTestId('categories-table');

    this.addTitle = page.getByTestId('add-category-title');
    this.addNameInput = page.getByTestId('category-name-input');
    this.addSaveButton = page.getByTestId('add-category-save-button');

    this.editTitle = page.getByTestId('edit-category-title');
    this.editNameInput = page.getByTestId('edit-category-name-input');
    this.editActiveToggle = page.getByTestId('edit-category-active-toggle');
    this.editSaveButton = page.getByTestId('edit-category-save-button');
    this.editDeleteButton = page.getByTestId('delete-category-button');
    this.editCancelButton = page.getByTestId('edit-category-cancel-button');

    this.deleteDialogTitle = page.getByTestId('delete-dialog-title');
    this.deleteConfirmButton = page.getByTestId('delete-confirm-button');
  }

  /**
   * Opens Categories from the nav bar (in-app, as GroupsPage.goto does) and
   * waits for real content: the main container replaces the "Loading
   * categories..." placeholder once the category store has loaded.
   */
  async goto(): Promise<void> {
    await this.navCategoriesLink.click();
    await expect(this.page).toHaveURL(/\/administration\/categories$/);
    await expect(this.mainContainer).toBeVisible();
    await expect(this.pageTitle).toHaveText('Categories');
    await this.waitForLoadingComplete();
  }

  /** The row of the seeded category with this id. */
  rowById(id: string): Locator {
    return this.page.getByTestId(`category-row-${id}`);
  }

  /** The row whose name is exactly `name` (for categories made in the UI). */
  rowByName(name: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page
        .getByTestId('category-name-cell')
        .getByText(name, { exact: true }),
    });
  }

  /** The Active only filter, set (it hides inactive categories when on). */
  async setActiveOnly(activeOnly: boolean): Promise<void> {
    await this.setSwitch(this.activeOnlyToggle, activeOnly);
  }

  /** Add Category, type the name, Save; resolves once the dialog is gone. */
  async addCategory(name: string): Promise<void> {
    await this.addCategoryButton.click();
    await expect(this.addTitle).toBeVisible();
    // Dialog ready: MatDialog moves focus here after its open animation.
    await expect(this.addNameInput).toBeFocused();
    await this.fillAndCommit(this.addNameInput, name);
    await expect(this.addSaveButton).toBeEnabled();
    await this.addSaveButton.click();
    await expect(this.addTitle).toBeHidden();
    await expect(this.snackbarWith('Category added')).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Clicks a row and waits for the Edit dialog to be ready. */
  async openEdit(row: Locator): Promise<void> {
    await row.click();
    await expect(this.editTitle).toBeVisible();
    await expect(this.editNameInput).toBeFocused();
    await this.waitForLoadingComplete();
  }

  async rename(row: Locator, newName: string): Promise<void> {
    await this.openEdit(row);
    await this.editNameInput.clear();
    await this.fillAndCommit(this.editNameInput, newName);
    await this.saveEdit();
  }

  async deactivate(row: Locator): Promise<void> {
    await this.openEdit(row);
    await this.setSwitch(this.editActiveToggle, false);
    await this.saveEdit();
  }

  private async saveEdit(): Promise<void> {
    await expect(this.editSaveButton).toBeEnabled();
    await this.editSaveButton.click();
    await expect(this.editTitle).toBeHidden();
    await expect(this.snackbarWith('Category saved')).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Delete in the open Edit dialog; resolves once the confirmation shows. */
  async requestDelete(): Promise<void> {
    await this.editDeleteButton.click();
    await expect(this.deleteDialogTitle).toBeVisible();
  }

  /** Confirms the delete dialog. The outcome is the caller's to assert. */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialogTitle).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async cancelEdit(): Promise<void> {
    await this.editCancelButton.click();
    await expect(this.editTitle).toBeHidden();
  }

  /**
   * From the Categories page: opens Add Expense in-app (Expenses, Add New
   * Expense, Enter Manual Expense) and asserts whether the category select
   * offers `name`. The select must also offer `anchor`, a category known to
   * be active, so "not offered" can't pass on an empty or unloaded list.
   */
  async expectOfferedInAddExpense(
    expenses: ExpensesPage,
    name: string,
    anchor: string,
    offered: boolean
  ): Promise<void> {
    await expenses.navigateToList();
    await expenses.openAddExpense();
    const select = expenses.form.categorySelect;
    await select.click();
    await expect(this.selectPanel).toBeVisible();
    await expect(this.option(anchor)).toBeVisible();
    await expect(this.option(name)).toHaveCount(offered ? 1 : 0);
    await this.page.keyboard.press('Escape');
    await expect(this.selectPanel).toBeHidden();
  }
}
