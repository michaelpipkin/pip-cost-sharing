import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { SummaryPage } from '../pages/summary.page';
import { HistoryPage } from '../pages/history.page';

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
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add a second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense - auto-add will add both members as splits
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Team Lunch',
      amount: 100,
    });

    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);

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

  test('should show empty state when no history', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup without creating payments
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // View history
    await historyPage.goto();

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
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Delete Test',
      amount: 80,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Pay expense
    await summaryPage.goto();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.submitPayment();

    // Delete history
    await historyPage.goto();
    const initialCount = await historyPage.historyRows.count();

    await historyPage.deleteHistory(0, true);

    // Verify success
    await expect(historyPage.snackbar).toContainText('deleted');

    // Should have fewer records
    await preserveDataFirebasePage.waitForTimeout(1000);
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
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.waitForTimeout(500);
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Clipboard Test',
      amount: 65,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Pay expense
    await summaryPage.goto();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.submitPayment();

    // Copy history
    await historyPage.goto();
    await historyPage.copyToClipboard(0);

    // Verify success
    await expect(historyPage.snackbar).toContainText('copied');
  });
});
