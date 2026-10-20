import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/** Firestore writes behind Save can be slow on a cold emulator. */
const SAVE_TIMEOUT_MS = 15_000;

export class GroupsPage extends BasePage {
  // Main page elements
  readonly mainContainer: Locator;
  readonly groupSelect: Locator;
  readonly newGroupButton: Locator;
  readonly manageGroupsButton: Locator;
  readonly helpButton: Locator;
  readonly noGroupsPlaceholder: Locator;
  readonly noGroupsPlaceholderText: Locator;

  // Add Group dialog
  readonly addGroupDialog: Locator;
  readonly addGroupTitle: Locator;
  readonly groupNameInput: Locator;
  readonly displayNameInput: Locator;
  readonly autoAddMembersToggle: Locator;
  readonly addGroupSaveButton: Locator;
  readonly addGroupCancelButton: Locator;

  // Manage Groups dialog
  readonly manageGroupsDialog: Locator;
  readonly manageGroupsTitle: Locator;
  readonly manageGroupSelect: Locator;
  readonly manageGroupNameInput: Locator;
  readonly manageActiveToggle: Locator;
  readonly manageAutoAddToggle: Locator;
  readonly manageGroupsSaveButton: Locator;
  readonly manageGroupsCancelButton: Locator;

  // Generic elements
  readonly dialogErrors: Locator;
  readonly snackbar: Locator;
  readonly loadingOverlay: Locator;
  /** The open mat-select panel (group select or manage-dialog select). */
  readonly selectPanel: Locator;
  readonly tourTitle: Locator;
  readonly tourCloseButton: Locator;

  constructor(page: Page) {
    super(page);

    this.mainContainer = page.getByTestId('groups-main-container');
    this.groupSelect = page.getByTestId('group-select');
    this.newGroupButton = page.getByTestId('new-group-button');
    this.manageGroupsButton = page.getByTestId('manage-groups-button');
    this.helpButton = page.getByTestId('groups-help-button');
    this.noGroupsPlaceholder = page.getByTestId('no-groups-placeholder');
    this.noGroupsPlaceholderText = page.getByTestId(
      'no-groups-placeholder-text'
    );

    this.addGroupDialog = page.locator('mat-dialog-container');
    this.addGroupTitle = page.getByTestId('add-group-title');
    this.groupNameInput = page.getByTestId('group-name-input');
    this.displayNameInput = page.getByTestId('display-name-input');
    this.autoAddMembersToggle = page.getByTestId('auto-add-members-toggle');
    this.addGroupSaveButton = page.getByTestId('add-group-save-button');
    this.addGroupCancelButton = page.getByTestId('add-group-cancel-button');

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

    this.dialogErrors = page.locator('mat-dialog-container mat-error');
    this.snackbar = page.getByTestId('snackbar');
    this.loadingOverlay = page.getByTestId('loading-spinner-container');
    this.selectPanel = page.getByRole('listbox');
    this.tourTitle = page.getByTestId('guided-tour-title');
    this.tourCloseButton = page.getByTestId('guided-tour-close-button');
  }

  /**
   * Opens Groups and waits until the page has settled: the group list has
   * loaded and the invited-member link check is done (the main container
   * replaces the "Loading groups..." placeholder) and the overlay is gone.
   */
  async goto(): Promise<void> {
    await this.page.goto('/administration/groups');
    await expect(this.mainContainer).toBeVisible();
    await expect(this.loadingOverlay).toBeHidden();
  }

  /**
   * The snackbar showing `message`. Matched by text because an earlier
   * snackbar can still be in the DOM (exit animation) when a new one opens.
   */
  snackbarWith(message: string): Locator {
    return this.snackbar.filter({ hasText: message });
  }

  /** A group-select / manage-select option, matched on its full name. */
  option(groupName: string): Locator {
    return this.selectPanel.getByRole('option', {
      name: groupName,
      exact: true,
    });
  }

  async openGroupSelect(): Promise<void> {
    await this.groupSelect.click();
    await expect(this.selectPanel).toBeVisible();
  }

  async closeSelectPanel(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.selectPanel).toBeHidden();
  }

  /** Picks a group in the page's group select and waits for it to load. */
  async selectGroup(groupName: string): Promise<void> {
    await this.openGroupSelect();
    await this.option(groupName).click();
    await expect(this.selectPanel).toBeHidden();
    await expect(this.loadingOverlay).toBeHidden();
    await expect(this.groupSelect).toHaveText(groupName);
  }

  /** Asserts the group is listed in the page's group select. */
  async verifyGroupInList(groupName: string): Promise<void> {
    await this.openGroupSelect();
    await expect(this.option(groupName)).toBeVisible();
    await this.closeSelectPanel();
  }

  /** Asserts the group is not listed (e.g. it was deactivated). */
  async verifyGroupNotInList(groupName: string): Promise<void> {
    await this.openGroupSelect();
    await expect(this.selectPanel.getByRole('option').first()).toBeVisible();
    await expect(this.option(groupName)).toHaveCount(0);
    await this.closeSelectPanel();
  }

  /**
   * Opens New Group and waits until the dialog has finished opening.
   *
   * MatDialog (delayFocusTrap) moves focus to its first tabbable field only
   * after the ~150 ms open animation and a render. fill() is two steps
   * (select+focus, then a separate insertText into whatever is focused), so
   * filling before that focus move can type into the group-name input
   * instead - the baseline "display-name-input stayed empty" failure. The
   * group-name input being focused is the "dialog ready" signal.
   */
  async openAddGroupDialog(): Promise<void> {
    await this.newGroupButton.click();
    await expect(this.addGroupDialog).toBeVisible();
    await expect(this.addGroupTitle).toHaveText('Add New Group');
    await expect(this.groupNameInput).toBeFocused();
  }

  async fillAddGroupForm(
    groupName: string,
    displayName: string,
    autoAddMembers: boolean = false
  ): Promise<void> {
    await this.groupNameInput.fill(groupName);
    await this.groupNameInput.blur();
    await expect(this.groupNameInput).toHaveValue(groupName);

    await this.displayNameInput.fill(displayName);
    await this.displayNameInput.blur();
    await expect(this.displayNameInput).toHaveValue(displayName);

    if (autoAddMembers) {
      await this.setToggle(this.autoAddMembersToggle, true);
    }
  }

  async submitAddGroupForm(): Promise<void> {
    await expect(this.addGroupSaveButton).toBeEnabled();
    await this.addGroupSaveButton.click();
    await expect(this.addGroupDialog).toBeHidden({ timeout: SAVE_TIMEOUT_MS });
    await expect(this.loadingOverlay).toBeHidden();
  }

  /** Creates a group and waits until it is listed in the group select. */
  async createGroup(
    groupName: string,
    displayName: string,
    autoAddMembers: boolean = false
  ): Promise<void> {
    await this.openAddGroupDialog();
    await this.fillAddGroupForm(groupName, displayName, autoAddMembers);
    await this.submitAddGroupForm();
    await this.verifyGroupInList(groupName);
  }

  async cancelAddGroup(): Promise<void> {
    await this.addGroupCancelButton.click();
    await expect(this.addGroupDialog).toBeHidden();
  }

  /**
   * Opens Manage Groups and waits for it to be ready: the dialog has moved
   * initial focus to its group select (see openAddGroupDialog for why that
   * matters) and the overlay it shows while loading the group is gone.
   */
  async openManageGroupsDialog(): Promise<void> {
    await this.manageGroupsButton.click();
    await expect(this.manageGroupsDialog).toBeVisible();
    await expect(this.manageGroupsTitle).toHaveText('Manage Groups');
    await expect(this.manageGroupSelect).toBeFocused();
    await expect(this.loadingOverlay).toBeHidden();
  }

  /**
   * Opens Manage Groups on the named group. The form is ready once the name
   * input shows that group's name; until then the dialog may still be showing
   * whichever group was current.
   */
  async openManageGroupsFor(groupName: string): Promise<void> {
    await this.openManageGroupsDialog();
    await this.manageGroupSelect.click();
    await expect(this.selectPanel).toBeVisible();
    await this.option(groupName).click();
    await expect(this.selectPanel).toBeHidden();
    await expect(this.manageGroupSelect).toHaveText(groupName);
    await expect(this.manageGroupNameInput).toHaveValue(groupName);
    await expect(this.loadingOverlay).toBeHidden();
  }

  /** Saves Manage Groups and waits for the dialog to close. */
  async saveManageGroups(): Promise<void> {
    await expect(this.manageGroupsSaveButton).toBeEnabled();
    await this.manageGroupsSaveButton.click();
    await expect(this.manageGroupsDialog).toBeHidden({
      timeout: SAVE_TIMEOUT_MS,
    });
    await expect(this.loadingOverlay).toBeHidden();
  }

  async cancelManageGroups(): Promise<void> {
    await this.manageGroupsCancelButton.click();
    await expect(this.manageGroupsDialog).toBeHidden();
  }

  /** The switch inside a mat-slide-toggle (it carries the checked state). */
  switchOf(toggle: Locator): Locator {
    return toggle.getByRole('switch');
  }

  /**
   * Flips a mat-slide-toggle from !checked to `checked`. Not setChecked():
   * that re-reads the state synchronously after its click, but the switch's
   * aria-checked only updates on the app's next (zoneless) change detection.
   */
  async setToggle(toggle: Locator, checked: boolean): Promise<void> {
    const control = this.switchOf(toggle);
    await expect(control).toBeChecked({ checked: !checked });
    await control.click();
    await expect(control).toBeChecked({ checked });
  }

  /** Starts the Groups guided tour from the help icon. */
  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await expect(this.tourTitle).toBeVisible();
  }
}
