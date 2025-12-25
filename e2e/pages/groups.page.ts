import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class GroupsPage extends BasePage {
  // Main page elements using test IDs
  readonly groupSelect: Locator;
  readonly groupSelectOptions: Locator;
  readonly joinCodeSpan: Locator;
  readonly newGroupButton: Locator;
  readonly joinGroupButton: Locator;
  readonly manageGroupsButton: Locator;
  readonly helpButton: Locator;
  readonly loadingMessage: Locator;

  // Add Group Dialog elements
  readonly addGroupDialog: Locator;
  readonly addGroupTitle: Locator;
  readonly groupNameInput: Locator;
  readonly displayNameInput: Locator;
  readonly autoAddMembersToggle: Locator;
  readonly addGroupSaveButton: Locator;
  readonly addGroupCancelButton: Locator;

  // Join Group Dialog elements
  readonly joinGroupDialog: Locator;
  readonly joinGroupTitle: Locator;
  readonly groupCodeInput: Locator;
  readonly joinDisplayNameInput: Locator;
  readonly joinGroupSaveButton: Locator;
  readonly joinGroupCancelButton: Locator;

  // Generic elements
  readonly formErrors: Locator;
  readonly snackbar: Locator;

  // Manage Groups Dialog elements
  readonly manageGroupsDialog: Locator;
  readonly manageGroupsTitle: Locator;
  readonly manageGroupSelect: Locator;
  readonly manageGroupNameInput: Locator;
  readonly manageActiveToggle: Locator;
  readonly manageAutoAddToggle: Locator;
  readonly manageGroupsSaveButton: Locator;
  readonly manageGroupsCancelButton: Locator;

  constructor(page: Page) {
    super(page);

    // Main page elements using test IDs
    this.groupSelect = page.getByTestId('group-select');
    this.groupSelectOptions = page.locator('mat-option');
    this.joinCodeSpan = page.getByTestId('join-code');
    this.newGroupButton = page.getByTestId('new-group-button');
    this.joinGroupButton = page.getByTestId('join-group-button');
    this.manageGroupsButton = page.getByTestId('manage-groups-button');
    this.helpButton = page.getByTestId('help-button');
    this.loadingMessage = page.getByTestId('loading-message');

    // Add Group Dialog elements using test IDs
    this.addGroupDialog = page.locator('mat-dialog-container');
    this.addGroupTitle = page.getByTestId('add-group-title');
    this.groupNameInput = page.getByTestId('group-name-input');
    this.displayNameInput = page.getByTestId('display-name-input');
    this.autoAddMembersToggle = page.getByTestId('auto-add-members-toggle');
    this.addGroupSaveButton = page.getByTestId('add-group-save-button');
    this.addGroupCancelButton = page.getByTestId('add-group-cancel-button');

    // Join Group Dialog elements using test IDs
    this.joinGroupDialog = page.locator('mat-dialog-container');
    this.joinGroupTitle = page.getByTestId('join-group-title');
    this.groupCodeInput = page.getByTestId('group-code-input');
    this.joinDisplayNameInput = page.getByTestId('join-display-name-input');
    this.joinGroupSaveButton = page.getByTestId('join-group-save-button');
    this.joinGroupCancelButton = page.getByTestId('join-group-cancel-button');

    // Manage Groups Dialog elements using test IDs
    this.manageGroupsDialog = page.locator('mat-dialog-container');
    this.manageGroupsTitle = page.getByTestId('manage-groups-title');
    this.manageGroupSelect = page.getByTestId('manage-group-select');
    this.manageGroupNameInput = page.getByTestId('manage-group-name-input');
    this.manageActiveToggle = page.getByTestId('manage-active-toggle');
    this.manageAutoAddToggle = page.getByTestId('manage-auto-add-toggle');
    this.manageGroupsSaveButton = page.getByTestId('manage-groups-save-button');
    this.manageGroupsCancelButton = page.getByTestId(
      'manage-groups-cancel-button'
    );

    // Generic elements
    this.formErrors = page.locator('mat-error');
    this.snackbar = page.locator('simple-snack-bar');
  }

  async goto(): Promise<void> {
    await this.page.goto('/groups');
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForSelector('app-root', { timeout: 10000 });

    await Promise.race([
      this.loadingMessage
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {}),
      this.groupSelect
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {}),
    ]);

    const isLoadingVisible = await this.loadingMessage
      .isVisible()
      .catch(() => false);
    if (isLoadingVisible) {
      await this.loadingMessage.waitFor({ state: 'hidden', timeout: 10000 });
    }

    await this.groupSelect.waitFor({ state: 'visible', timeout: 5000 });
  }

  async selectGroup(groupName: string): Promise<void> {
    await this.groupSelect.click();
    await this.groupSelectOptions.first().waitFor({ state: 'visible' });
    const targetOption = this.groupSelectOptions.filter({ hasText: groupName });
    await expect(targetOption).toBeVisible();
    await targetOption.click();
    await this.joinCodeSpan.waitFor({ state: 'visible' });
  }

  async copyJoinCode(): Promise<void> {
    await this.joinCodeSpan.click();
    await this.page.waitForTimeout(1000);

    const snackbarVisible = await this.snackbar.isVisible();
    if (snackbarVisible) {
      const snackbarText = await this.snackbar.textContent();
      expect(snackbarText).toMatch(/copied|clipboard|blocked/i);
    }
  }

  async openAddGroupDialog(): Promise<void> {
    await this.newGroupButton.click();
    await expect(this.addGroupDialog).toBeVisible();
    await expect(this.addGroupTitle).toHaveText('Add New Group');
  }

  async fillAddGroupForm(
    groupName: string,
    displayName: string,
    autoAddMembers: boolean = false
  ): Promise<void> {
    // Use force: true to handle Material UI floating labels
    await this.groupNameInput.fill(groupName);
    await this.displayNameInput.fill(displayName);

    if (autoAddMembers) {
      await this.autoAddMembersToggle.click();
    }
  }

  async submitAddGroupForm(): Promise<void> {
    await this.addGroupSaveButton.click();
    await expect(this.addGroupDialog).toBeHidden();
  }

  async createGroup(
    groupName: string,
    displayName: string,
    autoAddMembers: boolean = false
  ): Promise<void> {
    await this.openAddGroupDialog();
    await this.fillAddGroupForm(groupName, displayName, autoAddMembers);
    await this.submitAddGroupForm();

    // Wait for any success messages and ensure dialog is completely closed
    await this.page.waitForTimeout(2000);

    // Verify the group was created and appears in the select
    await this.verifyGroupInList(groupName);
  }

  async verifyGroupInList(groupName: string): Promise<void> {
    // First wait for any dialogs to be hidden
    await this.page.waitForTimeout(1000);

    // Try to dismiss any overlay/backdrop that might be present
    const backdrop = this.page.locator('.cdk-overlay-backdrop');
    const isBackdropVisible = await backdrop.isVisible().catch(() => false);
    if (isBackdropVisible) {
      await backdrop.click({ force: true });
      await this.page.waitForTimeout(500);
    }

    // Now try to interact with the group select
    await this.groupSelect.click({ force: true });
    const groupOption = this.groupSelectOptions.filter({ hasText: groupName });
    await expect(groupOption).toBeVisible();

    // Close the dropdown by clicking the select again or pressing Escape
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.groupSelect).toBeVisible();
    await expect(this.newGroupButton).toBeVisible();
    await expect(this.joinGroupButton).toBeVisible();
    await expect(this.manageGroupsButton).toBeVisible();
    await expect(this.helpButton).toBeVisible();
  }

  async verifyPageState(): Promise<void> {
    await this.verifyPageLoaded();
  }

  async waitForGroupsToLoad(): Promise<void> {
    await this.waitForPageLoad();
  }

  async verifySaveButtonDisabled(
    dialogType: 'add' | 'join' | 'manage'
  ): Promise<void> {
    switch (dialogType) {
      case 'add':
        await expect(this.addGroupSaveButton).toBeDisabled();
        break;
      case 'join':
        await expect(this.joinGroupSaveButton).toBeDisabled();
        break;
      case 'manage':
        await expect(this.manageGroupsSaveButton).toBeDisabled();
        break;
    }
  }

  async cancelAddGroup(): Promise<void> {
    await this.addGroupCancelButton.click();
    await expect(this.addGroupDialog).toBeHidden();
  }

  async cancelJoinGroup(): Promise<void> {
    await this.joinGroupCancelButton.click();
    await expect(this.joinGroupDialog).toBeHidden();
  }

  async verifyValidationErrors(expectedErrors: string[]): Promise<void> {
    // Wait a moment for validation to trigger after blur
    await this.page.waitForTimeout(500);

    for (const error of expectedErrors) {
      // Look for mat-error elements specifically - use .first() to handle multiple matches
      const errorLocator = this.page
        .locator('mat-error')
        .filter({ hasText: error });
      await expect(errorLocator.first()).toBeVisible();

      // Optionally verify the expected count if we want to be more specific
      const count = await errorLocator.count();
      expect(count).toBeGreaterThan(0);
    }
  }

  async getJoinCode(): Promise<string> {
    const joinCodeText = await this.joinCodeSpan.textContent();
    return joinCodeText?.replace('Group join code: ', '') || '';
  }

  async openJoinGroupDialog(): Promise<void> {
    await this.joinGroupButton.click();
    await expect(this.joinGroupDialog).toBeVisible();
  }

  async openManageGroupsDialog(): Promise<void> {
    await this.manageGroupsButton.click();
    await expect(this.manageGroupsDialog).toBeVisible();
    await expect(this.manageGroupsTitle).toHaveText('Manage Groups');
  }

  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await this.page.waitForTimeout(1000);
  }

  async cancelManageGroups(): Promise<void> {
    await this.manageGroupsCancelButton.click();
    await expect(this.manageGroupsDialog).toBeHidden();
  }

  async editGroup(
    newGroupName?: string,
    active?: boolean,
    autoAdd?: boolean
  ): Promise<void> {
    await this.openManageGroupsDialog();

    // First group is pre-selected by default, so no need to select it
    // Wait for the form to populate with the selected group's data
    await this.page.waitForTimeout(1000);

    // Wait for the group name field to be populated (indicates form is loaded)
    await expect(this.manageGroupNameInput).not.toHaveValue('');

    // Additional wait to ensure toggle states are also loaded
    await this.page.waitForTimeout(500);

    // Make changes to trigger form dirty state
    if (newGroupName !== undefined) {
      await this.manageGroupNameInput.clear();
      await this.manageGroupNameInput.fill(newGroupName);
    }

    if (active !== undefined) {
      // Check current state and toggle if needed (Material UI slide toggle)
      const isChecked =
        (await this.manageActiveToggle.getAttribute('aria-checked')) === 'true';
      if (isChecked !== active) {
        await this.manageActiveToggle.click();
        // Wait a bit for the toggle to update
        await this.page.waitForTimeout(500);
      }
    }

    if (autoAdd !== undefined) {
      // Check current state and toggle if needed (Material UI slide toggle)
      const isChecked =
        (await this.manageAutoAddToggle.getAttribute('aria-checked')) ===
        'true';
      if (isChecked !== autoAdd) {
        await this.manageAutoAddToggle.click();
      }
    }

    // Wait for form state to update after changes
    await this.page.waitForTimeout(1000);

    // Only try to save if we made any changes
    if (
      newGroupName !== undefined ||
      active !== undefined ||
      autoAdd !== undefined
    ) {
      // Save changes
      await expect(this.manageGroupsSaveButton).toBeEnabled();
      await this.manageGroupsSaveButton.click();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // No changes were made, just close the dialog
      await this.cancelManageGroups();
    }
  }

  async toggleActiveStatus(): Promise<{ wasToggled: boolean }> {
    await this.openManageGroupsDialog();

    // First group is pre-selected by default, so no need to select it
    // Wait for the form to populate with the selected group's data
    await this.page.waitForTimeout(1000);

    // Wait for the group name field to be populated (indicates form is loaded)
    await expect(this.manageGroupNameInput).not.toHaveValue('');

    // Additional wait to ensure toggle states are also loaded
    await this.page.waitForTimeout(500);

    // Verify save button is initially disabled (no changes made yet)
    await expect(this.manageGroupsSaveButton).toBeDisabled();

    // Click the toggle to change it
    await this.manageActiveToggle.click();

    // Wait for form state to update after changes
    await this.page.waitForTimeout(1000);

    // If the toggle worked, the save button should now be enabled
    let wasToggled = false;
    try {
      await expect(this.manageGroupsSaveButton).toBeEnabled({ timeout: 2000 });
      wasToggled = true;
    } catch {
      wasToggled = false;
    }

    if (wasToggled) {
      // Save changes
      await this.manageGroupsSaveButton.click();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // Cancel if no change was detected
      await this.cancelManageGroups();
    }

    return { wasToggled };
  }

  async toggleAutoAddMembers(): Promise<{ wasToggled: boolean }> {
    await this.openManageGroupsDialog();

    // First group is pre-selected by default, so no need to select it
    // Wait for the form to populate with the selected group's data
    await this.page.waitForTimeout(1000);

    // Wait for the group name field to be populated (indicates form is loaded)
    await expect(this.manageGroupNameInput).not.toHaveValue('');

    // Additional wait to ensure toggle states are also loaded
    await this.page.waitForTimeout(500);

    // Verify save button is initially disabled (no changes made yet)
    await expect(this.manageGroupsSaveButton).toBeDisabled();

    // Click the auto-add toggle to change it
    await this.manageAutoAddToggle.click();

    // Wait for form state to update after changes
    await this.page.waitForTimeout(1000);

    // If the toggle worked, the save button should now be enabled
    let wasToggled = false;
    try {
      await expect(this.manageGroupsSaveButton).toBeEnabled({ timeout: 2000 });
      wasToggled = true;
    } catch {
      wasToggled = false;
    }

    if (wasToggled) {
      // Save changes
      await this.manageGroupsSaveButton.click();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // Cancel if no change was detected
      await this.cancelManageGroups();
    }

    return { wasToggled };
  }
}
