import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class GroupsPage extends BasePage {
  readonly navGroupsLink: Locator;

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
  /** The first validation message under each field. */
  readonly groupNameError: Locator;
  readonly displayNameError: Locator;
  readonly manageGroupNameError: Locator;
  readonly tourTitle: Locator;
  readonly tourCloseButton: Locator;

  constructor(page: Page) {
    super(page);

    this.navGroupsLink = page.getByTestId('nav-groups');

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
    this.groupNameError = page.getByTestId('group-name-error-0');
    this.displayNameError = page.getByTestId('display-name-error-0');
    this.manageGroupNameError = page.getByTestId('manage-group-name-error-0');
    this.tourTitle = page.getByTestId('guided-tour-title');
    this.tourCloseButton = page.getByTestId('guided-tour-close-button');
  }

  /**
   * Opens Groups from the nav bar (the user must already be signed in) and
   * waits until the page has settled: the group list has loaded and the
   * invited-member link check is done (the main container replaces the
   * "Loading groups..." placeholder) and the overlay is gone.
   *
   * In-app rather than a page.goto: a full load of a deep link can be
   * replaced by /expenses when the user's groups load before the initial
   * navigation commits (known app bug, pinned in
   * src/app/services/group.service.spec.ts). A stalled page load makes that
   * likely: in a probe, 7 of 237 deep-link loads landed on /expenses.
   */
  async goto(): Promise<void> {
    await this.navGroupsLink.click();
    await expect(this.page).toHaveURL(/\/administration\/groups$/);
    await expect(this.mainContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * Reloads the app (so what the page shows comes from Firestore, not from
   * the in-memory stores), then opens Groups in-app. Waits for the reload's
   * initial navigation to settle first: it may still be redirected to
   * /expenses (see goto), and that redirect would override an earlier click.
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForInitialNavigation();
    await this.waitForLoadingComplete();
    await this.goto();
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
    await this.chooseOption(this.groupSelect, groupName);
    await this.waitForLoadingComplete();
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
      await this.setSwitch(this.autoAddMembersToggle, true);
    }
  }

  async submitAddGroupForm(): Promise<void> {
    await expect(this.addGroupSaveButton).toBeEnabled();
    await this.addGroupSaveButton.click();
    await expect(this.addGroupDialog).toBeHidden();
    await this.waitForLoadingComplete();
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
    await this.waitForLoadingComplete();
  }

  /**
   * Opens Manage Groups on the named group. The form is ready once the name
   * input shows that group's name; until then the dialog may still be showing
   * whichever group was current.
   */
  async openManageGroupsFor(groupName: string): Promise<void> {
    await this.openManageGroupsDialog();
    await this.chooseOption(this.manageGroupSelect, groupName);
    await expect(this.manageGroupNameInput).toHaveValue(groupName);
    await this.waitForLoadingComplete();
  }

  /** Saves Manage Groups and waits for the dialog to close. */
  async saveManageGroups(): Promise<void> {
    await expect(this.manageGroupsSaveButton).toBeEnabled();
    await this.manageGroupsSaveButton.click();
    await expect(this.manageGroupsDialog).toBeHidden();
    await this.waitForLoadingComplete();
  }

  async cancelManageGroups(): Promise<void> {
    await this.manageGroupsCancelButton.click();
    await expect(this.manageGroupsDialog).toBeHidden();
  }

  /** Starts the Groups guided tour from the help icon. */
  async openHelp(): Promise<void> {
    await this.helpButton.click();
    await expect(this.tourTitle).toBeVisible();
  }
}
