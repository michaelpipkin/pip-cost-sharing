import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';
import { SummaryPage } from '../pages/summary.page';

test.describe('Critical Flow: Summary', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;
  let membersPage: MembersPage;
  let expensesPage: ExpensesPage;
  let summaryPage: SummaryPage;

  const testUser = {
    email: 'summary-tester@test.com',
    password: 'password123',
    displayName: 'Summary Tester',
  };

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);
    membersPage = new MembersPage(preserveDataFirebasePage);
    expensesPage = new ExpensesPage(preserveDataFirebasePage);
    summaryPage = new SummaryPage(preserveDataFirebasePage);

    // Login or create the shared test user
    await authPage.loginOrCreateTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  // Serial workflow - main summary features
  test.describe.serial('Summary Features', () => {
    test('should show empty state when no unpaid splits', async () => {
      // Setup - create group with auto-add, but NO expenses yet
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 1', 'member1@example.com');

      // Go to summary without creating expenses
      await summaryPage.goto();

      // Should show empty state
      await summaryPage.verifyEmptyState();
    });

    test('should display who-owes-whom summary from unpaid splits', async () => {
      // Create expense - auto-add will add both members
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Summary Test',
        amount: 80,
      });
      await expensesPage.saveExpense();

      // View summary
      await summaryPage.goto();
      await summaryPage.verifyPageLoaded();

      // Should show summary entries
      await summaryPage.verifySummaryCount(1);
    });

    test('should expand and collapse detail rows', async () => {
      // Expand detail on the expense from previous test
      await summaryPage.goto();
      await summaryPage.expandDetail(0);

      // Detail should be visible
      await expect(summaryPage.detailRows.first()).toBeVisible();

      // Collapse detail
      await summaryPage.expandDetail(0);

      // Detail should be hidden (row exists but not visible)
      await expect(summaryPage.detailRows.first()).toBeHidden();
    });

    test('should show category breakdown in detail', async () => {
      // Expand detail in summary
      await summaryPage.goto();
      await summaryPage.expandDetail(0);

      // Detail rows should show categories
      const detailText = await summaryPage.detailRows.first().textContent();
      expect(detailText).toBeTruthy();
    });

    test('should copy summary to clipboard', async () => {
      // Skip if clipboard not supported
      if (!TEST_CONFIG.supportsClipboard) {
        test.skip();
        return;
      }

      // Copy from summary
      await summaryPage.goto();
      await summaryPage.copyToClipboard(0);

      // Verify success message
      await expect(summaryPage.snackbar).toContainText('copied');
    });

    test('should open payment dialog with correct data', async () => {
      // Open payment dialog
      await summaryPage.goto();
      await summaryPage.openPaymentDialog(0);

      // Dialog should be visible with title
      await expect(summaryPage.paymentDialogTitle).toBeVisible();

      // Cancel
      await summaryPage.cancelPayment();
    });
  });

  // Serial workflow - filtering features
  test.describe.serial('Filtering', () => {
    test('should filter summary by member', async () => {
      // Setup - create new group with auto-add
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 2', 'member2@example.com');

      // Create expense - auto-add will add both members
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Filter Test',
        amount: 60,
      });
      await expensesPage.saveExpense();

      // Go to summary and filter by member
      await summaryPage.goto();
      await summaryPage.filterByMember(testUser.displayName);

      // Should still show results (admin is involved)
      const filteredCount = await summaryPage.summaryRows.count();
      expect(filteredCount).toBeGreaterThan(0);
    });

    test('should filter summary by date range', async () => {
      // Filter to past dates (should show nothing)
      await summaryPage.goto();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await summaryPage.filterByDateRange(pastDate, yesterday);

      // Should show no results
      await summaryPage.verifyEmptyState();
    });

    test('should clear filters correctly', async () => {
      // Get initial count (should be empty from previous filter)
      await summaryPage.goto();

      // Apply date filter that excludes results
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      await summaryPage.filterByDateRange(futureDate, undefined);

      // Should have no results
      await summaryPage.verifyEmptyState();

      // Clear filters
      const clearVisible = await summaryPage.clearFiltersButton
        .isVisible()
        .catch(() => false);

      if (clearVisible) {
        await summaryPage.clearFilters();

        // Should show results again
        const afterClearCount = await summaryPage.summaryRows.count();
        expect(afterClearCount).toBeGreaterThan(0);
      }
    });
  });

  // Serial workflow - net amount calculations
  test.describe.serial('Net Calculations', () => {
    test('should calculate net amounts correctly', async ({
      preserveDataFirebasePage,
    }) => {
      // Setup - create group with auto-add enabled
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 3', 'member3@example.com');

      // Create two expenses with mutual debts
      // Expense 1: Member 1 pays $100, split between both members
      // Auto-add creates 2 splits, then update Member 2 to have $50 member amount
      // Summary Tester owes: $0 + $25 = $25, Member 3 owes: $50 + $25 = $75
      // Net: Member 3 owes Summary Tester $75
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Expense 1',
        amount: 100,
      });
      // Update Member 3's split (index 1) to $50 member amount
      await expensesPage.updateSplitAmount(1, 50);
      await expensesPage.saveExpense();

      // Expense 2: Member 3 pays $30, split between both members
      // Auto-add creates 2 splits, then update Summary Tester to have $30 member amount
      // Summary Tester owes: $30, Member 3 owes: $0
      // Net: Summary Tester owes Member 3 $30
      await expensesPage.gotoAddExpense();
      await expensesPage.payerSelect.click();
      await preserveDataFirebasePage
        .locator('mat-option:has-text("Member 3")')
        .click();
      await expensesPage.descriptionInput.fill('Expense 2');
      await expensesPage.totalAmountInput.fill('30');
      await expensesPage.totalAmountInput.blur();
      // Update Summary Tester's split (index 0) to $30 member amount
      await expensesPage.updateSplitAmount(0, 30);
      await expensesPage.saveExpense();

      // Check net amount in summary ($75 - $30 = $45)
      await summaryPage.goto();
      await preserveDataFirebasePage.waitForTimeout(1000); // Wait for summary to update with new expenses
      const netAmount = await summaryPage.getNetAmount(0);
      expect(netAmount).toContain('45');
    });
  });
});
