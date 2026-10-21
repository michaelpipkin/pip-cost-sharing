import { expect, test } from '../fixtures';
import { MemorizedPage } from '../pages/memorized.page';
import { MEMORIZED } from '../seed/datasets/memorized';
import { formatShortDate } from '../utils/format';
import { signInAs } from '../utils/session';

// Each test signs in as the owner of its own group (see
// e2e/seed/datasets/memorized.ts), so no test switches groups. Expected
// numbers come from AllocationUtilsService (scripts/db/allocation.ts ports
// it):
//   - amount method: member amounts first, then whatever is left of the total
//     is shared evenly. Memorizing $90 with three members and no member
//     amounts gives 30 each. Editing the seeded $40 (20 / 20 of their own) to
//     $60 leaves $20 to share, 10 each on top: 30 / 30.
//   - percentage method: the seeded $120 at 50 / 30 / 20 is 60 / 36 / 24.

const { pizza, flights } = MEMORIZED.memorized;

test.describe('Memorized expenses', { tag: ['@memorized'] }, () => {
  test('should memorize an expense', async ({ page }) => {
    const description = `Create – Groceries ${Date.now()}`;
    const memorized = new MemorizedPage(page);
    const form = memorized.addForm;

    await signInAs(page, MEMORIZED.users.create);
    await memorized.navigateToList();
    await expect(memorized.emptyPlaceholder).toBeVisible();

    await memorized.openNew();
    await expect(form.payerSelect).toHaveText('Ari');
    await form.fillExpenseForm({
      description,
      category: 'Travel',
      amount: 90,
    });
    await form.addAllMembers();
    await expect(form.splitRows).toHaveText(['Ari', 'Blake', 'Cody']);
    await form.expectAllocatedAmounts([30, 30, 30]);

    await memorized.saveNew();
    await memorized.expectRow(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 90,
      splits: [
        { member: 'Ari', amount: 30 },
        { member: 'Blake', amount: 30 },
        { member: 'Cody', amount: 30 },
      ],
    });
    await expect(memorized.emptyPlaceholder).toBeHidden();
  });

  test('should create an expense from a memorized one', async ({ page }) => {
    const { description } = MEMORIZED.memorized.use;
    const memorized = new MemorizedPage(page);
    const expenses = memorized.expenses;

    await signInAs(page, MEMORIZED.users.use);
    await memorized.navigateToList();
    await expect(memorized.rows).toHaveCount(1);
    await memorized.createExpenseFrom(description);

    // Hand-off: Add Expense arrives prefilled (a reload would show it blank,
    // with Ari as payer, General and the amount method).
    await expect(expenses.payerSelect).toHaveText('Blake');
    await expect(expenses.categorySelect).toHaveText('Travel');
    await expect(expenses.descriptionInput).toHaveValue(description);
    await expect(expenses.totalAmountInput).toHaveValue('120.00');
    await expect(expenses.dateInput).toHaveValue(formatShortDate(new Date()));
    await expect(
      expenses.splitMethodToggles.percentage.getByRole('radio')
    ).toBeChecked();
    await expect(expenses.splitRows).toHaveText(['Ari', 'Blake', 'Cody']);
    await expect(expenses.percentageInputs).toHaveCount(3);
    await expect(expenses.percentageInputs.nth(0)).toHaveValue('50');
    await expect(expenses.percentageInputs.nth(1)).toHaveValue('30');
    await expect(expenses.percentageInputs.nth(2)).toHaveValue('20');
    await expenses.expectAllocatedAmounts([60, 36, 24]);
    // "Save and add another" is for blank forms; the hand-off hides it.
    await expect(expenses.saveAndAddAnotherButton).toBeHidden();

    await expenses.saveExpense();
    await expenses.expectSavedExpense(description, {
      payer: 'Blake',
      category: 'Travel',
      total: 120,
      date: new Date(),
      splits: [
        { member: 'Ari', amount: 60 },
        { member: 'Blake', amount: 36 },
        { member: 'Cody', amount: 24 },
      ],
    });
  });

  test('should edit a memorized expense', async ({ page }) => {
    const { description } = MEMORIZED.memorized.edit;
    const memorized = new MemorizedPage(page);
    const form = memorized.editForm;

    await signInAs(page, MEMORIZED.users.edit);
    await memorized.navigateToList();
    await memorized.expectRow(description, {
      payer: 'Ari',
      category: 'General',
      total: 40,
      splits: [
        { member: 'Ari', amount: 20 },
        { member: 'Blake', amount: 20 },
      ],
    });

    await memorized.openEdit(description);
    await expect(form.totalAmountInput).toHaveValue('40.00');
    await expect(form.saveButton).toBeDisabled();
    await form.setTotalAmount(60);
    await form.expectAllocatedAmounts([30, 30]);

    await memorized.saveEdit();

    // Leave Memorized and come back. This is in-app navigation, not a
    // reload: it shows the live listener's data, not a fresh read.
    await memorized.expenses.navigateToList();
    await memorized.navigateToList();
    await memorized.expectRow(description, {
      payer: 'Ari',
      category: 'General',
      total: 60,
      splits: [
        { member: 'Ari', amount: 30 },
        { member: 'Blake', amount: 30 },
      ],
    });
  });

  test('should delete a memorized expense', async ({ page }) => {
    const { description } = MEMORIZED.memorized.delete;
    const memorized = new MemorizedPage(page);

    await signInAs(page, MEMORIZED.users.delete);
    await memorized.navigateToList();
    await expect(memorized.row(description)).toHaveCount(1);

    await memorized.openEdit(description);
    await memorized.deleteEdited();

    await expect(memorized.row(description)).toHaveCount(0);
    await expect(memorized.emptyPlaceholder).toBeVisible();
  });

  test('should search memorized expenses by description, payer and category', async ({
    page,
  }) => {
    const memorized = new MemorizedPage(page);

    await signInAs(page, MEMORIZED.users.browse);
    await memorized.navigateToList();
    await expect(memorized.rows).toHaveCount(2);
    await memorized.expectRow(flights.description, {
      payer: 'Blake',
      category: 'Travel',
      total: 200,
      splits: [
        { member: 'Ari', amount: 120 },
        { member: 'Blake', amount: 80 },
      ],
    });

    // Description (case-insensitive).
    await memorized.search('pizza');
    await memorized.expectDescriptions([pizza.description]);

    // Payer: only Flights is paid by Blake.
    await memorized.search('Blake');
    await memorized.expectDescriptions([flights.description]);

    // Category.
    await memorized.search('Travel');
    await memorized.expectDescriptions([flights.description]);
    await memorized.search('General');
    await memorized.expectDescriptions([pizza.description]);

    // No match, then clearing the search brings both back.
    await memorized.search('no such expense');
    await expect(memorized.rows).toHaveCount(0);
    await expect(memorized.noResults).toBeVisible();
    await memorized.clearSearchButton.click();
    await expect(memorized.searchInput).toHaveValue('');
    await expect(memorized.rows).toHaveCount(2);
  });

  test('should show the empty state', async ({ page }) => {
    const memorized = new MemorizedPage(page);

    await signInAs(page, MEMORIZED.users.empty);
    await memorized.navigateToList();
    await expect(memorized.emptyPlaceholder).toBeVisible();
    await expect(memorized.rows).toHaveCount(0);
    await expect(memorized.searchInput).toBeHidden();
    await expect(memorized.memorizeNewButton).toBeVisible();
  });
});
