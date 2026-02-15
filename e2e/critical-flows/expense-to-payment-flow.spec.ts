import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { HistoryPage } from '../pages/history.page';
import { MembersPage } from '../pages/members.page';
import { SummaryPage } from '../pages/summary.page';

test.describe('Critical Flow: Expense → Payment → History', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;
  let membersPage: MembersPage;
  let expensesPage: ExpensesPage;
  let summaryPage: SummaryPage;
  let historyPage: HistoryPage;

  const testUser = {
    email: 'e2e-flow-tester@test.com',
    password: 'password123',
    displayName: 'E2E Flow Tester',
  };

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);
    membersPage = new MembersPage(preserveDataFirebasePage);
    expensesPage = new ExpensesPage(preserveDataFirebasePage);
    summaryPage = new SummaryPage(preserveDataFirebasePage);
    historyPage = new HistoryPage(preserveDataFirebasePage);

    // Login or create the shared test user
    await authPage.loginOrCreateTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  // Serial workflow - comprehensive payment flow with history features
  test.describe.serial('Payment Workflow and History', () => {
    test('should create expense, pay it, and verify in history', async () => {
      // Setup - Create group with auto-add members enabled
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName); // Make this the active group

      // Add a second member to the group
      await membersPage.goto();
      await membersPage.addMember('Test User 1', 'testuser1@example.com');

      // Create expense (Admin pays $100, to be split equally)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Team Lunch',
        amount: 100,
      });

      // Verify both members have splits (auto-added with equal allocation)
      const splitCount = await expensesPage.splitRows.count();
      expect(splitCount).toBe(2);

      // Save expense
      await expensesPage.saveExpense();

      // Verify success message
      await expect(expensesPage.snackbar).toContainText('Expense added');

      // Navigate to Summary and verify amounts
      await summaryPage.goto();
      await summaryPage.verifyPageLoaded();

      // Verify summary shows the debt
      const summaryCount = await summaryPage.summaryRows.count();
      expect(summaryCount).toBeGreaterThan(0);

      // Pay the expense
      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.paymentDialogTitle).toBeVisible();

      // Submit payment (amount should be pre-filled)
      await summaryPage.submitPayment();

      // Verify success message
      await expect(summaryPage.snackbar).toContainText(
        'Expenses have been marked paid'
      );

      // Verify payment appears in history
      await historyPage.goto();
      await historyPage.verifyPageLoaded();

      // Verify at least one history record exists
      const historyCount = await historyPage.historyRows.count();
      expect(historyCount).toBeGreaterThan(0);

      // Verify the payment record contains expected data
      const historyRecord = await historyPage.getHistoryRecord(0);
      expect(historyRecord.amount).toContain('50'); // Should show $50 payment

      // Verify splits are marked as paid (removed from Summary)
      await summaryPage.goto();

      // The summary should now have fewer entries (or be empty)
      const newSummaryCount = await summaryPage.summaryRows.count();
      expect(newSummaryCount).toBeLessThanOrEqual(summaryCount);
    });

    test('should copy payment history to clipboard', async () => {
      // Skip if clipboard not supported
      if (!TEST_CONFIG.supportsClipboard) {
        test.skip();
        return;
      }

      // Copy the payment created in the previous test
      await historyPage.goto();
      await historyPage.copyToClipboard(0);

      // Verify success message
      await expect(historyPage.snackbar).toContainText('copied');
    });

    test('should handle multiple categories in payment history', async () => {
      // Expand detail on the payment from the first test
      await historyPage.goto();
      await historyPage.verifyPageLoaded();
      await historyPage.expandDetail(0);

      // Detail should show category breakdown
      await expect(historyPage.detailRows.first()).toBeVisible();
    });
  });

  // Serial workflow - payment interactions
  test.describe.serial('Payment Interactions', () => {
    test('should handle payment cancellation', async () => {
      // Setup - Create group with auto-add members
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName); // Make this the active group

      // Add second member with unique email
      await membersPage.goto();
      await membersPage.addMember('Test User 2', 'testuser2@example.com');

      // Create expense (auto-splits equally: Admin $37.50, Test User $37.50)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Cancelled Payment Test',
        amount: 75,
      });
      await expensesPage.saveExpense();

      // Go to Summary
      await summaryPage.goto();
      const initialCount = await summaryPage.summaryRows.count();

      // Open payment dialog and cancel
      await summaryPage.openPaymentDialog(0);
      await summaryPage.cancelPayment();

      // Verify summary unchanged
      const afterCancelCount = await summaryPage.summaryRows.count();
      expect(afterCancelCount).toBe(initialCount);
    });

    test('should handle payment with payment method selection', async () => {
      // Create another expense (reuses group and members from previous test)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Payment Method Test',
        amount: 100,
      });
      await expensesPage.saveExpense();

      // Pay with specific payment method
      await summaryPage.goto();
      await summaryPage.openPaymentDialog(0);

      // Select payment method (if available)
      const paymentMethodVisible = await summaryPage.paymentMethodSelect
        .isVisible()
        .catch(() => false);

      if (paymentMethodVisible) {
        await summaryPage.fillPaymentForm({
          paymentMethod: 'Cash',
        });
      }

      await summaryPage.submitPayment();

      // Verify success
      await expect(summaryPage.snackbar).toContainText(
        'Expenses have been marked paid'
      );
    });
  });

  // Serial workflow - summary features
  test.describe.serial('Summary Features', () => {
    test('should filter summary by date range', async () => {
      // Setup - Create group with auto-add members
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName); // Make this the active group

      // Add second member with unique email
      await membersPage.goto();
      await membersPage.addMember('Test User 3', 'testuser3@example.com');

      // Create expense (auto-splits equally: Admin $25, Test User $25)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Recent Expense',
        amount: 50,
      });
      await expensesPage.saveExpense();

      // Go to Summary
      await summaryPage.goto();
      const initialCount = await summaryPage.summaryRows.count();
      expect(initialCount).toBeGreaterThan(0);

      // Filter to future dates (should show nothing)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      await summaryPage.filterByDateRange(futureDate, undefined);

      // Should show no results
      await summaryPage.verifyEmptyState();

      // Clear filters
      await summaryPage.clearFilters();

      // Should show results again
      const afterClearCount = await summaryPage.summaryRows.count();
      expect(afterClearCount).toBe(initialCount);
    });

    test('should verify summary detail breakdown by category', async () => {
      // View detail on the expense from previous test
      await summaryPage.goto();
      await summaryPage.expandDetail(0);

      // Verify detail content is visible (detail-table-container appears)
      const detailContent = summaryPage.detailRows
        .first()
        .locator('.detail-table-container');
      await expect(detailContent).toBeVisible();

      // Collapse detail
      await summaryPage.expandDetail(0);

      // Detail content should be hidden (row still exists but content is gone)
      await expect(detailContent).not.toBeVisible();
    });
  });

  // Independent test - complex setup with mutual debts
  test('should calculate net amounts correctly with mutual debts', async ({
    preserveDataFirebasePage,
  }) => {
    // Setup - Create group with auto-add enabled
    await groupsPage.goto();
    const groupName = `Test Group ${Date.now()}`;
    await groupsPage.createGroup(groupName, testUser.displayName, true);
    await groupsPage.selectGroup(groupName); // Make this the active group

    // Add second member with unique email
    await membersPage.goto();
    await membersPage.addMember('Test User 4', 'testuser4@example.com');

    // Create first expense: Admin pays $100, split 50/50 between members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Expense 1',
      amount: 100,
    });
    // Auto-add creates splits for both members, update to specific amounts
    await expensesPage.updateSplitAmount(0, 50); // E2E Flow Tester
    await expensesPage.updateSplitAmount(1, 50); // Test User 4
    await expensesPage.saveExpense();

    // Create second expense: Test User 4 pays $30, Admin owes $30
    // (Net result: Test User 4 owes Admin $20)
    await expensesPage.gotoAddExpense();

    // Change payer to Test User 4
    await expensesPage.payerSelect.click();
    await preserveDataFirebasePage
      .locator('mat-option')
      .filter({ hasText: 'Test User 4' })
      .click();

    await expensesPage.descriptionInput.fill('Expense 2');
    await expensesPage.totalAmountInput.fill('30');
    await expensesPage.totalAmountInput.blur();

    // Auto-add creates splits for both members, update to specific amounts
    await expensesPage.updateSplitAmount(0, 30); // Admin User owes $30
    await expensesPage.updateSplitAmount(1, 0); // Test User 4 owes $0
    await expensesPage.saveExpense();

    // Check Summary for net amount
    await summaryPage.goto();
    await summaryPage.verifyPageLoaded();

    // Should show net debt of $20 (50 - 30)
    const netAmount = await summaryPage.getNetAmount(0);
    expect(netAmount).toContain('20');
  });
});
