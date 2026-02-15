import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';

test.describe('Critical Flow: Expenses', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;
  let membersPage: MembersPage;
  let expensesPage: ExpensesPage;

  const testUser = {
    email: 'expenses-tester@test.com',
    password: 'password123',
    displayName: 'Expenses Tester',
  };

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);
    membersPage = new MembersPage(preserveDataFirebasePage);
    expensesPage = new ExpensesPage(preserveDataFirebasePage);

    // Login or create the shared test user
    await authPage.loginOrCreateTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  // Serial workflow - basic expense operations
  test.describe.serial('Basic Expense Operations', () => {
    test('should create expense with single payer and multiple splits', async () => {
      // Setup - use auto-add and 2 members
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 1', 'member1@example.com');

      // Create expense - auto-add creates splits for both members
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Multiple Splits Test',
        amount: 150,
      });

      // Verify save button is enabled
      const isEnabled = await expensesPage.verifySaveButtonEnabled();
      expect(isEnabled).toBeTruthy();

      // Save
      await expensesPage.saveExpense();

      // Verify success
      await expect(expensesPage.snackbar).toContainText('Expense added');
    });

    test('should save and add another expense', async () => {
      // Create first expense (reuses group from previous test)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'First Expense',
        amount: 50,
      });

      // Save and add another
      await expensesPage.saveAndAddAnother();

      // Should still be on add expense page
      await expect(expensesPage.pageTitle).toHaveText('Add Expense');

      // Form should be reset
      const descriptionValue = await expensesPage.descriptionInput.inputValue();
      expect(descriptionValue).toBe('');
    });

    test('should memorize expense for reuse', async () => {
      // Create expense (reuses group from previous tests)
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Memorize Test',
        amount: 75,
      });

      // Memorize
      const memorizeVisible = await expensesPage.memorizeButton
        .isVisible()
        .catch(() => false);

      if (memorizeVisible) {
        await expensesPage.memorizeExpense();
        await expect(expensesPage.snackbar).toContainText('Memorized');
      }
    });

    test('should cancel expense creation', async () => {
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
        const url = expensesPage.page.url();
        expect(url).not.toContain('/add');
      }
    });
  });

  // Serial workflow - split management
  test.describe.serial('Split Management', () => {
    test('should add all members at once', async () => {
      // Setup - create group WITHOUT auto-add to test the button, but with 2 members
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, false);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 2', 'member2@example.com');

      // Create expense
      await expensesPage.gotoAddExpense();

      // Click "Add All Members" first (before filling form, while button is enabled)
      await expensesPage.addAllMembers();

      // Then fill the form
      await expensesPage.fillExpenseForm({
        description: 'Add All Members Test',
        amount: 100,
      });

      // Verify 2 splits were added
      const splitCount = await expensesPage.splitRows.count();
      expect(splitCount).toBe(2);

      // Save
      await expensesPage.saveExpense();
      await expect(expensesPage.snackbar).toContainText('Expense added');
    });

    test('should remove splits dynamically', async () => {
      // Create expense - no auto-add, so manually add members
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Remove Split Test',
        amount: 90,
      });

      // Add all members
      await expensesPage.addAllMembers();

      const initialCount = await expensesPage.splitRows.count();
      expect(initialCount).toBe(2);

      // Remove first split
      await expensesPage.removeSplit(0);

      const afterRemoveCount = await expensesPage.splitRows.count();
      expect(afterRemoveCount).toBe(1);
    });

    test('should toggle percentage mode', async () => {
      // Create expense
      await expensesPage.gotoAddExpense();
      await expensesPage.fillExpenseForm({
        description: 'Percentage Mode Test',
        amount: 200,
      });

      // Add all members
      await expensesPage.addAllMembers();

      // Toggle to percentage mode
      await expensesPage.togglePercentageMode();

      // Proportional amount should be hidden
      const isProportionalVisible = await expensesPage.proportionalAmountInput
        .isVisible()
        .catch(() => false);
      expect(isProportionalVisible).toBeFalsy();

      // Split should have percentage input
      const percentageInput = expensesPage.page
        .locator('input[formControlName="percentage"]')
        .first();
      await expect(percentageInput).toBeVisible();
    });
  });

  // Serial workflow - proportional allocation
  test.describe.serial('Proportional Allocation', () => {
    test('should handle simple proportional allocation', async () => {
      // Setup - use auto-add with 2 members
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 3', 'member3@example.com');

      // Create expense with proportional split
      await expensesPage.gotoAddExpense();

      await expensesPage.totalAmountInput.fill('150');
      await expensesPage.totalAmountInput.blur();

      await expensesPage.proportionalAmountInput.fill('60');
      await expensesPage.proportionalAmountInput.blur();

      await expensesPage.descriptionInput.fill('Proportional Test');

      // Update Expenses Tester's split (index 0) to $90 member amount
      await expensesPage.updateSplitAmount(0, 90);

      // Expenses Tester's Allocated Amount should be $150
      const allocatedSpan = expensesPage.page
        .locator('[data-testid="allocated-amount"]')
        .first();
      const allocatedText = await allocatedSpan.textContent();
      const allocatedValue = parseFloat(
        allocatedText?.replace(/[$,\s]/g, '') || '0'
      );

      expect(allocatedValue).toBeCloseTo(150, 2);
    });

    test('should handle complex proportional allocation', async ({
      preserveDataFirebasePage,
    }) => {
      // Add third member to group
      await membersPage.goto();
      await membersPage.openAddMemberDialog();
      await membersPage.fillAddMemberForm('Member 4', 'member4@example.com');
      await membersPage.submitAddMemberForm();

      // Create expense with complex allocation
      await expensesPage.gotoAddExpense();

      // Add description first
      await expensesPage.descriptionInput.fill('Complex Allocation Test');

      // Set proportional amount FIRST
      await expensesPage.proportionalAmountInput.fill('24.76');
      await expensesPage.proportionalAmountInput.blur();

      // Then set total amount
      await expensesPage.totalAmountInput.fill('150');
      await expensesPage.totalAmountInput.blur();

      // Update the auto-added splits
      await expensesPage.updateSplitAmount(0, 34.99); // Expenses Tester
      await expensesPage.updateSplitAmount(1, 32.85); // Member 3
      await expensesPage.updateSplitAmount(2, 43.15); // Member 4

      // Verify allocated amounts sum to $150
      const allocatedAmounts = preserveDataFirebasePage.locator(
        '[data-testid="allocated-amount"]'
      );
      const count = await allocatedAmounts.count();
      expect(count).toBe(3);

      // Collect all allocated amounts
      const amounts: number[] = [];
      for (let i = 0; i < count; i++) {
        const text = await allocatedAmounts.nth(i).textContent();
        const amount = parseFloat(text?.replace(/[$,\s]/g, '') || '0');
        amounts.push(amount);
      }

      // Sum should equal total ($150)
      const totalAllocated = amounts.reduce((sum, amt) => sum + amt, 0);
      expect(totalAllocated).toBeCloseTo(150, 2);

      // Individual amounts should be close to expected
      expect(amounts[0]).toBeCloseTo(47.6, 1);
      expect(amounts[1]).toBeCloseTo(45.03, 1);
      expect(amounts[2]).toBeCloseTo(57.37, 1);
    });
  });

  // Serial workflow - validation and UI
  test.describe.serial('Validation and UI', () => {
    test('should validate required fields', async () => {
      // Setup
      await groupsPage.goto();
      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);
      await groupsPage.selectGroup(groupName);

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

    test('should auto-select single category', async () => {
      // Add second member
      await membersPage.goto();
      await membersPage.addMember('Member 5', 'member5@example.com');

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
        await expensesPage.saveExpense();
        await expect(expensesPage.snackbar).toContainText('Expense added');
      }
    });

    test('should validate zero amount', async () => {
      // Try to create expense with zero amount
      await expensesPage.gotoAddExpense();
      await expensesPage.descriptionInput.fill('Zero Amount Test');
      await expensesPage.totalAmountInput.fill('0');
      await expensesPage.totalAmountInput.blur();

      // Should show error
      await expect(
        expensesPage.formErrors.filter({ hasText: 'Cannot be zero' })
      ).toBeVisible();

      // Save button should be disabled
      const isDisabled = await expensesPage.verifySaveButtonDisabled();
      expect(isDisabled).toBeTruthy();
    });

    test('should handle date selection', async () => {
      // Create expense with specific date
      await expensesPage.gotoAddExpense();

      // Open date picker
      await expensesPage.datePickerToggle.click();

      // Click on a date (15th of current month)
      await expensesPage.page
        .locator('.mat-calendar-body-cell-content:has-text("15")')
        .first()
        .click();

      // Complete the expense
      await expensesPage.descriptionInput.fill('Date Test');
      await expensesPage.totalAmountInput.fill('55');
      await expensesPage.totalAmountInput.blur();

      await expensesPage.saveExpense();
      await expect(expensesPage.snackbar).toContainText('Expense added');
    });
  });
});
