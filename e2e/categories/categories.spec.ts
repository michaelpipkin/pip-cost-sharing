import { expect, test } from '../fixtures';
import { CategoriesPage } from '../pages/categories.page';
import { ExpensesPage } from '../pages/expenses.page';
import { CATEGORIES } from '../seed/datasets/categories';
import { signInAs } from '../utils/session';

// The admin tests share categories-admin and "Categories – Main" (see
// e2e/seed/datasets/categories.ts): each works on its own category, and
// nobody switches groups. The status the page shows is checked with Active
// only off, since the filter hides inactive categories. Add Expense is
// reached in-app, as a user does.

const { categories, users } = CATEGORIES;
const unique = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe('Categories', { tag: ['@categories'] }, () => {
  test('should add a category', async ({ page }) => {
    const categoriesPage = new CategoriesPage(page);
    const expenses = new ExpensesPage(page);
    const name = `Added ${unique()}`;

    await signInAs(page, users.admin);
    await categoriesPage.goto();
    await expect(categoriesPage.rowByName(name)).toHaveCount(0);

    await categoriesPage.addCategory(name);
    await expect(categoriesPage.rowByName(name)).toHaveCount(1);
    await expect(
      categoriesPage.rowByName(name).getByTestId('category-status-cell')
    ).toHaveText('Active');

    await categoriesPage.expectOfferedInAddExpense(
      expenses,
      name,
      categories.general.name,
      true
    );
  });

  test('should rename a category', async ({ page }) => {
    const categoriesPage = new CategoriesPage(page);
    const row = categoriesPage.rowById(categories.rename.key);
    const newName = `Renamed ${unique()}`;

    await signInAs(page, users.admin);
    await categoriesPage.goto();
    await expect(row.getByTestId('category-name-cell')).toHaveText(
      categories.rename.name
    );

    await categoriesPage.rename(row, newName);
    await expect(row.getByTestId('category-name-cell')).toHaveText(newName);
    await expect(categoriesPage.rowByName(categories.rename.name)).toHaveCount(
      0
    );
  });

  test('should deactivate a category', async ({ page }) => {
    const categoriesPage = new CategoriesPage(page);
    const expenses = new ExpensesPage(page);
    const { name, key } = categories.deactivate;
    const row = categoriesPage.rowById(key);

    await signInAs(page, users.admin);
    await categoriesPage.goto();
    await expect(row.getByTestId('category-status-cell')).toHaveText('Active');
    await categoriesPage.expectOfferedInAddExpense(
      expenses,
      name,
      categories.general.name,
      true
    );

    await categoriesPage.goto();
    await categoriesPage.deactivate(row);
    // Hidden by the Active only filter, shown (inactive) once it is off.
    await expect(row).toHaveCount(0);
    await categoriesPage.setActiveOnly(false);
    await expect(row.getByTestId('category-status-cell')).toHaveText(
      'Inactive'
    );

    await categoriesPage.expectOfferedInAddExpense(
      expenses,
      name,
      categories.general.name,
      false
    );
  });

  test('should delete an unused category', async ({ page }) => {
    const categoriesPage = new CategoriesPage(page);
    const row = categoriesPage.rowById(categories.delete.key);

    await signInAs(page, users.admin);
    await categoriesPage.goto();
    await expect(row.getByTestId('category-name-cell')).toHaveText(
      categories.delete.name
    );

    await categoriesPage.openEdit(row);
    await categoriesPage.requestDelete();
    await categoriesPage.confirmDelete();
    await expect(categoriesPage.editTitle).toBeHidden();
    await expect(categoriesPage.snackbarWith('Category deleted')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('should not delete a category in use', async ({ page }) => {
    const categoriesPage = new CategoriesPage(page);
    const row = categoriesPage.rowById(categories.general.key);

    await signInAs(page, users.admin);
    await categoriesPage.goto();
    await expect(row.getByTestId('category-name-cell')).toHaveText(
      categories.general.name
    );

    await categoriesPage.openEdit(row);
    await categoriesPage.requestDelete();
    await categoriesPage.confirmDelete();
    await expect(
      categoriesPage.snackbarWith(
        'This category is assigned to expenses and cannot be deleted.'
      )
    ).toBeVisible();
    // The Edit dialog stays open; closing it shows General still listed.
    await expect(categoriesPage.editTitle).toBeVisible();
    await categoriesPage.cancelEdit();
    await expect(row.getByTestId('category-name-cell')).toHaveText(
      categories.general.name
    );
  });

  test('should be read-only for a member who is not an admin', async ({
    page,
  }) => {
    const categoriesPage = new CategoriesPage(page);
    const row = categoriesPage.rowById(categories.general.key);

    await signInAs(page, users.viewer);
    await categoriesPage.goto();
    await expect(row.getByTestId('category-name-cell')).toHaveText(
      categories.general.name
    );
    await expect(categoriesPage.addCategoryButton).toBeHidden();
    // Rows only open the editor for users who can edit.
    await expect(row).not.toHaveClass(/clickable-row/);
  });
});
