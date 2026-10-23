import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { SummaryPage, type ExpectedBalance } from '../pages/summary.page';
import { getSeedAdmin } from '../seed/admin';
import { seedDateDaysAgo as daysAgo } from '../seed/dates';
import { SHARED } from '../seed/datasets/shared';
import { SUMMARY } from '../seed/datasets/summary';
import type { SeedUser } from '../seed/types';
import { findMail } from '../utils/auth-emulator';
import { readClipboard } from '../utils/clipboard';
import { signInAs } from '../utils/session';

// Data: e2e/seed/datasets/summary.ts for the empty state ("Summary – Empty"),
// the payment request ("Summary – Request", whose only mail recipient is
// summary-payer) and the payee handles ("Summary – Handles"); every other test reads SHARED ("Shared – Beach House") as
// alice and changes nothing (the payment dialog is always cancelled). The balances below are
// the ones documented in e2e/seed/datasets/shared.ts.

// Shared unpaid expenses: Grocery run 20 days ago, Beach house rental 15,
// Seafood dinner 10, Farmers market 5.

/**
 * Alice's view (the default: Summary selects you). Alice owes Bob 84.00
 * (160 rental - 40 groceries - 36 market) and Carol 4.00 (60 dinner - 20
 * groceries - 36 market); Dana and Alice share no expense.
 */
const ALICE_BALANCES: ExpectedBalance[] = [
  { owedBy: 'Alice', owedTo: 'Bob', amount: 84 },
  { owedBy: 'Alice', owedTo: 'Carol', amount: 4 },
];

/** Bob's view: everyone owes Bob (Carol 80 - 30 = 50, Dana 40). */
const BOB_BALANCES: ExpectedBalance[] = [
  { owedBy: 'Alice', owedTo: 'Bob', amount: 84 },
  { owedBy: 'Carol', owedTo: 'Bob', amount: 50 },
  { owedBy: 'Dana', owedTo: 'Bob', amount: 40 },
];

/** Dana's view: Dana owes Bob 40 (rental) and Carol 30 (dinner). */
const DANA_BALANCES: ExpectedBalance[] = [
  { owedBy: 'Dana', owedTo: 'Bob', amount: 40 },
  { owedBy: 'Dana', owedTo: 'Carol', amount: 30 },
];

/** The (cold) sendPaymentRequests callable, behind the loading overlay. */
const REQUEST_CALLABLE_TIMEOUT_MS = 30_000;
/** Callable -> mail doc -> sendMailQueueEmail delivery, on cold functions. */
const MAIL_DELIVERY_TIMEOUT_MS = 120_000;

/**
 * Signs in and opens Summary from the nav bar, and checks it is showing the
 * expected group. In-app navigation: a full load of a deep link right after
 * sign-in can be redirected to /expenses.
 */
async function openSummary(
  page: Page,
  user: SeedUser = SHARED.users.alice,
  groupName: string = SHARED.group.name
): Promise<SummaryPage> {
  await signInAs(page, user);
  const summaryPage = new SummaryPage(page);
  await summaryPage.goto();
  await expect(summaryPage.currentGroupName).toHaveText(groupName);
  return summaryPage;
}

test.describe('Critical Flow: Summary', { tag: '@summary' }, () => {
  test('should show empty state when no unpaid splits', async ({ page }) => {
    const summaryPage = await openSummary(
      page,
      SUMMARY.users.summaryUser,
      SUMMARY.groups.empty.name
    );

    await summaryPage.verifyEmptyState();
    await expect(summaryPage.summaryRows).toHaveCount(0);
  });

  test('should display who-owes-whom summary from unpaid splits', async ({
    page,
  }) => {
    const summaryPage = await openSummary(page);

    await expect(summaryPage.memberSelect).toHaveText('Alice');
    await summaryPage.expectBalances(ALICE_BALANCES);
  });

  test('should expand and collapse detail rows', async ({ page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);
    await expect(summaryPage.detail).toHaveCount(0);

    await summaryPage.expandDetail(0);
    await expect(summaryPage.rowDetail(0)).toBeVisible();
    await expect(summaryPage.detail).toHaveCount(1);

    // Expanding another row collapses the first: one detail at a time.
    await summaryPage.expandDetail(1);
    await expect(summaryPage.rowDetail(1)).toBeVisible();
    await expect(summaryPage.rowDetail(0)).toHaveCount(0);
    await expect(summaryPage.detail).toHaveCount(1);

    // Clicking the expanded row collapses it.
    await summaryPage.expandDetail(1);
    await expect(summaryPage.detail).toHaveCount(0);
  });

  test('should show category breakdown in detail', async ({ page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    // Alice -> Bob: Bob's groceries + market shares (40 + 36) are owed the
    // other way, Alice's 40% of the rental is owed to Bob.
    await summaryPage.expandDetail(0);
    await summaryPage.expectCategoryLines(0, [
      { category: 'Groceries', amount: -76 },
      { category: 'Lodging', amount: 160 },
    ]);

    // Alice -> Carol: Alice's 2 dinner shares, less Carol's groceries +
    // market shares (20 + 36).
    await summaryPage.expandDetail(1);
    await summaryPage.expectCategoryLines(1, [
      { category: 'Dining', amount: 60 },
      { category: 'Groceries', amount: -56 },
    ]);
  });

  test('should filter summary by member', async ({ page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    await summaryPage.filterByMember('Bob');
    await summaryPage.expectBalances(BOB_BALANCES);

    // Dana is a placeholder member (no user), still selectable.
    await summaryPage.filterByMember('Dana');
    await summaryPage.expectBalances(DANA_BALANCES);
  });

  test('should filter summary by date range', async ({ page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    // From 12 days ago: only the dinner (10) and the market (5). Bob now
    // owes Alice his 36 market share; Alice owes Carol 60 - 36 = 24.
    await summaryPage.filterByDateRange(daysAgo(12));
    await summaryPage.expectBalances([
      { owedBy: 'Bob', owedTo: 'Alice', amount: 36 },
      { owedBy: 'Alice', owedTo: 'Carol', amount: 24 },
    ]);

    // ...up to 7 days ago: the dinner alone.
    await summaryPage.filterByDateRange(undefined, daysAgo(7));
    await summaryPage.expectBalances([
      { owedBy: 'Alice', owedTo: 'Carol', amount: 60 },
    ]);
  });

  test('should clear filters correctly', async ({ page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    // Nothing in the last 3 days: the newest shared expense is 5 days old.
    await summaryPage.filterByDateRange(daysAgo(3), daysAgo(0));
    await expect(summaryPage.noMemberSplitsPlaceholder).toBeVisible();
    await expect(summaryPage.summaryRows).toHaveCount(0);

    await summaryPage.clearFilters();
    await expect(summaryPage.startDateInput).toHaveValue('');
    await expect(summaryPage.endDateInput).toHaveValue('');
    await summaryPage.expectBalances(ALICE_BALANCES);
  });

  test('should copy summary to clipboard', async ({ seededPage: page }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    await summaryPage.copyToClipboard(0);

    // summary.component generateSummaryText: amounts right-aligned to the
    // longest "Category: amount" line (19 chars), under a rule one wider.
    expect(await readClipboard(page)).toBe(
      [
        'Expenses Summary',
        'Alice owes Bob $ 84.00',
        '',
        'Breakdown by Category:',
        '='.repeat(20),
        'Groceries:  -$ 76.00',
        'Lodging:    $ 160.00',
      ].join('\n')
    );
  });

  test('should email a payment request to the member who owes', async ({
    page,
  }) => {
    const { summaryPayee, summaryPayer } = SUMMARY.users;
    const group = SUMMARY.groups.request;
    const summaryPage = await openSummary(page, summaryPayee, group.name);
    await summaryPage.expectBalances([
      { owedBy: 'Pax', owedTo: 'Pia', amount: 20 },
    ]);

    await summaryPage.requestPayment(0);
    await expect(
      summaryPage.snackbarWith('Payment request email sent successfully')
    ).toBeVisible({ timeout: REQUEST_CALLABLE_TIMEOUT_MS });

    // The server built and addressed it: Pax's stored email, Pia's payment
    // method, the group-currency amount. sendMailQueueEmail then marks it
    // SUCCESS (suppressed under the demo- test project).
    await expect
      .poll(
        async () => {
          const mail = await findMail(summaryPayer.email);
          return mail
            ? {
                subject: mail['message']?.subject,
                mentionsAmount: mail['message']?.text?.includes(
                  'requesting payment of $20.00 in'
                ),
                listsVenmo: mail['message']?.text?.includes(
                  `Venmo: @${summaryPayee.profile!.venmoId!}`
                ),
                state: mail['delivery']?.state,
                messageId: mail['delivery']?.info?.messageId,
              }
            : null;
        },
        {
          message: `no delivered payment request for ${summaryPayer.email}`,
          timeout: MAIL_DELIVERY_TIMEOUT_MS,
        }
      )
      .toEqual({
        subject: `Payment request from Pia for group "${group.name}" in PipSplit`,
        mentionsAmount: true,
        listsVenmo: true,
        state: 'SUCCESS',
        messageId: 'suppressed',
      });
    // Nothing went to the person who asked.
    expect(await findMail(summaryPayee.email)).toBeNull();
  });

  test('should open payment dialog for a payee without payment IDs', async ({
    page,
  }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    // Row 0: Alice owes Bob 84.00, so the payment goes to Bob, who has no
    // saved payment IDs.
    await summaryPage.openPaymentDialog(0);
    await expect(summaryPage.paymentDialogTitle).toHaveText('Record Payment');
    await expect(summaryPage.noPaymentMethodsMessage).toContainText(
      'Bob does not have any saved payment service IDs'
    );
    await expect(summaryPage.paymentInstructions).toHaveCount(0);

    // Cancel: nothing is paid (and no payment mail reaches shared users).
    await summaryPage.cancelPayment();
    await summaryPage.expectBalances(ALICE_BALANCES);
  });

  test('should open payment dialog listing the payee payment IDs', async ({
    page,
  }) => {
    const summaryPage = await openSummary(page);
    await summaryPage.expectBalances(ALICE_BALANCES);

    // From 12 days ago Bob owes Alice 36.00, so the payment goes to Alice,
    // whose Venmo ID is seeded.
    await summaryPage.filterByDateRange(daysAgo(12));
    await summaryPage.expectBalances([
      { owedBy: 'Bob', owedTo: 'Alice', amount: 36 },
      { owedBy: 'Alice', owedTo: 'Carol', amount: 24 },
    ]);

    await summaryPage.openPaymentDialog(0);
    await expect(summaryPage.paymentInstructions).toContainText(
      'You can pay Alice with any of the following methods'
    );
    // Only Venmo is set, so it is the only method listed.
    await expect(summaryPage.paymentMethods).toHaveCount(1);
    await expect(summaryPage.paymentMethods.getByTestId('venmo-link')).toBeVisible();
    await expect(summaryPage.paymentMethods).toContainText(
      SHARED.users.alice.profile!.venmoId!
    );
    await expect(summaryPage.noPaymentMethodsMessage).toHaveCount(0);

    await summaryPage.cancelPayment();
    await summaryPage.expectBalances([
      { owedBy: 'Bob', owedTo: 'Alice', amount: 36 },
      { owedBy: 'Alice', owedTo: 'Carol', amount: 24 },
    ]);
  });

  // The Pay dialog's handles come from the getMemberPaymentMethods callable,
  // which answers only for a payee row linked to a user.
  test('should list a linked payee’s handles and none for an unlinked one', async ({
    page,
  }) => {
    const { handlesPat, handlesLou, handlesUna } = SUMMARY.users;
    const group = SUMMARY.groups.handles;
    // Una's row is seeded linked; unlink it (a later write that leaves the
    // email alone is never re-linked by the member trigger).
    await getSeedAdmin()
      .db.doc(`groups/${group.key}/members/una`)
      .update({ userRef: null });

    const summaryPage = await openSummary(page, handlesPat, group.name);
    await summaryPage.expectBalances([
      { owedBy: 'Pat', owedTo: 'Lou', amount: 20 },
      { owedBy: 'Pat', owedTo: 'Una', amount: 20 },
    ]);

    // Pat owes Lou, whose Venmo and PayPal IDs are on his profile.
    const payees = (await summaryPage.owedToCells.allTextContents()).map((t) =>
      t.trim()
    );
    await summaryPage.openPaymentDialog(payees.indexOf('Lou'));
    await expect(summaryPage.paymentInstructions).toContainText(
      'You can pay Lou with any of the following methods'
    );
    await expect(summaryPage.paymentMethods).toHaveCount(2);
    await expect(summaryPage.paymentMethods.getByTestId('venmo-link')).toBeVisible();
    await expect(summaryPage.paymentMethods).toContainText([
      handlesLou.profile!.venmoId!,
      handlesLou.profile!.paypalId!,
    ]);
    await expect(summaryPage.noPaymentMethodsMessage).toHaveCount(0);
    await summaryPage.cancelPayment();

    // Una's row is unlinked, so the dialog has nothing to show even though
    // her address belongs to a user with a Venmo ID.
    await summaryPage.openPaymentDialog(payees.indexOf('Una'));
    await expect(summaryPage.noPaymentMethodsMessage).toContainText(
      'Una does not have any saved payment service IDs'
    );
    await expect(summaryPage.paymentInstructions).toHaveCount(0);
    await expect(summaryPage.paymentMethods).toHaveCount(0);
    await expect(
      summaryPage.paymentDialog.getByText(handlesUna.profile!.venmoId!)
    ).toHaveCount(0);
    await summaryPage.cancelPayment();
  });
});
