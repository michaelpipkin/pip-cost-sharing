import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { SummaryPage } from '../pages/summary.page';
import { HistoryPage } from '../pages/history.page';
import { MembersPage } from '../pages/members.page';

test.describe('Critical Flow: History', () => {
  test('should display payment history after payment', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup - Create user and group with auto-add members enabled
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Admin User', true);
    await groupsPage.waitForLoadingComplete();

    // Add a second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Test User', 'testuser@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members as splits
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Team Lunch',
      amount: 100,
    });

    // Save expense
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Verify success message
    await expect(expensesPage.snackbar).toContainText('Expense added');

    // Navigate to Summary and pay the expense
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
    await summaryPage.verifyPageLoaded();

    // Verify summary shows the debt
    const summaryCount = await summaryPage.summaryRows.count();
    expect(summaryCount).toBeGreaterThan(0);

    // Pay the expense
    await summaryPage.openPaymentDialog(0);
    await summaryPage.waitForLoadingComplete();
    await expect(summaryPage.paymentDialogTitle).toBeVisible();
    await summaryPage.submitPayment();
    await summaryPage.waitForLoadingComplete();

    // Verify success message
    await expect(summaryPage.snackbar).toContainText(
      'Expenses have been marked paid'
    );

    // Verify payment appears in history
    await historyPage.goto();
    await historyPage.waitForLoadingComplete();
    await historyPage.verifyPageLoaded();

    // Verify at least one history record exists
    const historyCount = await historyPage.historyRows.count();
    expect(historyCount).toBeGreaterThan(0);

    // Verify the payment record contains expected data
    const historyRecord = await historyPage.getHistoryRecord(0);
    expect(historyRecord.amount).toContain('50'); // Should show $50 payment
  });

  test('should show empty state when no history', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup without creating payments
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Admin User', true);
    await groupsPage.waitForLoadingComplete();

    // View history
    await historyPage.goto();
    await historyPage.waitForLoadingComplete();

    // Should show empty state
    await historyPage.verifyEmptyState();
  });

  test('should delete payment record with confirmation', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup and create payment
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Admin User', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await groupsPage.waitForLoadingComplete();
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await groupsPage.waitForLoadingComplete();
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await groupsPage.waitForLoadingComplete();

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Delete Test',
      amount: 80,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Pay expense
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.waitForLoadingComplete();
    await summaryPage.submitPayment();
    await summaryPage.waitForLoadingComplete();

    // Delete history
    await historyPage.goto();
    await historyPage.waitForLoadingComplete();
    const initialCount = await historyPage.historyRows.count();

    await historyPage.deleteHistory(0, true);
    await historyPage.waitForLoadingComplete();

    // Verify success
    await expect(historyPage.snackbar).toContainText('deleted');

    // Should have fewer records
    const afterDeleteCount = await historyPage.historyRows.count();
    expect(afterDeleteCount).toBeLessThan(initialCount);
  });

  test('should copy history to clipboard', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);

    // Skip if clipboard not supported
    if (!TEST_CONFIG.supportsClipboard) {
      test.skip();
      return;
    }

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup and create payment
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Admin User', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await groupsPage.waitForLoadingComplete();
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await groupsPage.waitForLoadingComplete();
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await groupsPage.waitForLoadingComplete();

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Clipboard Test',
      amount: 65,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Pay expense
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.waitForLoadingComplete();
    await summaryPage.submitPayment();
    await summaryPage.waitForLoadingComplete();

    // Copy history
    await historyPage.goto();
    await historyPage.waitForLoadingComplete();
    await historyPage.copyToClipboard(0);

    // Verify success
    await expect(historyPage.snackbar).toContainText('copied');
  });
});
