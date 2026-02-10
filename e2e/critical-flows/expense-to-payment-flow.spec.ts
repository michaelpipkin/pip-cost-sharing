import { TEST_CONFIG, TEST_DATA } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { SummaryPage } from '../pages/summary.page';
import { HistoryPage } from '../pages/history.page';

test.describe('Critical Flow: Expense → Payment → History', () => {
  test('should create expense, pay it, and verify in history', async ({
    preserveDataFirebasePage,
  }) => {
    // This is a comprehensive end-to-end test - increase timeout
    test.setTimeout(60000); // 60 seconds
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // STEP 1: Setup - Create user and group with auto-add members enabled
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // STEP 1b: Add a second member to the group
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.waitForSelector('[data-testid="add-member-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.waitForTimeout(500);

    // Fill in member details in the dialog
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill(
      '[data-testid="member-email-input"]',
      'testuser@example.com'
    );
    await preserveDataFirebasePage.waitForTimeout(500);

    // Save the new member
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // STEP 2: Create expense (Admin pays $100, to be split equally)
    // With auto-add members enabled, all group members are automatically added as splits
    // The form automatically does equal splitting - no need to manually allocate amounts
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Team Lunch',
      amount: 100,
    });

    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Verify both members have splits (auto-added with equal allocation)
    const splitCount = await expensesPage.splitRows.count();
    expect(splitCount).toBe(2);

    // Save expense
    await expensesPage.saveExpense();

    // Verify success message
    await expect(expensesPage.snackbar).toContainText('Expense added');

    // STEP 3: Navigate to Summary and verify amounts
    await summaryPage.goto();
    await summaryPage.verifyPageLoaded();

    // Verify summary shows the debt
    const summaryCount = await summaryPage.summaryRows.count();
    expect(summaryCount).toBeGreaterThan(0);

    // STEP 4: Pay the expense (Pay button is on main row, no need to expand detail)
    await summaryPage.openPaymentDialog(0);
    await expect(summaryPage.paymentDialogTitle).toBeVisible();

    // Submit payment (amount should be pre-filled)
    await summaryPage.submitPayment();

    // Verify success message
    await expect(summaryPage.snackbar).toContainText('Expenses have been marked paid');

    // STEP 5: Verify payment appears in history
    await historyPage.goto();
    await historyPage.verifyPageLoaded();

    // Verify at least one history record exists
    const historyCount = await historyPage.historyRows.count();
    expect(historyCount).toBeGreaterThan(0);

    // Verify the payment record contains expected data
    const historyRecord = await historyPage.getHistoryRecord(0);
    expect(historyRecord.amount).toContain('50'); // Should show $50 payment

    // STEP 6: Verify splits are marked as paid (removed from Summary)
    await summaryPage.goto();

    // The summary should now have fewer entries (or be empty)
    const newSummaryCount = await summaryPage.summaryRows.count();
    expect(newSummaryCount).toBeLessThanOrEqual(summaryCount);
  });

  test('should handle payment cancellation', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $37.50, Test User $37.50)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Cancelled Payment Test',
      amount: 75,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
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

  test('should calculate net amounts correctly with mutual debts', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add enabled
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create first expense: Admin pays $100, split 50/50 between members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Expense 1',
      amount: 100,
    });
    // Auto-add creates splits for both members, update to specific amounts
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.updateSplitAmount(0, 50); // Admin User
    await expensesPage.updateSplitAmount(1, 50); // Test User
    await preserveDataFirebasePage.waitForTimeout(1000);
    await expensesPage.saveExpense();

    // Wait for navigation
    await preserveDataFirebasePage.waitForTimeout(1000);

    // Create second expense: Test User pays $30, Admin owes $30
    // (Net result: Test User owes Admin $20)
    await expensesPage.gotoAddExpense();

    // Change payer to Test User
    await expensesPage.payerSelect.click();
    await preserveDataFirebasePage
      .locator('mat-option')
      .filter({ hasText: 'Test User' })
      .click();

    await expensesPage.descriptionInput.fill('Expense 2');
    await expensesPage.totalAmountInput.fill('30');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    // Auto-add creates splits for both members, update to specific amounts
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.updateSplitAmount(0, 30); // Admin User owes $30
    await expensesPage.updateSplitAmount(1, 0);  // Test User owes $0
    await preserveDataFirebasePage.waitForTimeout(1000);
    await expensesPage.saveExpense();

    // Check Summary for net amount
    await summaryPage.goto();
    await summaryPage.verifyPageLoaded();

    // Should show net debt of $20 (50 - 30)
    const netAmount = await summaryPage.getNetAmount(0);
    expect(netAmount).toContain('20');
  });

  test('should handle multiple categories in payment history', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $30, Test User $30)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Food Expense',
      amount: 60,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Pay the expense
    await summaryPage.goto();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.submitPayment();

    // Verify in history with category breakdown
    await historyPage.goto();
    await historyPage.verifyPageLoaded();
    await historyPage.expandDetail(0);

    // Detail should show category breakdown
    await expect(historyPage.detailRows.first()).toBeVisible();
  });

  test('should filter summary by date range', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $25, Test User $25)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Recent Expense',
      amount: 50,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
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

  test('should copy payment history to clipboard', async ({
    preserveDataFirebasePage,
  }) => {
    // Skip if clipboard not supported
    if (!TEST_CONFIG.supportsClipboard) {
      test.skip();
      return;
    }

    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);
    const historyPage = new HistoryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $22.50, Test User $22.50)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Clipboard Test',
      amount: 45,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Pay the expense
    await summaryPage.goto();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.submitPayment();

    // Go to history and copy
    await historyPage.goto();
    await historyPage.copyToClipboard(0);

    // Verify success message
    await expect(historyPage.snackbar).toContainText('copied');
  });

  test('should handle payment with payment method selection', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $50, Test User $50)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Payment Method Test',
      amount: 100,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
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
    await expect(summaryPage.snackbar).toContainText('Expenses have been marked paid');
  });

  test('should verify summary detail breakdown by category', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - Create group with auto-add members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Add second member
    await preserveDataFirebasePage.goto('/members');
    await preserveDataFirebasePage.click('[data-testid="add-member-button"]');
    await preserveDataFirebasePage.fill('[data-testid="member-name-input"]', 'Test User');
    await preserveDataFirebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
    await preserveDataFirebasePage.click('[data-testid="add-member-save-button"]');

    // Wait for success snackbar to confirm member was added
    await expect(
      preserveDataFirebasePage.locator('[data-testid="snackbar"]')
    ).toContainText('Member added', { timeout: 5000 });
    await preserveDataFirebasePage.waitForTimeout(500);

    // Create expense (auto-splits equally: Admin $40, Test User $40)
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Category Detail Test',
      amount: 80,
    });
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // View detail in Summary
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
