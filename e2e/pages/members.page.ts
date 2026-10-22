import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class MembersPage extends BasePage {
  // Main page elements using test IDs
  readonly navMembersLink: Locator;
  readonly mainContainer: Locator;
  readonly pageTitle: Locator;
  readonly memberSearchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly activeOnlyToggle: Locator;
  readonly addMemberButton: Locator;
  readonly membersTable: Locator;
  readonly helpButton: Locator;
  readonly currentGroupName: Locator;
  /** The Invite column header: admins only, and only while a listed member can be invited. */
  readonly inviteColumnHeader: Locator;

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
  readonly editMemberEmailHint: Locator;
  readonly editMemberActiveToggle: Locator;
  readonly editMemberAdminToggle: Locator;
  readonly editMemberSaveButton: Locator;
  readonly leaveGroupButton: Locator;
  readonly removeMemberButton: Locator;
  readonly editMemberCancelButton: Locator;

  // Confirmation dialogs: Remove opens the shared delete dialog, Leave Group
  // the shared confirm dialog.
  readonly deleteDialogTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly confirmDialogTitle: Locator;
  readonly confirmButton: Locator;

  // Generic elements
  readonly formErrors: Locator;

  constructor(page: Page) {
    super(page);

    this.navMembersLink = page.getByTestId('nav-members');

    // Main page elements using test IDs
    this.mainContainer = page.getByTestId('members-main-container');
    this.pageTitle = page.getByTestId('members-page-title');
    this.memberSearchInput = page.getByTestId('member-search-input');
    this.clearSearchButton = page.getByTestId('clear-member-search-button');
    this.activeOnlyToggle = page.getByTestId('active-members-only-toggle');
    this.addMemberButton = page.getByTestId('add-member-button');
    this.membersTable = page.getByTestId('members-table');
    this.helpButton = page.getByTestId('members-help-button');
    this.currentGroupName = page.getByTestId('current-group-name');
    this.inviteColumnHeader = page.getByTestId('invite-column-header');

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
    this.editMemberEmailHint = page.getByTestId('edit-member-email-hint');
    this.editMemberActiveToggle = page.getByTestId('edit-member-active-toggle');
    this.editMemberAdminToggle = page.getByTestId('edit-member-admin-toggle');
    this.editMemberSaveButton = page.getByTestId('edit-member-save-button');
    this.leaveGroupButton = page.getByTestId('leave-group-button');
    this.removeMemberButton = page.getByTestId('remove-member-button');
    this.editMemberCancelButton = page.getByTestId('edit-member-cancel-button');

    this.deleteDialogTitle = page.getByTestId('delete-dialog-title');
    this.deleteConfirmButton = page.getByTestId('delete-confirm-button');
    this.confirmDialogTitle = page.getByTestId('dialog-title');
    this.confirmButton = page.getByTestId('confirm-button');

    // Generic elements
    this.formErrors = page.locator('mat-error');
  }

  /**
   * Opens Members from the nav bar (signed in, with a current group: the
   * link only shows then) and waits for real content: the main container
   * replaces the "Loading members..." placeholder once the member store has
   * loaded (the same condition that drives the page's loading overlay),
   * then the overlay is gone. Waiting on the overlay alone could return
   * before the page had even turned it on. In-app rather than a page.goto
   * for the same reason as GroupsPage.goto (a full load of a deep link can
   * be redirected to /expenses).
   */
  async goto(): Promise<void> {
    await this.navMembersLink.click();
    await expect(this.page).toHaveURL(/\/administration\/members$/);
    await expect(this.mainContainer).toBeVisible();
    await expect(this.pageTitle).toHaveText('Members');
    await this.waitForLoadingComplete();
  }

  /**
   * Reloads the app (so the page reads from Firestore, not the in-memory
   * stores), then opens Members in-app. Waits for the reload's initial
   * navigation to settle first so no redirect can override the click (see
   * GroupsPage.reload).
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForInitialNavigation();
    await this.waitForLoadingComplete();
    await this.goto();
  }

  /** A member's row; `memberId` is the member doc id (the seed key). */
  row(memberId: string): Locator {
    return this.page.getByTestId(`member-row-${memberId}`);
  }

  /** A member's invite (envelope) button; `memberId` is the member doc id. */
  inviteButton(memberId: string): Locator {
    return this.page.getByTestId(`invite-member-button-${memberId}`);
  }

  /**
   * Clicks a member's envelope and confirms the Send App Invitation dialog,
   * then waits for the dialog to close and the loading overlay to clear. The
   * outcome (snackbar, envelope gone) is the caller's to assert.
   */
  async sendInvite(memberId: string): Promise<void> {
    await this.inviteButton(memberId).click();
    await expect(this.confirmDialogTitle).toHaveText('Send App Invitation');
    await this.confirmButton.click();
    await expect(this.confirmDialogTitle).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async verifyPageLoaded(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.pageTitle).toHaveText('Members');
    await expect(this.memberSearchInput).toBeVisible();
    await expect(this.activeOnlyToggle).toBeVisible();
  }

  // Filter methods
  async searchMembers(searchText: string): Promise<void> {
    await this.fillAndCommit(this.memberSearchInput, searchText);
  }

  async clearSearch(): Promise<void> {
    await this.clearSearchButton.click();
    await expect(this.memberSearchInput).toHaveValue('');
  }

  async toggleActiveOnly(): Promise<void> {
    await this.flipToggle(this.activeOnlyToggle);
  }

  /** Clicks a mat-slide-toggle and waits for its switch to change state. */
  private async flipToggle(toggle: Locator): Promise<void> {
    const wasChecked = await this.switchOf(toggle).isChecked();
    await this.setSwitch(toggle, !wasChecked);
  }

  // Add Member Dialog methods
  /**
   * MatDialog moves focus to its first field only after its open animation;
   * filling before then can type into the wrong input (see
   * GroupsPage.openAddGroupDialog). The focused name input is the ready
   * signal.
   */
  async openAddMemberDialog(): Promise<void> {
    await this.addMemberButton.click();
    await expect(this.addMemberDialog).toBeVisible();
    await expect(this.addMemberTitle).toHaveText('Add Member');
    await expect(this.memberNameInput).toBeFocused();
    await this.waitForLoadingComplete();
  }

  async fillAddMemberForm(name: string, email: string): Promise<void> {
    await this.fillAndCommit(this.memberNameInput, name);
    await this.fillAndCommit(this.memberEmailInput, email);
  }

  async submitAddMemberForm(): Promise<void> {
    await this.addMemberSaveButton.click();
    await expect(this.addMemberDialog).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async cancelAddMember(): Promise<void> {
    await this.addMemberCancelButton.click();
    await expect(this.addMemberDialog).toBeHidden();
  }

  async addMember(name: string, email: string): Promise<void> {
    await this.openAddMemberDialog();
    await this.fillAddMemberForm(name, email);
    await this.submitAddMemberForm();

    // Verify the member was created and appears in the table
    await this.verifyMemberInTable(name);
  }

  // Edit Member Dialog methods
  async clickMemberRow(memberId: string): Promise<void> {
    const memberRow = this.page.getByTestId(`member-row-${memberId}`);
    await memberRow.click();
    await expect(this.editMemberDialog).toBeVisible();
    await expect(this.editMemberTitle).toHaveText('Edit Member');
    // Dialog ready (initial focus moved); see openAddMemberDialog.
    await expect(this.editMemberNameInput).toBeFocused();
    await this.waitForLoadingComplete();
  }

  async fillEditMemberForm(name?: string, email?: string): Promise<void> {
    if (name !== undefined) {
      await this.editMemberNameInput.clear();
      await this.fillAndCommit(this.editMemberNameInput, name);
    }

    if (email !== undefined) {
      await this.editMemberEmailInput.clear();
      await this.fillAndCommit(this.editMemberEmailInput, email);
    }
  }

  async toggleMemberActive(): Promise<void> {
    await this.flipToggle(this.editMemberActiveToggle);
  }

  async toggleMemberAdmin(): Promise<void> {
    await this.flipToggle(this.editMemberAdminToggle);
  }

  async submitEditMemberForm(): Promise<void> {
    await this.editMemberSaveButton.click();
    await expect(this.editMemberDialog).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async cancelEditMember(): Promise<void> {
    await this.editMemberCancelButton.click();
    await expect(this.editMemberDialog).toBeHidden();
  }

  /** Clicks Remove; resolves once the delete confirmation dialog is showing. */
  async removeMember(): Promise<void> {
    await this.removeMemberButton.click();
    await expect(this.deleteDialogTitle).toBeVisible();
  }

  /**
   * Confirms the delete dialog opened by removeMember and waits for it to
   * close. The outcome is the caller's to assert: on success the Edit dialog
   * closes too, on a refusal it stays open with an error snackbar.
   */
  async confirmRemove(): Promise<void> {
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialogTitle).toBeHidden();
    await this.waitForLoadingComplete();
  }

  /** Clicks Leave Group; resolves once the confirmation dialog is showing. */
  async leaveGroup(): Promise<void> {
    await this.leaveGroupButton.click();
    await expect(this.confirmDialogTitle).toBeVisible();
  }

  /** Confirms the Leave dialog and waits for it to close. */
  async confirmLeave(): Promise<void> {
    await this.confirmButton.click();
    await expect(this.confirmDialogTitle).toBeHidden();
    await this.waitForLoadingComplete();
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
    // The edit form is populated from the member when the dialog is built.
    await this.clickMemberRow(memberId);

    // Make changes
    if (options.name !== undefined || options.email !== undefined) {
      await this.fillEditMemberForm(options.name, options.email);
    }

    // The checked state lives on the toggle's inner switch, not its host.
    if (options.active !== undefined) {
      await this.setSwitch(this.editMemberActiveToggle, options.active);
    }

    if (options.groupAdmin !== undefined) {
      await this.setSwitch(this.editMemberAdminToggle, options.groupAdmin);
    }

    // Save changes
    await expect(this.editMemberSaveButton).toBeEnabled();
    await this.submitEditMemberForm();
  }

  // Verification methods
  async verifyMemberInTable(memberName: string): Promise<void> {
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

  async verifySaveButtonDisabled(dialogType: 'add' | 'edit'): Promise<void> {
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
    await Promise.all(
      expectedErrors.map((error) =>
        expect(this.formErrors.filter({ hasText: error }).first()).toBeVisible()
      )
    );
  }

  // Other methods
  /** Starts the Members guided tour from the help icon. */
  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await expect(this.page.getByTestId('guided-tour-title')).toBeVisible();
  }
}
