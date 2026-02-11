import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { SummaryPage } from '../pages/summary.page';
import { MembersPage } from '../pages/members.page';

test.describe('Critical Flow: Summary', () => {
  test('should display who-owes-whom summary from unpaid splits', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Summary Test',
      amount: 80,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // View summary
    await summaryPage.goto();
    await summaryPage.verifyPageLoaded();

    // Should show summary entries
    await summaryPage.verifySummaryCount(1);
  });

  test('should filter summary by member', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Filter Test',
      amount: 60,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Go to summary
    await summaryPage.goto();
    const initialCount = await summaryPage.summaryRows.count();

    // Filter by member
    await summaryPage.filterByMember('Member 1');

    // Should still show results (admin is involved)
    const filteredCount = await summaryPage.summaryRows.count();
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('should filter summary by date range', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Date Filter Test',
      amount: 70,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Go to summary
    await summaryPage.goto();

    // Filter to past dates (should show nothing)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await summaryPage.filterByDateRange(pastDate, yesterday);
    await preserveDataFirebasePage.waitForTimeout(500);

    // Should show no results
    await summaryPage.verifyEmptyState();
  });

  test('should calculate net amounts correctly', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 distinct members for mutual debts, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create two expenses with mutual debts
    // Expense 1: Member 1 pays $100, split between both members
    // Auto-add creates 2 splits, then update Member 2 to have $50 member amount
    // Member 1 owes: $0 + $25 = $25, Member 2 owes: $50 + $25 = $75
    // Net: Member 2 owes Member 1 $75
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Expense 1',
      amount: 100,
    });
    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);
    // Update Member 2's split (index 1) to $50 member amount
    await expensesPage.updateSplitAmount(1, 50);
    await preserveDataFirebasePage.waitForTimeout(1000);
    await expensesPage.saveExpense();
    await preserveDataFirebasePage.waitForTimeout(1000);

    // Expense 2: Member 2 pays $30, split between both members
    // Auto-add creates 2 splits, then update Member 1 to have $30 member amount
    // Member 1 owes: $30, Member 2 owes: $0
    // Net: Member 1 owes Member 2 $30
    await expensesPage.gotoAddExpense();
    await expensesPage.payerSelect.click();
    await preserveDataFirebasePage
      .locator('mat-option:has-text("Member 2")')
      .click();
    await expensesPage.descriptionInput.fill('Expense 2');
    await expensesPage.totalAmountInput.fill('30');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);
    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);
    // Update Member 1's split (index 0) to $30 member amount
    await expensesPage.updateSplitAmount(0, 30);
    await preserveDataFirebasePage.waitForTimeout(1000);
    await expensesPage.saveExpense();

    // Check net amount in summary ($50 - $30 = $20)
    await summaryPage.goto();
    const netAmount = await summaryPage.getNetAmount(0);
    expect(netAmount).toContain('45');
  });

  test('should expand and collapse detail rows', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Detail Test',
      amount: 90,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Go to summary and expand detail
    await summaryPage.goto();
    await summaryPage.expandDetail(0);

    // Detail should be visible
    await expect(summaryPage.detailRows.first()).toBeVisible();

    // Collapse detail
    await summaryPage.expandDetail(0);

    // Detail should be hidden (row exists but not visible)
    await expect(summaryPage.detailRows.first()).toBeHidden();
  });

  test('should show category breakdown in detail', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Category Detail Test',
      amount: 85,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Expand detail in summary
    await summaryPage.goto();
    await summaryPage.expandDetail(0);

    // Detail rows should show categories
    const detailText = await summaryPage.detailRows.first().textContent();
    expect(detailText).toBeTruthy();
  });

  test('should copy summary to clipboard', async ({
    preserveDataFirebasePage,
  }) => {
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

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Clipboard Test',
      amount: 65,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Copy from summary
    await summaryPage.goto();
    await summaryPage.copyToClipboard(0);

    // Verify success message
    await expect(summaryPage.snackbar).toContainText('copied');
  });

  test('should open payment dialog with correct data', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Payment Dialog Test',
      amount: 95,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Open payment dialog
    await summaryPage.goto();
    await summaryPage.openPaymentDialog(0);

    // Dialog should be visible with title
    await expect(summaryPage.paymentDialogTitle).toBeVisible();

    // Cancel
    await summaryPage.cancelPayment();
  });

  test('should clear filters correctly', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);

    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup - need 2 members to create debt, use auto-add
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Clear Filter Test',
      amount: 72,
    });
    // Wait for auto-added splits to appear and auto-allocate equally
    await preserveDataFirebasePage.waitForTimeout(1500);
    await expensesPage.saveExpense();

    // Go to summary and apply filters
    await summaryPage.goto();
    const initialCount = await summaryPage.summaryRows.count();

    // Apply date filter that excludes results
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await summaryPage.filterByDateRange(futureDate, undefined);
    await preserveDataFirebasePage.waitForTimeout(500);

    // Should have fewer/no results
    await summaryPage.verifyEmptyState();

    // Clear filters
    const clearVisible = await summaryPage.clearFiltersButton
      .isVisible()
      .catch(() => false);

    if (clearVisible) {
      await summaryPage.clearFilters();

      // Should show original results
      const afterClearCount = await summaryPage.summaryRows.count();
      expect(afterClearCount).toBe(initialCount);
    }
  });

  test('should show empty state when no unpaid splits', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Setup
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Admin User', true);

    // Go to summary without creating expenses
    await summaryPage.goto();

    // Should show empty state
    await summaryPage.verifyEmptyState();
  });
});
