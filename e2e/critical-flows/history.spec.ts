import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { formatMoney, formatShortDate } from '../pages/expenses.page';
import {
  HistoryPage,
  type ExpectedPaidSplit,
  type ExpectedPayment,
} from '../pages/history.page';
import { SummaryPage } from '../pages/summary.page';
import { seedDateDaysAgo as daysAgo } from '../seed/dates';
import { HISTORY } from '../seed/datasets/history';
import { SHARED } from '../seed/datasets/shared';
import type { SeedUser } from '../seed/types';
import { readClipboard } from '../utils/clipboard';
import { signInAs } from '../utils/session';

// Data: the display and copy tests read SHARED's one payment as alice and
// change nothing. The empty state uses history-empty ("History – Empty"); the
// unpay test is the only reader of history-user's "History – Delete", whose
// seeded payment it deletes (e2e/seed/datasets/history.ts).

/**
 * SHARED p-bob-alice: Bob paid Alice 25.00 three days ago, settling his
 * 25.00 share of the Snack run (Groceries, 25 days ago).
 */
const BOB_TO_ALICE: ExpectedPayment = {
  date: daysAgo(3),
  paidBy: 'Bob',
  paidTo: 'Alice',
  amount: 25,
};

/** The one split p-bob-alice paid: Bob's share of the Snack run. */
const SNACK_RUN_SPLIT: ExpectedPaidSplit = {
  date: daysAgo(25),
  category: 'Groceries',
};

/** History – Delete p-ivo-hana: Ivo paid Hana 30.00 for the dinner. */
const IVO_TO_HANA: ExpectedPayment = {
  date: daysAgo(2),
  paidBy: 'Ivo',
  paidTo: 'Hana',
  amount: 30,
};

/** Firestore writes plus the (cold) unpay-notice email callable. */
const UNPAY_TIMEOUT_MS = 30_000;

/**
 * Signs in and opens History from the nav bar, and checks it is showing the
 * expected group. In-app navigation: a full load of a deep link right after
 * sign-in can be redirected to /expenses.
 */
async function openHistory(
  page: Page,
  user: SeedUser = SHARED.users.alice,
  groupName: string = SHARED.group.name
): Promise<HistoryPage> {
  await signInAs(page, user);
  const historyPage = new HistoryPage(page);
  await historyPage.goto();
  await expect(historyPage.currentGroupName).toHaveText(groupName);
  return historyPage;
}

test.describe('Critical Flow: History', { tag: '@history' }, () => {
  test('should show empty state when no history', async ({ page }) => {
    const historyPage = await openHistory(
      page,
      HISTORY.users.emptyUser,
      HISTORY.groups.emptyGroup.name
    );

    await historyPage.verifyEmptyState();
    await expect(historyPage.historyRows).toHaveCount(0);
  });

  test('should display payment history and its detail', async ({ page }) => {
    const historyPage = await openHistory(page);

    await expect(historyPage.memberSelect).toHaveText('Alice');
    await historyPage.expectPayments([BOB_TO_ALICE]);

    await historyPage.openDetail(0);
    await historyPage.expectDetail(BOB_TO_ALICE);
    await historyPage.expectPaidSplits([SNACK_RUN_SPLIT]);
    await historyPage.expectDetailAmounts(BOB_TO_ALICE.amount, [25]);
  });

  test('should copy history to clipboard', async ({ seededPage: page }) => {
    const historyPage = await openHistory(page);
    await historyPage.expectPayments([BOB_TO_ALICE]);

    await historyPage.openDetail(0);
    // The breakdown is built from the paid splits, so wait for them.
    await historyPage.expectPaidSplits([SNACK_RUN_SPLIT]);
    await historyPage.copyDetailToClipboard();

    // history-detail.component generateSummaryText: the date is
    // toLocaleDateString (en-US); amounts right-aligned to the longest
    // "Category: amount" line (18 chars), under a rule one wider.
    expect(await readClipboard(page)).toBe(
      [
        'Payment Summary',
        `Bob paid Alice ${formatMoney(25)} on ${formatShortDate(BOB_TO_ALICE.date)}`,
        '',
        'Breakdown by Category:',
        '='.repeat(19),
        'Groceries:  $ 25.00',
      ].join('\n')
    );
  });

  test('should delete payment record with confirmation', async ({ page }) => {
    const historyPage = await openHistory(
      page,
      HISTORY.users.historyUser,
      HISTORY.groups.deleteGroup.name
    );
    await historyPage.expectPayments([IVO_TO_HANA]);

    // Cancelling the confirmation keeps the payment.
    await historyPage.openDetail(0);
    await historyPage.expectDetail(IVO_TO_HANA);
    await historyPage.openUnpayDialog();
    await expect(historyPage.confirmDialogText).toContainText(
      'This will mark all 1 split in this payment as unpaid and delete this history record.'
    );
    await historyPage.cancelButton.click();
    await expect(historyPage.confirmDialog).toBeHidden();
    await historyPage.expectDetail(IVO_TO_HANA);
    await historyPage.backToList();
    await historyPage.expectPayments([IVO_TO_HANA]);

    // Confirming deletes it and returns to the (now empty) list.
    await historyPage.openDetail(0);
    await historyPage.openUnpayDialog();
    await historyPage.confirmButton.click();
    await expect(historyPage.snackbarWith('Payment marked as unpaid')).toBeVisible(
      { timeout: UNPAY_TIMEOUT_MS }
    );
    await expect(page).toHaveURL(/\/analysis\/history$/);
    await historyPage.verifyPageLoaded();
    await historyPage.verifyEmptyState();
    await expect(historyPage.historyRows).toHaveCount(0);

    // ...and its split is unpaid again: Ivo owes Hana 30.00.
    const summaryPage = new SummaryPage(page);
    await summaryPage.goto();
    await summaryPage.expectBalances([
      { owedBy: 'Ivo', owedTo: 'Hana', amount: 30 },
    ]);
  });
});
