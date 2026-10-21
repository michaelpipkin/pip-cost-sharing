import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { ExpensesPage } from '../pages/expenses.page';
import { HistoryPage, type ExpectedPayment } from '../pages/history.page';
import { SummaryPage } from '../pages/summary.page';
import { seedDateDaysAgo as daysAgo } from '../seed/dates';
import { PAYMENT_FLOW } from '../seed/datasets/payment-flow';
import type { SeedGroup, SeedUser } from '../seed/types';
import { readClipboard } from '../utils/clipboard';
import { formatMoney, formatShortDate } from '../utils/format';
import { signInAs } from '../utils/session';

// Data: e2e/seed/datasets/payment-flow.ts. Each test signs in as its own
// group's only user (Pay, Cancel, Method, Mutual), so no two tests share a
// group or a user, and no test switches groups. Every payment recorded here
// is between this dataset's members, so payment mail can only reach its
// users (mail is suppressed under the demo project; nothing asserts on it).
//
// Coverage that moved: summary date filtering and category detail are
// summary.spec.ts's ("should filter summary by date range", "should show
// category breakdown in detail"), against SHARED's exact balances.

const { flowUser, cancelUser, methodUser, payeeUser, mutualUser } =
  PAYMENT_FLOW.users;
const { pay, cancel, method, mutual } = PAYMENT_FLOW.groups;

/**
 * Signs in (landing on the user's only group) and opens Summary from the nav
 * bar: in-app, because a full load of a deep link right after sign-in can be
 * redirected to /expenses.
 */
async function openSummary(
  page: Page,
  user: SeedUser,
  group: SeedGroup
): Promise<SummaryPage> {
  await signInAs(page, user);
  const summaryPage = new SummaryPage(page);
  await summaryPage.goto();
  await expect(summaryPage.currentGroupName).toHaveText(group.name);
  return summaryPage;
}

/** Submits the open payment dialog and waits for the app to confirm it. */
async function recordPayment(summaryPage: SummaryPage): Promise<void> {
  await summaryPage.submitPayment();
  await expect(
    summaryPage.snackbarWith('Expenses have been marked paid')
  ).toBeVisible();
  // Every unpaid split in the group was between the two paying members.
  await summaryPage.verifyEmptyState();
  await expect(summaryPage.summaryRows).toHaveCount(0);
}

function uniqueDescription(label: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `Flow – ${label} ${suffix}`;
}

test.describe(
  'Critical Flow: Expense → Payment → History',
  { tag: ['@expenses', '@summary', '@history'] },
  () => {
    test('should create expense, pay it, and verify in history', async ({
      seededPage: page,
    }) => {
      // Expenses: add a Food expense; auto-add splits it between both
      // members (listed by name), Pia paying.
      await signInAs(page, flowUser);
      const expensesPage = new ExpensesPage(page);
      await expect(page).toHaveURL(/\/expenses$/);
      await expensesPage.waitForList();
      await expect(expensesPage.currentGroupName).toHaveText(pay.name);

      await expensesPage.openAddExpense();
      await expect(expensesPage.payerSelect).toHaveText('Pia');
      await expect(expensesPage.splitRows).toHaveText(['Pia', 'Quinn']);
      const description = uniqueDescription('Pay lunch');
      await expensesPage.fillExpenseForm({
        description,
        category: 'Food',
        amount: 60,
      });
      await expensesPage.expectAllocatedAmounts([30, 30]);
      await expensesPage.saveExpense();
      await expect(expensesPage.snackbarWith('Expense added')).toBeVisible();
      await expensesPage.expectSavedExpense(description, {
        payer: 'Pia',
        category: 'Food',
        total: 60,
        date: new Date(),
        splits: [
          { member: 'Pia', amount: 30 },
          { member: 'Quinn', amount: 30 },
        ],
      });

      // Summary: Quinn owes Pia her lunch share plus the seeded fuel share.
      const summaryPage = new SummaryPage(page);
      await summaryPage.goto();
      await summaryPage.expectBalances([
        { owedBy: 'Quinn', owedTo: 'Pia', amount: 50 },
      ]);
      await summaryPage.expandDetail(0);
      await summaryPage.expectCategoryLines(0, [
        { category: 'Food', amount: 30 },
        { category: 'Fuel', amount: 20 },
      ]);

      // Pay: the dialog names the payee (Pia has no saved payment IDs).
      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.noPaymentMethodsMessage).toContainText(
        'Pia does not have any saved payment service IDs'
      );
      await recordPayment(summaryPage);

      // History: one payment for the net amount, today.
      const payment: ExpectedPayment = {
        date: new Date(),
        paidBy: 'Quinn',
        paidTo: 'Pia',
        amount: 50,
      };
      const historyPage = new HistoryPage(page);
      await historyPage.goto();
      await historyPage.expectPayments([payment]);

      // Its detail lists both paid splits, one per category (by date).
      await historyPage.openDetail(0);
      await historyPage.expectDetail(payment);
      await historyPage.expectPaidSplits([
        { date: daysAgo(4), category: 'Fuel' },
        { date: new Date(), category: 'Food' },
      ]);

      // ...and the copied summary breaks the payment down by category.
      // history-detail.component generateSummaryText: amounts right-aligned
      // to the longest "Category: amount" line (13 chars), under a rule one
      // wider.
      await historyPage.copyDetailToClipboard();
      expect(await readClipboard(page)).toBe(
        [
          'Payment Summary',
          `Quinn paid Pia ${formatMoney(50)} on ${formatShortDate(payment.date)}`,
          '',
          'Breakdown by Category:',
          '='.repeat(14),
          'Food:  $ 30.00',
          'Fuel:  $ 20.00',
        ].join('\n')
      );
    });

    test('should handle payment cancellation', async ({ page }) => {
      const summaryPage = await openSummary(page, cancelUser, cancel);
      const balances = [{ owedBy: 'Cora', owedTo: 'Remy', amount: 12 }];
      await summaryPage.expectBalances(balances);

      // The dialog names the payee; Cancel records nothing.
      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.noPaymentMethodsMessage).toContainText(
        'Remy does not have any saved payment service IDs'
      );
      await summaryPage.cancelPayment();
      await expect(
        summaryPage.snackbarWith('Expenses have been marked paid')
      ).toHaveCount(0);
      await summaryPage.expectBalances(balances);

      const historyPage = new HistoryPage(page);
      await historyPage.goto();
      await historyPage.verifyEmptyState();
      await expect(historyPage.historyRows).toHaveCount(0);
    });

    // The payment dialog has no method field and history stores none: it
    // lists the payee's saved payment IDs, and "choosing" one means copying
    // that ID to pay outside the app before recording the payment.
    test('should handle payment with payment method selection', async ({
      seededPage: page,
    }) => {
      const summaryPage = await openSummary(page, methodUser, method);
      await summaryPage.expectBalances([
        { owedBy: 'Mae', owedTo: 'Nico', amount: 40 },
      ]);

      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.paymentInstructions).toContainText(
        'You can pay Nico with any of the following methods'
      );
      // Only Venmo and Zelle are set, so only they are listed.
      await expect(summaryPage.paymentMethods).toHaveCount(2);
      await expect(summaryPage.paymentMethods.nth(0)).toContainText(
        `Venmo : ${payeeUser.profile!.venmoId!}`
      );
      await expect(summaryPage.paymentMethods.nth(1)).toContainText(
        `Zelle : ${payeeUser.profile!.zelleId!}`
      );
      await expect(summaryPage.noPaymentMethodsMessage).toHaveCount(0);

      await summaryPage.copyPaymentId('zelle');
      expect(await readClipboard(page)).toBe(payeeUser.profile!.zelleId!);

      await recordPayment(summaryPage);

      const payment: ExpectedPayment = {
        date: new Date(),
        paidBy: 'Mae',
        paidTo: 'Nico',
        amount: 40,
      };
      const historyPage = new HistoryPage(page);
      await historyPage.goto();
      await historyPage.expectPayments([payment]);
      await historyPage.openDetail(0);
      await historyPage.expectDetail(payment);
      await historyPage.expectPaidSplits([
        { date: daysAgo(5), category: 'Tickets' },
      ]);
    });

    test('should calculate net amounts correctly with mutual debts', async ({
      page,
    }) => {
      const summaryPage = await openSummary(page, mutualUser, mutual);

      // Nell owes Max 50 (cabin) and Max owes Nell 30 (dinner): one netted
      // line, Nell owes Max 20.
      await summaryPage.expectBalances([
        { owedBy: 'Nell', owedTo: 'Max', amount: 20 },
      ]);
      await summaryPage.expandDetail(0);
      await summaryPage.expectCategoryLines(0, [
        { category: 'Dining', amount: -30 },
        { category: 'Lodging', amount: 50 },
      ]);

      // Paying settles both directions with one payment of the net amount.
      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.noPaymentMethodsMessage).toContainText(
        'Max does not have any saved payment service IDs'
      );
      await recordPayment(summaryPage);

      const payment: ExpectedPayment = {
        date: new Date(),
        paidBy: 'Nell',
        paidTo: 'Max',
        amount: 20,
      };
      const historyPage = new HistoryPage(page);
      await historyPage.goto();
      await historyPage.expectPayments([payment]);
      await historyPage.openDetail(0);
      await historyPage.expectDetail(payment);
      await historyPage.expectPaidSplits([
        { date: daysAgo(8), category: 'Lodging' },
        { date: daysAgo(6), category: 'Dining' },
      ]);
    });
  }
);
