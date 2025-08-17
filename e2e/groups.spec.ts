import { expect, test } from '@playwright/test';
import { TEST_CONFIG } from './constants';
import { AuthPage } from './pages/auth.page';
import { GroupsPage } from './pages/groups.page';

test.describe('Groups Component Functionality', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;
  const testUser = {
    email: 'testuser@example.com',
    password: 'password123',
    displayName: 'Test User',
  };

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    groupsPage = new GroupsPage(page);

    // Navigate to auth and create/login test user
    await authPage.goto();
    await authPage.createAndLoginTestUser(testUser.email, testUser.password);

    // Verify logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  test.describe('Page Loading and Basic Display', () => {
    test('should load groups page and display main elements', async () => {
      await groupsPage.goto();
      await groupsPage.verifyPageState();
    });

    test('should show loading state initially', async () => {
      await groupsPage.goto();
      // Note: Loading might be too fast to catch in tests, but structure is ready
      await groupsPage.waitForGroupsToLoad();
    });
  });

  test.describe('Create New Group', () => {
    test('should successfully create a new group', async () => {
      await groupsPage.goto();

      const groupName = `Test Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Verify the group appears in the dropdown
      await groupsPage.verifyGroupInList(groupName);
    });

    test('should create group with auto-add members enabled', async () => {
      await groupsPage.goto();

      const groupName = `Auto-Add Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName, true);

      await groupsPage.verifyGroupInList(groupName);
    });

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
  });

  test.describe('Group Selection and Join Code', () => {
    test('should display join code when group is selected', async () => {
      await groupsPage.goto();

      // Create a group first
      const groupName = `Join Code Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Select the group and verify join code is displayed
      await groupsPage.selectGroup(groupName);
      const joinCode = await groupsPage.getJoinCode();
      expect(joinCode).toBeTruthy();
      expect(joinCode.length).toBeGreaterThan(0);
    });

    test('should copy join code to clipboard', async () => {
      // Skip test if clipboard functionality is not supported (non-localhost HTTP)
      test.skip(
        !TEST_CONFIG.supportsClipboard,
        'Clipboard functionality blocked on non-localhost HTTP domains'
      );

      await groupsPage.goto();

      // Create a group first
      const groupName = `Copy Code Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Select the group and copy join code
      await groupsPage.selectGroup(groupName);
      await groupsPage.copyJoinCode();
    });

    test('should switch between groups', async () => {
      await groupsPage.goto();

      // Create two groups
      const group1Name = `Group One ${Date.now()}`;
      const group2Name = `Group Two ${Date.now()}`;

      await groupsPage.createGroup(group1Name, testUser.displayName);
      await groupsPage.createGroup(group2Name, testUser.displayName);

      // Switch between groups
      await groupsPage.selectGroup(group1Name);
      const joinCode1 = await groupsPage.getJoinCode();

      await groupsPage.selectGroup(group2Name);
      const joinCode2 = await groupsPage.getJoinCode();

      // Join codes should be different
      expect(joinCode1).not.toBe(joinCode2);
    });
  });

  test.describe('Join Existing Group', () => {
    test('should validate required fields in join group form', async () => {
      await groupsPage.goto();
      await groupsPage.openJoinGroupDialog();

      // Try to submit without filling required fields
      await groupsPage.verifySaveButtonDisabled('join');

      // Fill only group code, button should still be disabled
      await groupsPage.groupCodeInput.fill('TESTCODE123');
      await groupsPage.verifySaveButtonDisabled('join');

      // Fill display name, now should be valid
      await groupsPage.joinDisplayNameInput.fill(testUser.displayName);

      // Wait a moment for form validation to update
      await groupsPage.page.waitForTimeout(500);

      // Now the button should be enabled
      await expect(groupsPage.joinGroupSaveButton).toBeEnabled();

      await groupsPage.cancelJoinGroup();
    });

    test('should show validation errors for empty fields in join form', async () => {
      await groupsPage.goto();
      await groupsPage.openJoinGroupDialog();

      // Focus and blur from fields to trigger validation (same pattern as add group)
      await groupsPage.groupCodeInput.focus();
      await groupsPage.groupCodeInput.blur();

      await groupsPage.joinDisplayNameInput.focus();
      await groupsPage.joinDisplayNameInput.blur();

      // Now validation errors should be visible - we expect 2 "*Required" errors
      await expect(
        groupsPage.page.locator('mat-error').filter({ hasText: '*Required' })
      ).toHaveCount(2);

      // The save button should still be disabled
      await expect(groupsPage.joinGroupSaveButton).toBeDisabled();

      await groupsPage.cancelJoinGroup();
    });

    test('should cancel join group dialog', async () => {
      await groupsPage.goto();
      await groupsPage.openJoinGroupDialog();

      // Fill some data
      await groupsPage.groupCodeInput.fill('TESTCODE123');
      await groupsPage.joinDisplayNameInput.fill(testUser.displayName);

      // Cancel dialog
      await groupsPage.cancelJoinGroup();

      // The dialog should be closed and we should be back to the main page
      await expect(groupsPage.joinGroupDialog).toBeHidden();
      await expect(groupsPage.groupSelect).toBeVisible();
    });

    test('should handle invalid group join code', async () => {
      await groupsPage.goto();
      await groupsPage.openJoinGroupDialog();

      // Try to join with invalid code
      await groupsPage.groupCodeInput.fill('INVALIDCODE123');
      await groupsPage.joinDisplayNameInput.fill(testUser.displayName);
      await groupsPage.joinGroupSaveButton.click();

      // Should show error message (exact message depends on backend implementation)
      // The form should remain open or show an error
      // We don't expect the success message
      await expect(groupsPage.snackbar).not.toContainText('Group joined!');
    });
  });

  test.describe('Manage Groups', () => {
    test('should open manage groups dialog when user has admin groups', async () => {
      await groupsPage.goto();

      // Create a group first (user becomes admin)
      const groupName = `Admin Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Open manage groups dialog
      await groupsPage.openManageGroupsDialog();
    });

    test('should edit group name', async () => {
      await groupsPage.goto();

      // Create a group first
      const originalName = `Original Group ${Date.now()}`;
      await groupsPage.createGroup(originalName, testUser.displayName);

      // Edit the group name
      const newName = `Updated Group ${Date.now()}`;
      await groupsPage.editGroup(newName);

      // Verify the group appears with new name
      await groupsPage.verifyGroupInList(newName);
    });

    test('should toggle group active status', async () => {
      await groupsPage.goto();

      // Create a group first
      const groupName = `Toggle Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Toggle the active status and verify it changes
      const { wasToggled } = await groupsPage.toggleActiveStatus();

      // Verify that the toggle actually worked (form detected a change)
      expect(wasToggled).toBe(true);

      // Note: This tests the toggle functionality regardless of initial state
    });

    test('should toggle auto-add members setting', async () => {
      await groupsPage.goto();

      // Create a group first
      const groupName = `AutoAdd Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Toggle the auto-add members setting and verify it changes
      const { wasToggled } = await groupsPage.toggleAutoAddMembers();

      // Verify that the toggle actually worked (form detected a change)
      expect(wasToggled).toBe(true);

      // Note: This tests the auto-add toggle functionality regardless of initial state
    });

    test('should validate required fields in manage groups form', async () => {
      await groupsPage.goto();

      // Create a group first
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

      // Create a group first
      const groupName = `Cancel Group ${Date.now()}`;
      await groupsPage.createGroup(groupName, testUser.displayName);

      await groupsPage.openManageGroupsDialog();

      // Make some changes
      await groupsPage.manageGroupNameInput.fill('Changed Name');

      // Cancel dialog
      await groupsPage.cancelManageGroups();

      // Changes should not be saved
      await expect(groupsPage.snackbar).not.toContainText('Group updated');
    });
  });

  test.describe('Help Functionality', () => {
    test('should open help dialog', async () => {
      await groupsPage.goto();
      await groupsPage.openHelp();

      // Note: The actual help dialog testing would be done in a separate test file
      // This just verifies the help button is clickable
    });
  });

  test.describe('Integration Scenarios', () => {
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

      // Select and get join codes for both
      await groupsPage.selectGroup(group1);
      const joinCode1 = await groupsPage.getJoinCode();

      await groupsPage.selectGroup(group2);
      const joinCode2 = await groupsPage.getJoinCode();

      expect(joinCode1).not.toBe(joinCode2);

      // Edit one of the groups
      await groupsPage.editGroup(`${group1} Updated`);
      await groupsPage.verifyGroupInList(`${group1} Updated`);
    });

    test('should handle workflow from group creation to selection', async () => {
      await groupsPage.goto();

      // Start with no groups scenario
      const groupName = `Workflow Group ${Date.now()}`;

      // Create a group
      await groupsPage.createGroup(groupName, testUser.displayName);

      // Select the group
      await groupsPage.selectGroup(groupName);

      // Copy the join code (only if clipboard is supported)
      if (TEST_CONFIG.supportsClipboard) {
        await groupsPage.copyJoinCode();
      }

      // Edit the group
      const updatedName = `${groupName} Updated`;
      await groupsPage.editGroup(updatedName);

      // Verify final state
      await groupsPage.verifyGroupInList(updatedName);
    });
  });
});
