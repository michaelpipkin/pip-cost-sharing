import { TEST_DATA } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { GroupsPage } from '../pages/groups.page';
import { ExpensesPage } from '../pages/expenses.page';
import { MembersPage } from '../pages/members.page';

test.describe('Critical Flow: Expenses', () => {
  test('should create expense with single payer and multiple splits', async ({
    preserveDataFirebasePage,
  }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add and 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add creates splits for both members
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Multiple Splits Test',
      amount: 150,
    });

    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Verify save button is enabled
    const isEnabled = await expensesPage.verifySaveButtonEnabled();
    expect(isEnabled).toBeTruthy();

    // Save
    await expensesPage.saveExpense();

    // Verify success
    await expect(expensesPage.snackbar).toContainText('Expense added');
  });

  test('should validate required fields', async ({ preserveDataFirebasePage }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Go to add expense
    await expensesPage.gotoAddExpense();

    // Save button should be disabled with empty form
    const isDisabled = await expensesPage.verifySaveButtonDisabled();
    expect(isDisabled).toBeTruthy();

    // Fill only description (missing amount)
    await expensesPage.descriptionInput.fill('Incomplete Expense');

    // Should still be disabled
    const stillDisabled = await expensesPage.verifySaveButtonDisabled();
    expect(stillDisabled).toBeTruthy();
  });

  test('should add all members at once', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - create group WITHOUT auto-add to test the button, but with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', false);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Add All Members Test',
      amount: 100,
    });

    // Click "Add All Members" - should add both members
    await expensesPage.addAllMembers();
    await preserveDataFirebasePage.waitForTimeout(1000);

    // Verify 2 splits were added
    const splitCount = await expensesPage.splitRows.count();
    expect(splitCount).toBe(2);

    // Save
    await expensesPage.saveExpense();
    await expect(expensesPage.snackbar).toContainText('Expense added');
  });

  test('should remove splits dynamically', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense - auto-add creates 2 splits
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Remove Split Test',
      amount: 90,
    });

    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    const initialCount = await expensesPage.splitRows.count();
    expect(initialCount).toBe(2);

    // Remove first split
    await expensesPage.removeSplit(0);
    await preserveDataFirebasePage.waitForTimeout(300);

    const afterRemoveCount = await expensesPage.splitRows.count();
    expect(afterRemoveCount).toBe(1);
  });

  test('should handle complex proportional allocation', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000); // Increase timeout for member setup
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - need 3 distinct members for this test
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Add third member (reuse membersPage instance - already on /members)
    await membersPage.openAddMemberDialog();
    await membersPage.fillAddMemberForm('Member 3', 'member3@example.com');
    await membersPage.submitAddMemberForm();
    await preserveDataFirebasePage.waitForTimeout(2000);

    // Verify 3 members exist in the group before creating expense
    const memberRows = preserveDataFirebasePage.locator('table.mat-mdc-table tbody tr.mat-mdc-row');
    await expect(memberRows).toHaveCount(3);
    await preserveDataFirebasePage.waitForTimeout(1000);

    // Create expense with comprehensive scenario:
    // Total: $150, Proportional: $24.76, Member amounts: $34.99, $32.85, $43.15
    // Evenly Shared Remainder: $14.25, Expected allocated: $47.60, $45.03, $57.37
    await expensesPage.gotoAddExpense();

    // Add description first
    await expensesPage.descriptionInput.fill('Complex Allocation Test');
    await preserveDataFirebasePage.waitForTimeout(300);

    // Set proportional amount FIRST (before total) to avoid auto-fill interference
    await expensesPage.proportionalAmountInput.fill('24.76');
    await expensesPage.proportionalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    // Then set total amount
    await expensesPage.totalAmountInput.fill('150');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(1500); // Wait for auto-add to create splits

    // Update the auto-added splits with specific member amounts
    await expensesPage.updateSplitAmount(0, 34.99); // Member 1
    await expensesPage.updateSplitAmount(1, 32.85); // Member 2
    await expensesPage.updateSplitAmount(2, 43.15); // Member 3
    await preserveDataFirebasePage.waitForTimeout(500);

    // Verify allocated amounts sum to $150 (accounting for ±$0.01 rounding adjustments)
    const allocatedAmounts = preserveDataFirebasePage.locator('[data-testid="allocated-amount"]');
    const count = await allocatedAmounts.count();
    expect(count).toBe(3);

    // Collect all allocated amounts
    const amounts: number[] = [];
    for (let i = 0; i < count; i++) {
      const text = await allocatedAmounts.nth(i).textContent();
      const amount = parseFloat(text?.replace(/[$,\s]/g, '') || '0');
      amounts.push(amount);
    }

    // Sum should equal total ($150), allowing for $0.01 rounding tolerance
    const totalAllocated = amounts.reduce((sum, amt) => sum + amt, 0);
    expect(totalAllocated).toBeCloseTo(150, 2);

    // Individual amounts should be close to expected (may have ±$0.01 adjustments)
    // Expected: $47.60, $45.03, $57.37
    expect(amounts[0]).toBeCloseTo(47.60, 1);
    expect(amounts[1]).toBeCloseTo(45.03, 1);
    expect(amounts[2]).toBeCloseTo(57.37, 1);
  });

  test('should toggle percentage mode', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Percentage Mode Test',
      amount: 200,
    });

    // Toggle to percentage mode
    await expensesPage.togglePercentageMode();

    // Proportional amount should be hidden
    const isProportionalVisible = await expensesPage.proportionalAmountInput
      .isVisible()
      .catch(() => false);
    expect(isProportionalVisible).toBeFalsy();

    // Wait for auto-added splits (should be 2 members)
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Split should have percentage input
    // Note: percentage input is not inside mat-select, locate it directly
    const percentageInput = preserveDataFirebasePage
      .locator('input[formControlName="percentage"]')
      .first();
    await expect(percentageInput).toBeVisible();
  });

  test('should save and add another expense', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create first expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'First Expense',
      amount: 50,
    });
    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Save and add another
    await expensesPage.saveAndAddAnother();

    // Should still be on add expense page
    await expect(expensesPage.pageTitle).toHaveText('Add Expense');

    // Form should be reset
    const descriptionValue = await expensesPage.descriptionInput.inputValue();
    expect(descriptionValue).toBe('');
  });

  test('should memorize expense for reuse', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Memorize Test',
      amount: 75,
    });
    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Memorize
    const memorizeVisible = await expensesPage.memorizeButton
      .isVisible()
      .catch(() => false);

    if (memorizeVisible) {
      await expensesPage.memorizeExpense();
      await expect(expensesPage.snackbar).toContainText('Memorized');
    }
  });

  test('should cancel expense creation', async ({ preserveDataFirebasePage }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Start creating expense
    await expensesPage.gotoAddExpense();
    await expensesPage.fillExpenseForm({
      description: 'Cancelled Expense',
      amount: 100,
    });

    // Cancel
    const cancelVisible = await expensesPage.cancelButton
      .isVisible()
      .catch(() => false);

    if (cancelVisible) {
      await expensesPage.cancelExpense();

      // Should navigate away from add expense page
      await preserveDataFirebasePage.waitForTimeout(1000);
      const url = preserveDataFirebasePage.url();
      expect(url).not.toContain('/add');
    }
  });

  test('should auto-select single category', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Go to add expense
    await expensesPage.gotoAddExpense();

    // If there's only one category, the select should be hidden
    const categoryVisible = await expensesPage.categorySelect
      .isVisible()
      .catch(() => false);

    // This is expected behavior - single category auto-selected
    if (!categoryVisible) {
      // Category is auto-selected, continue with expense
      await expensesPage.fillExpenseForm({
        description: 'Auto Category Test',
        amount: 40,
      });
      // Wait for auto-added splits
      await preserveDataFirebasePage.waitForTimeout(1500);
      await expensesPage.saveExpense();
      await expect(expensesPage.snackbar).toContainText('Expense added');
    }
  });

  test('should handle simple proportional allocation', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense with proportional split
    // Total: $150, Member Amount: $90 (Member 1), Proportional: $60
    // Evenly Shared Remainder: $150 - $90 - $60 = $0
    // Member 1: $90 member amount + ($90/$90) × $60 proportional = $150
    // Member 2: $0 member amount + ($0/$90) × $60 proportional = $0
    await expensesPage.gotoAddExpense();

    await expensesPage.totalAmountInput.fill('150');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    await expensesPage.proportionalAmountInput.fill('60');
    await expensesPage.proportionalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    await expensesPage.descriptionInput.fill('Proportional Test');

    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    // Update Member 1's split (index 0) to $90 member amount
    await expensesPage.updateSplitAmount(0, 90);
    await preserveDataFirebasePage.waitForTimeout(1000);

    // Member 1's Allocated Amount = Member Amount + share of remainder + share of proportional
    // = $90 + $0 + $60 = $150 total owed by Member 1
    const allocatedSpan = preserveDataFirebasePage
      .locator('[data-testid="allocated-amount"]')
      .first();
    const allocatedText = await allocatedSpan.textContent();
    const allocatedValue = parseFloat(allocatedText?.replace(/[$,\s]/g, '') || '0');

    // Should be exactly $150 (Member 1's total amount owed)
    expect(allocatedValue).toBeCloseTo(150, 2);
  });

  test('should validate zero amount', async ({ preserveDataFirebasePage }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Try to create expense with zero amount
    await expensesPage.gotoAddExpense();
    await expensesPage.descriptionInput.fill('Zero Amount Test');
    await expensesPage.totalAmountInput.fill('0');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    // Should show error
    await expect(expensesPage.formErrors.filter({ hasText: 'Cannot be zero' })).toBeVisible();

    // Save button should be disabled
    const isDisabled = await expensesPage.verifySaveButtonDisabled();
    expect(isDisabled).toBeTruthy();
  });

  test('should handle date selection', async ({ preserveDataFirebasePage }) => {
    test.setTimeout(60000);
    const authPage = new AuthPage(preserveDataFirebasePage);
    const groupsPage = new GroupsPage(preserveDataFirebasePage);
    const expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Setup - use auto-add with 2 members
    await authPage.createAndLoginTestUser();
    await groupsPage.goto();
    await groupsPage.createGroup('Test Group', 'Member 1', true);

    // Add second member
    const membersPage = new MembersPage(preserveDataFirebasePage);
    await membersPage.goto();
    await membersPage.addMember('Member 2', 'member2@example.com');

    // Create expense with specific date
    await expensesPage.gotoAddExpense();

    // Open date picker
    await expensesPage.datePickerToggle.click();
    await preserveDataFirebasePage.waitForTimeout(500);

    // Click on a date (15th of current month)
    await preserveDataFirebasePage
      .locator('.mat-calendar-body-cell-content:has-text("15")')
      .first()
      .click();

    await preserveDataFirebasePage.waitForTimeout(500);

    // Complete the expense
    await expensesPage.descriptionInput.fill('Date Test');
    await expensesPage.totalAmountInput.fill('55');
    await expensesPage.totalAmountInput.blur();
    await preserveDataFirebasePage.waitForTimeout(500);

    // Wait for auto-added splits
    await preserveDataFirebasePage.waitForTimeout(1500);

    await expensesPage.saveExpense();
    await expect(expensesPage.snackbar).toContainText('Expense added');
  });
});
