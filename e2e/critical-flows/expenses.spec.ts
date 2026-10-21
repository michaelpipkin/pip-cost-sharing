import { type Page } from '@playwright/test';
import {
  allocateByPercentage,
  allocateByShares,
  allocateSharedAmounts,
  makeRounder,
  type AllocationSplit,
} from '../../scripts/db/allocation';
import { expect, test } from '../fixtures';
import { ExpensesPage } from '../pages/expenses.page';
import { EXPENSES } from '../seed/datasets/expenses';
import type { SeedGroup, SeedUser } from '../seed/types';
import { formatMoney } from '../utils/format';
import { signInAs } from '../utils/session';

// Data: e2e/seed/datasets/expenses.ts. Every test signs in as expenses-user
// on "Expenses – Main" (the auto-select test as expenses-solo on "Expenses –
// One Category"); each user has only that group, so no test switches groups.
// Tests only add expenses with unique descriptions and assert on their own
// rows.
const { expensesUser, soloUser } = EXPENSES.users;
const { main, oneCategory } = EXPENSES.groups;

// Member display names, in the order the form adds them (by displayName).
const ARI = 'Ari'; // expenses-user, so Main's default payer
const BLAKE = 'Blake';
const CODY = 'Cody';
const MAIN_MEMBERS = [ARI, BLAKE, CODY];
const SAM = 'Sam'; // expenses-solo, One Category's default payer
const DEV = 'Dev';

/** The seeded Main expense; its row proves the list has loaded. */
const SEEDED_DESCRIPTION = main.expenses![0]!.description;

// Expected allocations come from scripts/db/allocation.ts, a port of the
// app's AllocationUtilsService (src/app/utilities/allocation-utils.service.ts)
// whose methods the add-expense form calls on every blur.
const rounder = makeRounder(2);

function splitsFor(fields: Partial<AllocationSplit>[]): AllocationSplit[] {
  return fields.map((f, i) => ({
    owedByMemberRef: `member-${i}`,
    assignedAmount: 0,
    percentage: 0,
    shares: 0,
    allocatedAmount: 0,
    ...f,
  }));
}

/** Amount method: member amounts, then the proportional and evenly shared pools. */
function byAmount(
  total: number,
  assigned: number[],
  proportional = 0
): number[] {
  return allocateSharedAmounts(
    {
      totalAmount: total,
      sharedAmount: 0,
      allocatedAmount: proportional,
      splits: splitsFor(assigned.map((assignedAmount) => ({ assignedAmount }))),
    },
    rounder
  ).splits.map((s) => s.allocatedAmount);
}

/** Percentage method; the last row's percentage is computed (to 100). */
function byPercentage(
  total: number,
  percentages: number[]
): { amounts: number[]; percentages: number[] } {
  const { splits } = allocateByPercentage(
    {
      totalAmount: total,
      splits: splitsFor(percentages.map((percentage) => ({ percentage }))),
    },
    rounder
  );
  return {
    amounts: splits.map((s) => s.allocatedAmount),
    percentages: splits.map((s) => s.percentage),
  };
}

function byShares(total: number, shares: number[]): number[] {
  return allocateByShares(
    {
      totalAmount: total,
      splits: splitsFor(shares.map((s) => ({ shares: s }))),
    },
    rounder
  ).splits.map((s) => s.allocatedAmount);
}

function zipSplits(members: string[], amounts: number[]) {
  return members.map((member, i) => ({ member, amount: amounts[i]! }));
}

function uniqueDescription(label: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `Expenses – ${label} ${suffix}`;
}

/**
 * Signs in (landing on the Expenses list of the user's only group) and opens
 * Add Expense from there, in-app rather than with page.goto('/expenses/add')
 * (see ExpensesPage.gotoList for why a deep-link reload is unsafe).
 */
async function startExpense(
  page: Page,
  {
    user,
    group,
    payer,
  }: { user: SeedUser; group: SeedGroup; payer: string } = {
    user: expensesUser,
    group: main,
    payer: ARI,
  }
): Promise<ExpensesPage> {
  await signInAs(page, user);
  const expensesPage = new ExpensesPage(page);
  await expect(page).toHaveURL(/\/expenses$/);
  await expensesPage.waitForList();
  await expect(expensesPage.currentGroupName).toHaveText(group.name);

  await expensesPage.openAddExpense();
  await expect(expensesPage.payerSelect).toHaveText(payer);
  return expensesPage;
}

test.describe('Critical Flow: Expenses', { tag: '@expenses' }, () => {
  test.describe('Basic Expense Operations', () => {
    test('should create expense with single payer and multiple splits', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Single payer');

      await expensesPage.selectPayer(BLAKE);
      // Each new split takes the first member without one: Ari, then Blake.
      await expensesPage.addSplit();
      await expensesPage.addSplit();
      await expect(expensesPage.splitRows).toHaveText([ARI, BLAKE]);
      await expensesPage.selectSplitMember(1, CODY);
      await expensesPage.fillExpenseForm({
        description,
        category: 'Travel',
        amount: 90,
      });

      const amounts = byAmount(90, [0, 0]);
      await expensesPage.expectAllocatedAmounts(amounts);
      await expensesPage.saveExpense();

      await expect(expensesPage.snackbarWith('Expense added')).toBeVisible();
      await expensesPage.expectSavedExpense(description, {
        payer: BLAKE,
        category: 'Travel',
        total: 90,
        date: new Date(),
        splits: zipSplits([ARI, CODY], amounts),
      });
    });

    test('should save and add another expense', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Add another');

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 60,
      });
      const amounts = byAmount(60, [0, 0, 0]);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveAndAddAnother();

      // Still on a blank Add Expense form (Main doesn't auto-add members).
      await expect(page).toHaveURL(/\/expenses\/add$/);
      await expect(expensesPage.pageTitle).toHaveText('Add Expense');
      await expect(expensesPage.descriptionInput).toHaveValue('');
      await expect(expensesPage.totalAmountInput).toHaveValue('0.00');
      await expect(expensesPage.categorySelect).toHaveText('');
      await expect(expensesPage.splitRows).toHaveCount(0);
      await expect(expensesPage.payerSelect).toHaveText(ARI);

      await expensesPage.navigateToList();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 60,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });

    test('should move through the fields on Enter and save only from the Save button', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Enter to Save');

      await expensesPage.addAllMembers();
      await expensesPage.setDescription(description);
      await expensesPage.selectCategory('Food');
      // The form is valid from here on, but users usually still adjust the
      // evenly prefilled splits, so Enter only ever moves on, like Tab.
      await expensesPage.totalAmountInput.fill('75');
      await expensesPage.totalAmountInput.press('Enter');
      await expect(expensesPage.proportionalAmountInput).toBeFocused();
      await expensesPage.proportionalAmountInput.press('Enter');
      for (let i = 0; i < MAIN_MEMBERS.length; i++) {
        const memberSelect = expensesPage.splitRows.nth(i);
        await expect(memberSelect).toBeFocused();
        // Moves on rather than opening the dropdown
        await memberSelect.press('Enter');
        await expect(expensesPage.selectPanel).toBeHidden();
        const amount = expensesPage.assignedAmountInputs.nth(i);
        await expect(amount).toBeFocused();
        await amount.press('Enter');
      }

      // After the last field, Enter lands on Save; only Enter there saves.
      await expect(expensesPage.saveButton).toBeFocused();
      await expect(page).toHaveURL(/\/expenses\/add$/);
      await expensesPage.saveButton.press('Enter');

      await expect(page).toHaveURL(/\/expenses$/);
      await expect(expensesPage.snackbarWith('Expense added')).toBeVisible();
      await expensesPage.waitForList();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 75,
        splits: zipSplits(MAIN_MEMBERS, byAmount(75, [0, 0, 0])),
      });
    });

    test('should move to the next field on Enter while the expense is incomplete', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);

      await expensesPage.descriptionInput.fill(
        uniqueDescription('Enter moves')
      );
      await expensesPage.descriptionInput.press('Enter');

      // Nothing saved; like Tab, the cursor moved on to the next field.
      await expect(expensesPage.categorySelect).toBeFocused();
      await expect(page).toHaveURL(/\/expenses\/add$/);
    });

    // "should memorize expense for reuse" was removed: the add-expense form
    // no longer memorizes; that moved to /memorized/add (Plan 3's @memorized).

    test('should cancel expense creation', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Cancelled');

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 100,
      });

      await expensesPage.cancelExpense();

      await expect(expensesPage.expenseRow(SEEDED_DESCRIPTION)).toBeVisible();
      await expect(expensesPage.expenseRow(description)).toHaveCount(0);
    });
  });

  test.describe('Split Management', () => {
    test('should add all members at once', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Add all');

      await expensesPage.addAllMembers();
      await expect(expensesPage.splitRows).toHaveText(MAIN_MEMBERS);
      await expect(expensesPage.addSplitButton).toBeDisabled();

      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 100,
      });
      const amounts = byAmount(100, [0, 0, 0]);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 100,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });

    test('should remove splits dynamically', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Remove split');

      await expensesPage.addAllMembers();
      await expect(expensesPage.splitRows).toHaveCount(3);

      await expensesPage.removeSplit(0);
      await expect(expensesPage.splitRows).toHaveText([BLAKE, CODY]);
      await expect(expensesPage.addSplitButton).toBeEnabled();
      await expect(expensesPage.addAllMembersButton).toBeEnabled();

      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 90,
      });
      const amounts = byAmount(90, [0, 0]);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 90,
        splits: zipSplits([BLAKE, CODY], amounts),
      });
    });
  });

  test.describe('Split Methods', () => {
    test('should split by amount with an evenly shared remainder', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('By amount');
      const assigned = [30, 20, 10];

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 120,
      });
      for (const [i, amount] of assigned.entries()) {
        await expensesPage.updateSplitAmount(i, amount);
      }

      const amounts = byAmount(120, assigned);
      await expensesPage.expectAllocatedAmounts(amounts);
      await expect(expensesPage.sharedRemainderAmount).toHaveText(
        formatMoney(120 - 30 - 20 - 10)
      );

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 120,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });

    test('should split by percentage, computing the last percentage', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('By percentage');

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 250,
      });
      await expensesPage.setSplitMethod('percentage');

      // Percentage mode has no pools, and the last row is read-only.
      await expect(expensesPage.proportionalAmountInput).toBeHidden();
      await expect(expensesPage.percentageInputs).toHaveCount(3);
      await expect(expensesPage.assignedAmountInputs).toHaveCount(0);
      const last = expensesPage.percentageInputs.nth(2);
      await expect(last).toHaveAttribute('readonly');
      await expect(last).toHaveValue('100');

      await expensesPage.setSplitPercentage(0, 45);
      await expensesPage.setSplitPercentage(1, 35);

      const expected = byPercentage(250, [45, 35, 0]);
      await expect(last).toHaveValue(String(expected.percentages[2]));
      await expensesPage.expectAllocatedAmounts(expected.amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 250,
        splits: zipSplits(MAIN_MEMBERS, expected.amounts),
      });
    });

    test('should split by shares in proportion', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('By shares');
      const shares = [3, 2, 1];

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 100,
      });
      await expensesPage.setSplitMethod('shares');

      await expect(expensesPage.proportionalAmountInput).toBeHidden();
      await expect(expensesPage.sharesInputs).toHaveCount(3);
      for (const [i, share] of shares.entries()) {
        await expensesPage.setSplitShares(i, share);
      }

      const amounts = byShares(100, shares);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 100,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });
  });

  test.describe('Proportional Allocation', () => {
    test('should handle simple proportional allocation', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Proportional');

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 150,
        proportionalAmount: 30,
      });
      await expensesPage.updateSplitAmount(0, 60);

      const amounts = byAmount(150, [60, 0, 0], 30);
      await expensesPage.expectAllocatedAmounts(amounts);
      await expect(expensesPage.sharedRemainderAmount).toHaveText(
        formatMoney(150 - 60 - 30)
      );

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 150,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });

    test('should handle complex proportional allocation', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Complex proportional');
      const assigned = [34.99, 32.85, 43.15];

      await expensesPage.addAllMembers();
      await expensesPage.setDescription(description);
      await expensesPage.selectCategory('Food');
      // Proportional amount before the total, then the member amounts.
      await expensesPage.setProportionalAmount(24.76);
      await expensesPage.setTotalAmount(150);
      for (const [i, amount] of assigned.entries()) {
        await expensesPage.updateSplitAmount(i, amount);
      }

      const amounts = byAmount(150, assigned, 24.76);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 150,
        splits: zipSplits(MAIN_MEMBERS, amounts),
      });
    });
  });

  test.describe('Validation and UI', () => {
    test('should validate required fields', async ({ page }) => {
      const expensesPage = await startExpense(page);

      // Save stays disabled until description, amount, a split and a
      // category are all present.
      await expect(expensesPage.saveButton).toBeDisabled();
      await expensesPage.setDescription(uniqueDescription('Incomplete'));
      await expect(expensesPage.saveButton).toBeDisabled();
      await expensesPage.setTotalAmount(40);
      await expect(expensesPage.saveButton).toBeDisabled();
      await expensesPage.addAllMembers();
      await expect(expensesPage.saveButton).toBeDisabled();
      await expensesPage.selectCategory('Food');
      await expect(expensesPage.saveButton).toBeEnabled();
    });

    // Member amounts above the total would leave a negative remainder to
    // share, handing the other members negative amounts.
    test('should keep Save disabled while member amounts exceed the total', async ({
      page,
    }) => {
      const expensesPage = await startExpense(page);

      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description: uniqueDescription('Over the total'),
        category: 'Food',
        amount: 90,
      });
      await expensesPage.updateSplitAmount(0, 100);
      await expect(expensesPage.remainderError).toBeVisible();
      await expect(expensesPage.saveButton).toBeDisabled();

      await expensesPage.updateSplitAmount(0, 30);
      await expect(expensesPage.remainderError).toBeHidden();
      await expect(expensesPage.saveButton).toBeEnabled();
    });

    test('should auto-select single category', async ({ page }) => {
      const expensesPage = await startExpense(page, {
        user: soloUser,
        group: oneCategory,
        payer: SAM,
      });
      const description = uniqueDescription('Auto category');

      // One category: the field is hidden and pre-selected. Auto-add is on.
      await expect(expensesPage.categorySelect).toBeHidden();
      await expect(expensesPage.splitRows).toHaveText([DEV, SAM]);

      await expensesPage.fillExpenseForm({ description, amount: 40 });
      const amounts = byAmount(40, [0, 0]);
      await expensesPage.expectAllocatedAmounts(amounts);

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: SAM,
        category: 'General',
        total: 40,
        splits: zipSplits([DEV, SAM], amounts),
      });
    });

    test('should validate zero amount', async ({ page }) => {
      const expensesPage = await startExpense(page);

      await expensesPage.addAllMembers();
      await expensesPage.setDescription(uniqueDescription('Zero amount'));
      await expensesPage.selectCategory('Food');
      await expensesPage.setTotalAmount(0);

      const zeroError = expensesPage.formErrors.filter({
        hasText: 'Cannot be zero',
      });
      await expect(zeroError).toBeVisible();
      await expect(expensesPage.saveButton).toBeDisabled();

      await expensesPage.setTotalAmount(10);
      await expect(zeroError).toHaveCount(0);
      await expect(expensesPage.saveButton).toBeEnabled();
    });

    test('should handle date selection', async ({ page }) => {
      const expensesPage = await startExpense(page);
      const description = uniqueDescription('Date');
      // A day of the current month other than today, so the picker's
      // month view shows it and the saved date differs from the default.
      const today = new Date();
      const picked = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() === 15 ? 16 : 15
      );

      await expensesPage.pickDate(picked);
      await expensesPage.addAllMembers();
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 55,
      });

      await expensesPage.saveExpense();
      await expensesPage.expectSavedExpense(description, {
        payer: ARI,
        category: 'Food',
        total: 55,
        date: picked,
        splits: zipSplits(MAIN_MEMBERS, byAmount(55, [0, 0, 0])),
      });
    });
  });
});
