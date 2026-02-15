import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class GroupsPage extends BasePage {
  // Main page elements using test IDs
  readonly groupSelect: Locator;
  readonly groupSelectOptions: Locator;
  readonly newGroupButton: Locator;
  readonly manageGroupsButton: Locator;
  readonly helpButton: Locator;

  // Add Group Dialog elements
  readonly addGroupDialog: Locator;
  readonly addGroupTitle: Locator;
  readonly groupNameInput: Locator;
  readonly displayNameInput: Locator;
  readonly autoAddMembersToggle: Locator;
  readonly addGroupSaveButton: Locator;
  readonly addGroupCancelButton: Locator;

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
    this.newGroupButton = page.getByTestId('new-group-button');
    this.manageGroupsButton = page.getByTestId('manage-groups-button');
    this.helpButton = page.getByTestId('groups-help-button');

    // Add Group Dialog elements using test IDs
    this.addGroupDialog = page.locator('mat-dialog-container');
    this.addGroupTitle = page.getByTestId('add-group-title');
    this.groupNameInput = page.getByTestId('group-name-input');
    this.displayNameInput = page.getByTestId('display-name-input');
    this.autoAddMembersToggle = page.getByTestId('auto-add-members-toggle');
    this.addGroupSaveButton = page.getByTestId('add-group-save-button');
    this.addGroupCancelButton = page.getByTestId('add-group-cancel-button');

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
    this.snackbar = page.locator('app-custom-snackbar');
  }

  async goto(): Promise<void> {
    await this.page.goto('/administration/groups');
    await this.waitForLoadingComplete();
  }

  async selectGroup(groupName: string): Promise<void> {
    await this.groupSelect.click();
    await this.page.waitForTimeout(500); // Wait for dropdown animation
    await this.groupSelectOptions.first().waitFor({ state: 'visible' });
    const targetOption = this.groupSelectOptions.filter({ hasText: groupName });
    await expect(targetOption).toBeVisible();
    await targetOption.click();
    // Wait for group to load after selection
    await this.waitForLoadingComplete();
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
    await this.groupNameInput.fill(groupName);
    await this.displayNameInput.fill(displayName);
    await this.page.waitForTimeout(500); // Wait for validation to process
    if (autoAddMembers) {
      await this.autoAddMembersToggle.click();
    }
    if ((await this.groupNameInput.inputValue()) === '') {
      await this.groupNameInput.fill(groupName);
    }
    if ((await this.displayNameInput.inputValue()) === '') {
      await this.displayNameInput.fill(displayName);
    }
  }

  async submitAddGroupForm(): Promise<void> {
    await this.addGroupSaveButton.click();
    await this.waitForLoadingComplete();
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
    await this.waitForLoadingComplete();

    // Verify the group was created and appears in the select
    await this.verifyGroupInList(groupName);
  }

  async verifyGroupInList(groupName: string): Promise<void> {
    await this.groupSelect.click({ force: true });
    await this.page.waitForTimeout(500); // Wait for dropdown animation
    const groupOption = this.groupSelectOptions.filter({ hasText: groupName });
    await expect(groupOption).toBeVisible();

    // Close the dropdown by clicking the select again
    await this.groupSelect.click({ force: true });
    await this.page.waitForTimeout(1000);
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.groupSelect).toBeVisible();
    await expect(this.newGroupButton).toBeVisible();
    // manageGroupsButton is only visible when the user has groups
    await expect(this.helpButton).toBeVisible();
  }

  async verifyPageState(): Promise<void> {
    await this.verifyPageLoaded();
  }

  async waitForGroupsToLoad(): Promise<void> {
    await this.waitForLoadingComplete();
  }

  async verifySaveButtonDisabled(dialogType: 'add' | 'manage'): Promise<void> {
    switch (dialogType) {
      case 'add':
        await expect(this.addGroupSaveButton).toBeDisabled();
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

  async openManageGroupsDialog(): Promise<void> {
    await this.manageGroupsButton.click();
    await expect(this.manageGroupsDialog).toBeVisible();
    await expect(this.manageGroupsTitle).toHaveText('Manage Groups');
    await this.waitForLoadingComplete();
  }

  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await this.waitForLoadingComplete();
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

    await this.waitForLoadingComplete();
    // await this.page.waitForTimeout(500); // Ensure any initial loading is complete

    // Verify save button is initially disabled (no changes made yet)
    await expect(this.manageGroupsSaveButton).toBeDisabled();

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
    await this.page.waitForTimeout(500);

    // Only try to save if we made any changes
    if (
      newGroupName !== undefined ||
      active !== undefined ||
      autoAdd !== undefined
    ) {
      // Save changes
      await expect(this.manageGroupsSaveButton).toBeEnabled();
      await this.manageGroupsSaveButton.click();
      await this.waitForLoadingComplete();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // No changes were made, just close the dialog
      await this.cancelManageGroups();
    }
  }

  async toggleActiveStatus(): Promise<{ wasToggled: boolean }> {
    await this.openManageGroupsDialog();

    await this.waitForLoadingComplete();

    // Verify save button is initially disabled (no changes made yet)
    await expect(this.manageGroupsSaveButton).toBeDisabled();

    // Click the toggle to change it
    await this.manageActiveToggle.click();

    // Wait for form state to update after changes
    await this.page.waitForTimeout(500);

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
      await this.waitForLoadingComplete();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // Cancel if no change was detected
      await this.cancelManageGroups();
    }

    return { wasToggled };
  }

  async toggleAutoAddMembers(): Promise<{ wasToggled: boolean }> {
    await this.openManageGroupsDialog();

    await this.waitForLoadingComplete();
    // Verify save button is initially disabled (no changes made yet)
    await expect(this.manageGroupsSaveButton).toBeDisabled();

    // Click the auto-add toggle to change it
    await this.manageAutoAddToggle.click();

    // Wait for form state to update after changes
    await this.page.waitForTimeout(500);

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
      await this.waitForLoadingComplete();
      await expect(this.manageGroupsDialog).toBeHidden();
    } else {
      // Cancel if no change was detected
      await this.cancelManageGroups();
    }

    return { wasToggled };
  }
}
