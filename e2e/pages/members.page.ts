import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class MembersPage extends BasePage {
  // Main page elements using test IDs
  readonly pageTitle: Locator;
  readonly memberSearchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly activeOnlyToggle: Locator;
  readonly addMemberButton: Locator;
  readonly membersTable: Locator;
  readonly helpButton: Locator;
  readonly tourButton: Locator;

  // Add Member Dialog elements
  readonly addMemberDialog: Locator;
  readonly addMemberTitle: Locator;
  readonly memberNameInput: Locator;
  readonly memberEmailInput: Locator;
  readonly addMemberSaveButton: Locator;
  readonly addMemberCancelButton: Locator;

  // Edit Member Dialog elements
  readonly editMemberDialog: Locator;
  readonly editMemberTitle: Locator;
  readonly editMemberNameInput: Locator;
  readonly editMemberEmailInput: Locator;
  readonly editMemberActiveToggle: Locator;
  readonly editMemberAdminToggle: Locator;
  readonly editMemberSaveButton: Locator;
  readonly leaveGroupButton: Locator;
  readonly removeMemberButton: Locator;
  readonly editMemberCancelButton: Locator;

  // Generic elements
  readonly formErrors: Locator;
  readonly snackbar: Locator;

  constructor(page: Page) {
    super(page);

    // Main page elements using test IDs
    this.pageTitle = page.getByTestId('members-page-title');
    this.memberSearchInput = page.getByTestId('member-search-input');
    this.clearSearchButton = page.getByTestId('clear-member-search-button');
    this.activeOnlyToggle = page.getByTestId('active-members-only-toggle');
    this.addMemberButton = page.getByTestId('add-member-button');
    this.membersTable = page.getByTestId('members-table');
    this.helpButton = page.getByTestId('members-help-button');
    this.tourButton = page.getByTestId('members-tour-button');

    // Add Member Dialog elements using test IDs
    this.addMemberDialog = page.locator('mat-dialog-container');
    this.addMemberTitle = page.getByTestId('add-member-title');
    this.memberNameInput = page.getByTestId('member-name-input');
    this.memberEmailInput = page.getByTestId('member-email-input');
    this.addMemberSaveButton = page.getByTestId('add-member-save-button');
    this.addMemberCancelButton = page.getByTestId('add-member-cancel-button');

    // Edit Member Dialog elements using test IDs
    this.editMemberDialog = page.locator('mat-dialog-container');
    this.editMemberTitle = page.getByTestId('edit-member-title');
    this.editMemberNameInput = page.getByTestId('edit-member-name-input');
    this.editMemberEmailInput = page.getByTestId('edit-member-email-input');
    this.editMemberActiveToggle = page.getByTestId('edit-member-active-toggle');
    this.editMemberAdminToggle = page.getByTestId('edit-member-admin-toggle');
    this.editMemberSaveButton = page.getByTestId('edit-member-save-button');
    this.leaveGroupButton = page.getByTestId('leave-group-button');
    this.removeMemberButton = page.getByTestId('remove-member-button');
    this.editMemberCancelButton = page.getByTestId('edit-member-cancel-button');

    // Generic elements
    this.formErrors = page.locator('mat-error');
    this.snackbar = page.locator('app-custom-snackbar');
  }

  async goto(): Promise<void> {
    await this.page.goto('/administration/members');
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForSelector('app-root', { timeout: 10000 });
    await this.pageTitle.waitFor({ state: 'visible', timeout: 10000 });
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.pageTitle).toHaveText('Members');
    await expect(this.memberSearchInput).toBeVisible();
    await expect(this.activeOnlyToggle).toBeVisible();
  }

  // Filter methods
  async searchMembers(searchText: string): Promise<void> {
    await this.memberSearchInput.fill(searchText);
    await this.page.waitForTimeout(500);
  }

  async clearSearch(): Promise<void> {
    await this.clearSearchButton.click();
    await this.page.waitForTimeout(300);
  }

  async toggleActiveOnly(): Promise<void> {
    await this.activeOnlyToggle.click();
    await this.page.waitForTimeout(500);
  }

  // Add Member Dialog methods
  async openAddMemberDialog(): Promise<void> {
    await this.addMemberButton.click();
    await expect(this.addMemberDialog).toBeVisible();
    await expect(this.addMemberTitle).toHaveText('Add Member');
  }

  async fillAddMemberForm(name: string, email: string): Promise<void> {
    await this.memberNameInput.fill(name);
    await this.memberEmailInput.fill(email);
  }

  async submitAddMemberForm(): Promise<void> {
    await this.addMemberSaveButton.click();
    await expect(this.addMemberDialog).toBeHidden();
  }

  async cancelAddMember(): Promise<void> {
    await this.addMemberCancelButton.click();
    await expect(this.addMemberDialog).toBeHidden();
  }

  async addMember(name: string, email: string): Promise<void> {
    await this.openAddMemberDialog();
    await this.fillAddMemberForm(name, email);
    await this.submitAddMemberForm();

    // Wait for any success messages and ensure dialog is completely closed
    await this.page.waitForTimeout(2000);

    // Verify the member was created and appears in the table
    await this.verifyMemberInTable(name);
  }

  // Edit Member Dialog methods
  async clickMemberRow(memberId: string): Promise<void> {
    const memberRow = this.page.getByTestId(`member-row-${memberId}`);
    await memberRow.click();
    await expect(this.editMemberDialog).toBeVisible();
    await expect(this.editMemberTitle).toHaveText('Edit Member');
  }

  async fillEditMemberForm(name?: string, email?: string): Promise<void> {
    if (name !== undefined) {
      await this.editMemberNameInput.clear();
      await this.editMemberNameInput.fill(name);
    }

    if (email !== undefined) {
      await this.editMemberEmailInput.clear();
      await this.editMemberEmailInput.fill(email);
    }

    // Wait for form to update
    await this.page.waitForTimeout(500);
  }

  async toggleMemberActive(): Promise<void> {
    await this.editMemberActiveToggle.click();
    await this.page.waitForTimeout(500);
  }

  async toggleMemberAdmin(): Promise<void> {
    await this.editMemberAdminToggle.click();
    await this.page.waitForTimeout(500);
  }

  async submitEditMemberForm(): Promise<void> {
    await this.editMemberSaveButton.click();
    await expect(this.editMemberDialog).toBeHidden();
  }

  async cancelEditMember(): Promise<void> {
    await this.editMemberCancelButton.click();
    await expect(this.editMemberDialog).toBeHidden();
  }

  async removeMember(): Promise<void> {
    await this.removeMemberButton.click();
    // Wait for any confirmation dialogs or processing
    await this.page.waitForTimeout(1000);
  }

  async leaveGroup(): Promise<void> {
    await this.leaveGroupButton.click();
    // Wait for any confirmation dialogs or processing
    await this.page.waitForTimeout(1000);
  }

  async editMember(
    memberId: string,
    options: {
      name?: string;
      email?: string;
      active?: boolean;
      groupAdmin?: boolean;
    }
  ): Promise<void> {
    await this.clickMemberRow(memberId);

    // Wait for form to populate
    await this.page.waitForTimeout(1000);

    // Make changes
    if (options.name !== undefined || options.email !== undefined) {
      await this.fillEditMemberForm(options.name, options.email);
    }

    if (options.active !== undefined) {
      const isChecked =
        (await this.editMemberActiveToggle.getAttribute('aria-checked')) ===
        'true';
      if (isChecked !== options.active) {
        await this.toggleMemberActive();
      }
    }

    if (options.groupAdmin !== undefined) {
      const isChecked =
        (await this.editMemberAdminToggle.getAttribute('aria-checked')) ===
        'true';
      if (isChecked !== options.groupAdmin) {
        await this.toggleMemberAdmin();
      }
    }

    // Wait for form state to update
    await this.page.waitForTimeout(1000);

    // Save changes
    await expect(this.editMemberSaveButton).toBeEnabled();
    await this.submitEditMemberForm();
  }

  // Verification methods
  async verifyMemberInTable(memberName: string): Promise<void> {
    // Wait for any dialogs to be hidden
    await this.page.waitForTimeout(1000);

    // Try to dismiss any overlay/backdrop that might be present
    const backdrop = this.page.locator('.cdk-overlay-backdrop');
    const isBackdropVisible = await backdrop.isVisible().catch(() => false);
    if (isBackdropVisible) {
      await backdrop.click({ force: true });
      await this.page.waitForTimeout(500);
    }

    // Verify member appears in the table
    const memberCell = this.membersTable
      .locator('td')
      .filter({ hasText: memberName });
    await expect(memberCell.first()).toBeVisible();
  }

  async verifyNoMembersMessage(): Promise<void> {
    const noMembersMessage = this.page.getByTestId('no-members-message');
    await expect(noMembersMessage).toBeVisible();
    await expect(noMembersMessage).toHaveText('No members found');
  }

  async verifySaveButtonDisabled(
    dialogType: 'add' | 'edit'
  ): Promise<void> {
    switch (dialogType) {
      case 'add':
        await expect(this.addMemberSaveButton).toBeDisabled();
        break;
      case 'edit':
        await expect(this.editMemberSaveButton).toBeDisabled();
        break;
    }
  }

  async verifyValidationErrors(expectedErrors: string[]): Promise<void> {
    // Wait a moment for validation to trigger after blur
    await this.page.waitForTimeout(500);

    for (const error of expectedErrors) {
      // Look for mat-error elements specifically
      const errorLocator = this.page
        .locator('mat-error')
        .filter({ hasText: error });
      await expect(errorLocator.first()).toBeVisible();

      // Optionally verify the expected count if we want to be more specific
      const count = await errorLocator.count();
      expect(count).toBeGreaterThan(0);
    }
  }

  // Other methods
  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await this.page.waitForTimeout(1000);
  }

  async startTour(): Promise<void> {
    await this.tourButton.click();
    await this.page.waitForTimeout(1000);
  }
}
