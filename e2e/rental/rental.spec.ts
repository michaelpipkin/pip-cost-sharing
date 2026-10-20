import { expect, test } from '../fixtures';
import { RentalPage } from '../pages/rental.page';
import { RENTAL } from '../seed/datasets/rental';
import { formatMoney } from '../utils/format';
import { signInAs } from '../utils/session';

// Each test signs in as the owner of its own group (see
// e2e/seed/datasets/rental.ts), so no test switches groups.
//
// Expected numbers come from RentalUtilsService.computeShares and
// AllocationUtilsService.allocateByShares (scripts/db/allocation.ts ports it):
//   - no rooms: each night is a pool of one share per participant, divided
//     among the people there that night. 3 participants, 2 nights, Cody out
//     night 2: night 1 gives everyone 3/3 = 1, night 2 gives Ari and Blake
//     3/2 = 1.5, so shares are 2.5 / 2.5 / 1 (of 6) and $600 splits
//     250 / 250 / 100.
//   - rooms: each night's pool is divided by room rate, and a member with no
//     room counts at 1.0x. 2 participants, 1 night, Ari in a 1.5x room:
//     Ari 2 * 1.5 / 2.5 = 1.2, Blake 2 * 1 / 2.5 = 0.8, so $500 splits
//     300 / 200.
//   - edit: 3 participants, 2 nights all present is 2 / 2 / 2 ($100 each of
//     $300); with Cody out night 2 it is 2.5 / 2.5 / 1, i.e. 125 / 125 / 50.

test.describe('Rental expenses', { tag: ['@rental'] }, () => {
  test('should create a rental expense from the occupancy grid', async ({
    page,
  }) => {
    const description = `Rental – Beach week ${Date.now()}`;
    const rental = new RentalPage(page);
    const expenses = rental.expenses;

    await signInAs(page, RENTAL.users.create);
    await rental.openFromExpenses(3);
    await rental.grid.expectMembers(['Ari', 'Blake', 'Cody']);

    await rental.setAmount(600);
    await rental.setNights(2);
    await rental.setDescription(description);
    await rental.toggleNight('Cody', 1, false);

    await rental.grid.expectShares([2.5, 2.5, 1]);
    await rental.grid.expectAmounts([250, 250, 100]);

    // Hand-off: Add Expense arrives prefilled (a reload would show it blank).
    await rental.continueToExpense();
    await expect(expenses.descriptionInput).toHaveValue(description);
    await expect(expenses.totalAmountInput).toHaveValue('600.00');
    await expect(expenses.splitMethodToggles.shares.getByRole('radio')).toBeChecked();
    await expect(expenses.categorySelect).toHaveText('Travel');
    await expect(expenses.payerSelect).toHaveText('Ari');
    await expect(expenses.splitRows).toHaveText(['Ari', 'Blake', 'Cody']);
    await expect(expenses.sharesInputs).toHaveCount(3);
    await expect(expenses.sharesInputs.nth(0)).toHaveValue('2.5');
    await expect(expenses.sharesInputs.nth(1)).toHaveValue('2.5');
    await expect(expenses.sharesInputs.nth(2)).toHaveValue('1');
    await expenses.expectAllocatedAmounts([250, 250, 100]);
    // "Save and add another" would drop the rental, so it is hidden.
    await expect(expenses.saveAndAddAnotherButton).toBeHidden();

    await expenses.saveExpense();
    await expenses.expectSavedExpense(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 600,
      splits: [
        { member: 'Ari', amount: 250 },
        { member: 'Blake', amount: 250 },
        { member: 'Cody', amount: 100 },
      ],
    });
  });

  test('should weight shares by room rate', async ({ page }) => {
    const description = `Rental – Room rates ${Date.now()}`;
    const rental = new RentalPage(page);
    const expenses = rental.expenses;

    await signInAs(page, RENTAL.users.rooms);
    await rental.openFromExpenses(2);

    await rental.setAmount(500);
    await rental.setDescription(description);
    await rental.addRoom('Suite', 1.5, ['Ari']);

    await expect(rental.unassignedNote).toContainText('Blake');
    await expect(rental.unassignedNote).not.toContainText('Ari');
    await rental.grid.expectShares([1.2, 0.8]);
    await rental.grid.expectAmounts([300, 200]);

    await rental.continueToExpense();
    await expect(expenses.descriptionInput).toHaveValue(description);
    await expect(expenses.totalAmountInput).toHaveValue('500.00');
    await expect(expenses.splitRows).toHaveText(['Ari', 'Blake']);
    await expenses.expectAllocatedAmounts([300, 200]);

    await expenses.saveExpense();
    await expenses.expectSavedExpense(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 500,
      splits: [
        { member: 'Ari', amount: 300 },
        { member: 'Blake', amount: 200 },
      ],
    });
  });

  test('should block Continue for an empty night or no amount', async ({
    page,
  }) => {
    const rental = new RentalPage(page);

    await signInAs(page, RENTAL.users.create);
    await rental.openFromExpenses(3);
    await rental.setNights(2);

    // No amount yet: Continue is disabled with a perfectly good grid.
    await expect(rental.grid.emptyNightsWarning).toBeHidden();
    await expect(rental.continueButton).toBeDisabled();

    await rental.setAmount(300);
    await expect(rental.continueButton).toBeEnabled();

    // Nobody there on night 2.
    for (const member of ['Ari', 'Blake', 'Cody']) {
      await rental.toggleNight(member, 1, false);
    }
    await expect(rental.grid.emptyNightsWarning).toBeVisible();
    await expect(rental.grid.emptyNightsWarning).toContainText('night 2');
    await expect(rental.continueButton).toBeDisabled();

    // One person back and the night is covered again.
    await rental.toggleNight('Blake', 1, true);
    await expect(rental.grid.emptyNightsWarning).toBeHidden();
    await expect(rental.continueButton).toBeEnabled();

    // An amount of 0 blocks it again.
    await rental.setAmount(0);
    await expect(rental.continueButton).toBeDisabled();
  });

  test("should edit a saved rental's occupancy", async ({ page }) => {
    const description = RENTAL.descriptions.edit;
    const rental = new RentalPage(page);
    const expenses = rental.expenses;

    await signInAs(page, RENTAL.users.edit);
    await expenses.waitForList();
    await expenses.expectSavedExpense(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 300,
      splits: [
        { member: 'Ari', amount: 100 },
        { member: 'Blake', amount: 100 },
        { member: 'Cody', amount: 100 },
      ],
    });

    await rental.openSavedRental(description);
    await rental.openEditDialog(3);
    await rental.dialogGrid.expectShares([2, 2, 2]);

    await rental.dialogGrid.setNight('Cody', 1, false);
    await rental.dialogGrid.expectShares([2.5, 2.5, 1]);
    await rental.dialogGrid.expectAmounts([125, 125, 50]);
    await rental.saveEditDialog();

    // The edit form now carries the recomputed splits.
    await expect(rental.editAllocatedAmounts).toHaveText([
      formatMoney(125),
      formatMoney(125),
      formatMoney(50),
    ]);

    await rental.saveEditedExpense();
    await expenses.expectSavedExpense(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 300,
      splits: [
        { member: 'Ari', amount: 125 },
        { member: 'Blake', amount: 125 },
        { member: 'Cody', amount: 50 },
      ],
    });
  });

  test('should leave a rental unchanged when the grid edit is cancelled', async ({
    page,
  }) => {
    const description = RENTAL.descriptions.cancel;
    const rental = new RentalPage(page);
    const expenses = rental.expenses;
    const unchanged = {
      payer: 'Ari',
      category: 'Travel',
      total: 300,
      splits: [
        { member: 'Ari', amount: 100 },
        { member: 'Blake', amount: 100 },
        { member: 'Cody', amount: 100 },
      ],
    };

    await signInAs(page, RENTAL.users.edit);
    await expenses.waitForList();
    await rental.openSavedRental(description);

    await rental.openEditDialog(3);
    await rental.dialogGrid.setNight('Cody', 1, false);
    await rental.dialogGrid.expectAmounts([125, 125, 50]);
    await rental.cancelEditDialog();

    // Nothing changed on the form: the same splits, and Save stays off
    // because there is nothing to save.
    await expect(rental.editAllocatedAmounts).toHaveText([
      formatMoney(100),
      formatMoney(100),
      formatMoney(100),
    ]);
    await expect(rental.editSaveButton).toBeDisabled();

    // Reopening shows the original occupancy: Cody is there night 2.
    await rental.openEditDialog(3);
    await rental.dialogGrid.expectShares([2, 2, 2]);
    await expect(
      await rental.dialogGrid.nightCheckbox('Cody', 1)
    ).toBeChecked();
    await rental.cancelEditDialog();

    await rental.cancelEditedExpense();
    await expenses.expectSavedExpense(description, unchanged);
  });
});
