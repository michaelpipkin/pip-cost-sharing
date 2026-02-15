import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { HistoryPage } from '../pages/history.page';
import { MembersPage } from '../pages/members.page';
import { SummaryPage } from '../pages/summary.page';

test.describe('Critical Flow: History', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;
  let expensesPage: ExpensesPage;
  let summaryPage: SummaryPage;
  let historyPage: HistoryPage;
  let membersPage: MembersPage;

  const testUser = {
    email: 'history-tester@test.com',
    password: 'password123',
    displayName: 'History Tester',
  };

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);
    expensesPage = new ExpensesPage(preserveDataFirebasePage);
    summaryPage = new SummaryPage(preserveDataFirebasePage);
    historyPage = new HistoryPage(preserveDataFirebasePage);
    membersPage = new MembersPage(preserveDataFirebasePage);

    // Login or create the shared test user
    await authPage.loginOrCreateTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  // Serial workflow - all tests build on same group/data
  test.describe.serial('Payment History Workflow', () => {
    test('should show empty state when no history', async () => {
      // Setup - create group without any payments
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);

      // Add a second member (needed for later tests)
      await membersPage.goto();
      await membersPage.addMember('Test User', 'testuser@example.com');

      // View history - should be empty initially
      await historyPage.goto();
      await historyPage.verifyEmptyState();
    });

    test('should display payment history after payment', async () => {
      // Create expense - auto-add will add both members as splits
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Team Lunch',
        amount: 100,
      });

      // Save expense
      await expensesPage.saveExpense();

      // Verify success message
      await expect(expensesPage.snackbar).toContainText('Expense added');

      // Navigate to Summary and pay the expense
      await summaryPage.goto();
      await summaryPage.verifyPageLoaded();

      // Verify summary shows the debt
      const summaryCount = await summaryPage.summaryRows.count();
      expect(summaryCount).toBeGreaterThan(0);

      // Pay the expense
      await summaryPage.openPaymentDialog(0);
      await expect(summaryPage.paymentDialogTitle).toBeVisible();
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
    });

    test('should copy history to clipboard', async () => {
      // Skip if clipboard not supported
      if (!TEST_CONFIG.supportsClipboard) {
        test.skip();
        return;
      }

      // Copy the payment created in the previous test
      await historyPage.goto();
      await historyPage.copyToClipboard(0);

      // Verify success
      await expect(historyPage.snackbar).toContainText('copied');
    });

    test('should delete payment record with confirmation', async () => {
      // Delete the payment from history
      await historyPage.goto();
      const initialCount = await historyPage.historyRows.count();

      await historyPage.deleteHistory(0, true);

      // Verify success
      await expect(historyPage.snackbar).toContainText('deleted');

      // Should have fewer records
      const afterDeleteCount = await historyPage.historyRows.count();
      expect(afterDeleteCount).toBeLessThan(initialCount);
    });
  });
});
