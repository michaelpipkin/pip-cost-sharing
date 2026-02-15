import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { GroupsPage } from '../pages/groups.page';

test.describe('Groups Component Functionality', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;

  // Unique user per test run (enables parallel execution)
  // Generate email in beforeAll to ensure uniqueness across repeat-each runs
  let testUser: { email: string; password: string; displayName: string };

  // Create the user once before all tests
  test.beforeAll(async ({ browser }) => {
    // Generate unique email for this test run
    testUser = {
      email: `groups-admin-${Date.now()}@test.com`,
      password: 'password123',
      displayName: 'Groups Admin Tester',
    };

    const context = await browser.newContext();
    const page = await context.newPage();
    const { createTestUser } = await import('../utils/firebase');
    await createTestUser(page, testUser.email, testUser.password);
    await context.close();
  });

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);

    // Login unique test user (already created in beforeAll)
    await authPage.loginOrCreateTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  // Independent tests - can run in parallel
  test.describe('Page Loading and Basic Display', () => {
    test('should load groups page and display main elements', async () => {
      await groupsPage.goto();
      await groupsPage.verifyPageState();
    });

    test('should show loading state initially', async () => {
      await groupsPage.goto();
      await groupsPage.waitForGroupsToLoad();
    });
  });

  // Form validation tests - independent, no data dependencies
  test.describe('Form Validation', () => {
    test('should validate required fields in create group form', async () => {
      await groupsPage.goto();
      await groupsPage.openAddGroupDialog();

      // Try to submit without filling required fields
      await groupsPage.verifySaveButtonDisabled('add');

      // Fill only group name, display name should still be required
      await groupsPage.groupNameInput.fill('Test Group');
      await groupsPage.verifySaveButtonDisabled('add');

      // Fill display name, now should be valid
      await groupsPage.displayNameInput.fill(testUser.displayName);
      await expect(groupsPage.addGroupSaveButton).toBeEnabled();

      await groupsPage.cancelAddGroup();
    });

    test('should show validation errors for empty required fields', async () => {
      await groupsPage.goto();
      await groupsPage.openAddGroupDialog();

      // Focus on the group name field and then blur to trigger validation
      await groupsPage.groupNameInput.focus();
      await groupsPage.groupNameInput.blur();

      // Focus on the display name field and then blur to trigger validation
      await groupsPage.displayNameInput.focus();
      await groupsPage.displayNameInput.blur();

      // Now validation errors should be visible - we expect 2 "*Required" errors
      // Note: mat-error is correct - Material form validation errors don't have MDC variant
      await expect(
        groupsPage.page.locator('mat-error').filter({ hasText: '*Required' })
      ).toHaveCount(2);

      // The save button should still be disabled
      await expect(groupsPage.addGroupSaveButton).toBeDisabled();

      await groupsPage.cancelAddGroup();
    });

    test('should cancel create group dialog', async () => {
      await groupsPage.goto();
      await groupsPage.openAddGroupDialog();

      // Fill some data
      await groupsPage.groupNameInput.fill('Test Group');
      await groupsPage.displayNameInput.fill(testUser.displayName);

      // Cancel dialog
      await groupsPage.cancelAddGroup();

      // The dialog should be closed and we should be back to the main page
      await expect(groupsPage.addGroupDialog).toBeHidden();
      await expect(groupsPage.groupSelect).toBeVisible();
    });

    test('should validate required fields in manage groups form', async () => {
      await groupsPage.goto();
      // Create a temporary group for this validation test
      const groupName = `Validation Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      await groupsPage.openManageGroupsDialog();

      // Clear the group name (should be required)
      await groupsPage.manageGroupNameInput.clear();
      await groupsPage.verifySaveButtonDisabled('manage');

      // Fill it back
      await groupsPage.manageGroupNameInput.fill('Valid Name');
      await expect(groupsPage.manageGroupsSaveButton).toBeEnabled();

      await groupsPage.cancelManageGroups();
    });

    test('should cancel manage groups dialog', async () => {
      await groupsPage.goto();
      // Create a temporary group for this validation test
      const groupName = `Cancel Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      await groupsPage.openManageGroupsDialog();

      // Make some changes
      await groupsPage.manageGroupNameInput.fill('Changed Name');

      // Cancel dialog
      await groupsPage.cancelManageGroups();

      // Changes should not be saved - no snackbar should appear
      await expect(groupsPage.snackbar).not.toBeVisible();
    });
  });

  // Main workflow - tests run in order and share data
  test.describe.serial('Group Workflow', () => {
    let firstGroupName: string;
    let secondGroupName: string;

    test('should create first group', async () => {
      await groupsPage.goto();
      firstGroupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(firstGroupName, testUser.displayName);
      // Verify the group appears in the dropdown
      await groupsPage.verifyGroupInList(firstGroupName);
    });

    test('should create second group with auto-add members enabled', async () => {
      await groupsPage.goto();
      secondGroupName = `Auto-Add Group ${Date.now()}`;
      await groupsPage.createGroup(secondGroupName, testUser.displayName, true);
      await groupsPage.verifyGroupInList(secondGroupName);
    });

    test('should switch between groups', async () => {
      await groupsPage.goto();
      // Switch between the groups created in previous tests
      await groupsPage.selectGroup(firstGroupName);
      await groupsPage.selectGroup(secondGroupName);
    });

    test('should open manage groups dialog when user has admin groups', async () => {
      await groupsPage.goto();
      // User is already admin from previous tests
      await groupsPage.openManageGroupsDialog();
    });

    test('should edit group name', async () => {
      await groupsPage.goto();

      // Select the first group and edit its name
      await groupsPage.selectGroup(firstGroupName);
      const newName = `${firstGroupName} Updated`;
      await groupsPage.editGroup(newName);

      // Verify the group appears with new name
      await groupsPage.verifyGroupInList(newName);
      firstGroupName = newName; // Update for subsequent tests
    });

    test('should toggle group active status', async () => {
      await groupsPage.goto();

      // Use the first group (already selected from previous test)
      await groupsPage.selectGroup(firstGroupName);

      // Toggle the active status and verify it changes
      const { wasToggled } = await groupsPage.toggleActiveStatus();

      // Verify that the toggle actually worked (form detected a change)
      expect(wasToggled).toBe(true);
    });

    test('should toggle auto-add members setting', async () => {
      await groupsPage.goto();

      // Use the second group (which was created with auto-add enabled)
      await groupsPage.selectGroup(secondGroupName);

      // Toggle the auto-add members setting and verify it changes
      const { wasToggled } = await groupsPage.toggleAutoAddMembers();

      // Verify that the toggle actually worked (form detected a change)
      expect(wasToggled).toBe(true);
    });

    test('should open help dialog', async () => {
      await groupsPage.goto();
      await groupsPage.openHelp();

      // Note: The actual help dialog testing would be done in a separate test file
      // This just verifies the help button is clickable
    });
  });

  // Complex integration scenarios - serial, building on workflow state
  test.describe.serial('Integration Scenarios', () => {
    test('should create multiple groups and manage them', async () => {
      await groupsPage.goto();
      // Create multiple groups
      const group1 = `Multi Group 1 ${Date.now()}`;
      const group2 = `Multi Group 2 ${Date.now()}`;

      await groupsPage.createGroup(group1, testUser.displayName);
      await groupsPage.createGroup(group2, testUser.displayName, true); // With auto-add

      // Verify both groups exist
      await groupsPage.verifyGroupInList(group1);
      await groupsPage.verifyGroupInList(group2);

      // Select both groups to verify switching works
      await groupsPage.selectGroup(group1);
      await groupsPage.selectGroup(group2);

      // Edit one of the groups
      await groupsPage.editGroup(`${group1} Updated`);
      await groupsPage.verifyGroupInList(`${group1} Updated`);
    });

    test('should handle workflow from group creation to selection', async () => {
      await groupsPage.goto();

      // Create another group for this workflow test
      const groupName = `Workflow Group ${Date.now()}`;

      // Create a group
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Select the group
      await groupsPage.selectGroup(groupName);

      // Edit the group
      const updatedName = `${groupName} Updated`;
      await groupsPage.editGroup(updatedName);

      // Verify final state
      await groupsPage.verifyGroupInList(updatedName);
    });
  });
});
