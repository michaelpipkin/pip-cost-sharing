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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Summary Test',
      amount: 80,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // View summary
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Filter Test',
      amount: 60,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Go to summary
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();

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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Date Filter Test',
      amount: 70,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Go to summary
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();

    // Filter to past dates (should show nothing)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await summaryPage.filterByDateRange(pastDate, yesterday);

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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create two expenses with mutual debts
    // Expense 1: Member 1 pays $100, split between both members
    // Auto-add creates 2 splits, then update Member 2 to have $50 member amount
    // Member 1 owes: $0 + $25 = $25, Member 2 owes: $50 + $25 = $75
    // Net: Member 2 owes Member 1 $75
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Expense 1',
      amount: 100,
    });
    // Update Member 2's split (index 1) to $50 member amount
    await expensesPage.updateSplitAmount(1, 50);
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Expense 2: Member 2 pays $30, split between both members
    // Auto-add creates 2 splits, then update Member 1 to have $30 member amount
    // Member 1 owes: $30, Member 2 owes: $0
    // Net: Member 1 owes Member 2 $30
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.payerSelect.click();
    await preserveDataFirebasePage
      .locator('mat-option:has-text("Member 2")')
      .click();
    await expensesPage.descriptionInput.fill('Expense 2');
    await expensesPage.totalAmountInput.fill('30');
    await expensesPage.totalAmountInput.blur();
    // Update Member 1's split (index 0) to $30 member amount
    await expensesPage.updateSplitAmount(0, 30);
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Check net amount in summary ($50 - $30 = $20)
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Detail Test',
      amount: 90,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Go to summary and expand detail
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Category Detail Test',
      amount: 85,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Expand detail in summary
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Clipboard Test',
      amount: 65,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Copy from summary
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Payment Dialog Test',
      amount: 95,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Open payment dialog
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
    await summaryPage.openPaymentDialog(0);
    await summaryPage.waitForLoadingComplete();

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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Member 1', true);
    await groupsPage.waitForLoadingComplete();

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.waitForLoadingComplete();
    await membersPage.addMember('Member 2', 'member2@example.com');
    await membersPage.waitForLoadingComplete();

    // Create expense - auto-add will add both members
    await expensesPage.gotoAddExpense();
    await expensesPage.waitForLoadingComplete();
    await expensesPage.fillExpenseForm({
      description: 'Clear Filter Test',
      amount: 72,
    });
    await expensesPage.saveExpense();
    await expensesPage.waitForLoadingComplete();

    // Go to summary and apply filters
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();
    const initialCount = await summaryPage.summaryRows.count();

    // Apply date filter that excludes results
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await summaryPage.filterByDateRange(futureDate, undefined);

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
    await groupsPage.waitForLoadingComplete();
    await groupsPage.createGroup('Test Group', 'Admin User', true);
    await groupsPage.waitForLoadingComplete();

    // Go to summary without creating expenses
    await summaryPage.goto();
    await summaryPage.waitForLoadingComplete();

    // Should show empty state
    await summaryPage.verifyEmptyState();
  });
});
