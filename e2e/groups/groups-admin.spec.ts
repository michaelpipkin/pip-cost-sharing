import { type Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { GroupsPage } from '../pages/groups.page';
import { GROUPS } from '../seed/datasets/groups';
import type { SeedUser } from '../seed/types';
import { signInAs } from '../utils/session';

// Data: e2e/seed/datasets/groups.ts. Every test that mutates data or selects
// a group signs in as its own user, because each page load rewrites the
// user's default group and would undo a parallel tab's selection. Read-only
// tests share groups-empty (no groups; no test may create one as them) or
// groups-viewer ("Groups – View A/B"). Created groups get unique names.
// Every test signs in itself.
const {
  empty,
  firstCreator,
  autoAddCreator,
  multiCreator,
  workflowCreator,
  viewer,
  switcher,
  renamer,
  activator,
  autoAdder,
} = GROUPS.users;
const { viewA, viewB, switchA, switchB, rename, active, autoAdd } =
  GROUPS.groups;

function uniqueGroupName(label: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `Groups – ${label} ${suffix}`;
}

async function openGroupsAs(page: Page, user: SeedUser): Promise<GroupsPage> {
  await signInAs(page, user);
  const groupsPage = new GroupsPage(page);
  await groupsPage.goto();
  return groupsPage;
}

/** The page still shows a user with no groups (nothing was saved). */
async function expectNoGroups(groupsPage: GroupsPage): Promise<void> {
  await expect(groupsPage.noGroupsPlaceholder).toBeVisible();
  await expect(groupsPage.groupSelect).toHaveCount(0);
  await expect(groupsPage.manageGroupsButton).toHaveCount(0);
}

test.describe('Groups - no groups yet', { tag: '@groups' }, () => {
  test('should show guidance and the New Group button', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, empty);

    await expect(groupsPage.noGroupsPlaceholderText).toContainText(
      'Click "New Group" to create your first group!'
    );
    await expect(groupsPage.newGroupButton).toBeVisible();
    await expect(groupsPage.newGroupButton).toHaveText('New Group');
    await expect(groupsPage.helpButton).toBeVisible();
    // The select only renders once the user has an active group.
    await expectNoGroups(groupsPage);
  });

  test('should validate required fields in create group form', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, empty);
    await groupsPage.openAddGroupDialog();

    await expect(groupsPage.addGroupSaveButton).toBeDisabled();

    await groupsPage.groupNameInput.fill('Groups – Never Saved');
    await expect(groupsPage.groupNameInput).toHaveValue('Groups – Never Saved');
    await expect(groupsPage.addGroupSaveButton).toBeDisabled();

    await groupsPage.displayNameInput.fill('Groups Empty');
    await expect(groupsPage.displayNameInput).toHaveValue('Groups Empty');
    await expect(groupsPage.addGroupSaveButton).toBeEnabled();

    await groupsPage.cancelAddGroup();
    await expectNoGroups(groupsPage);
  });

  test('should show validation errors for empty required fields', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, empty);
    await groupsPage.openAddGroupDialog();

    await groupsPage.groupNameInput.focus();
    await groupsPage.groupNameInput.blur();
    await groupsPage.displayNameInput.focus();
    await groupsPage.displayNameInput.blur();

    await expect(
      groupsPage.dialogErrors.filter({ hasText: '*Required' })
    ).toHaveCount(2);
    await expect(groupsPage.page.getByTestId('group-name-error-0')).toHaveText(
      '*Required'
    );
    await expect(
      groupsPage.page.getByTestId('display-name-error-0')
    ).toHaveText('*Required');
    await expect(groupsPage.addGroupSaveButton).toBeDisabled();

    await groupsPage.cancelAddGroup();
    await expectNoGroups(groupsPage);
  });

  test('should cancel create group dialog without saving', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, empty);
    await groupsPage.openAddGroupDialog();
    await groupsPage.fillAddGroupForm('Groups – Cancelled', 'Groups Empty');

    await groupsPage.cancelAddGroup();

    await expect(groupsPage.addGroupDialog).toBeHidden();
    await expect(groupsPage.snackbar).toHaveCount(0);
    await expectNoGroups(groupsPage);
    // Still nothing after a fresh load, so nothing was written.
    await groupsPage.goto();
    await expectNoGroups(groupsPage);
  });

  test('should start the groups tour from the help icon', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, empty);

    await groupsPage.openHelp();
    await expect(groupsPage.tourTitle).toHaveText('Groups');
    await expect(page.getByTestId('guided-tour-text')).toContainText(
      'the tour shows two samples'
    );

    await groupsPage.tourCloseButton.click();
    await expect(groupsPage.tourTitle).toBeHidden();
    // The tour's sample groups are gone again.
    await expectNoGroups(groupsPage);
  });
});

test.describe('Groups - creating groups', { tag: '@groups' }, () => {
  test('should create a group and make it selectable', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, firstCreator);
    const groupName = uniqueGroupName('Created');

    await groupsPage.openAddGroupDialog();
    await groupsPage.fillAddGroupForm(groupName, 'Groups Creator');
    await groupsPage.submitAddGroupForm();
    // The snackbar only lasts 4 s, so check it before anything slower.
    await expect(groupsPage.snackbarWith('Group added')).toBeVisible();

    await groupsPage.verifyGroupInList(groupName);
    await groupsPage.selectGroup(groupName);
  });

  test('should create a group with auto-add members enabled', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, autoAddCreator);
    const groupName = uniqueGroupName('Auto-Add');

    await groupsPage.createGroup(groupName, 'Groups Creator', true);

    await groupsPage.openManageGroupsFor(groupName);
    await expect(
      groupsPage.switchOf(groupsPage.manageAutoAddToggle)
    ).toBeChecked();
    await expect(
      groupsPage.switchOf(groupsPage.manageActiveToggle)
    ).toBeChecked();
    await groupsPage.cancelManageGroups();
  });

  test('should create two groups and switch between them', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, multiCreator);
    const first = uniqueGroupName('Multi 1');
    const second = uniqueGroupName('Multi 2');

    await groupsPage.createGroup(first, 'Groups Creator');
    await groupsPage.createGroup(second, 'Groups Creator', true);

    await groupsPage.selectGroup(first);
    await groupsPage.selectGroup(second);
    await groupsPage.selectGroup(first);
  });

  test('should create, select and rename a group', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, workflowCreator);
    const groupName = uniqueGroupName('Workflow');
    const renamed = `${groupName} Updated`;

    await groupsPage.createGroup(groupName, 'Groups Creator');
    await groupsPage.selectGroup(groupName);

    await groupsPage.openManageGroupsFor(groupName);
    await groupsPage.manageGroupNameInput.fill(renamed);
    await expect(groupsPage.manageGroupNameInput).toHaveValue(renamed);
    await groupsPage.saveManageGroups();

    await expect(groupsPage.snackbarWith('Group updated')).toBeVisible();
    await expect(groupsPage.groupSelect).toHaveText(renamed);
    await groupsPage.verifyGroupInList(renamed);
  });
});

test.describe('Groups - managing groups', { tag: '@groups' }, () => {
  test('should show the group select and Manage Groups for a group admin', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, viewer);

    await expect(groupsPage.groupSelect).toBeVisible();
    await expect(groupsPage.manageGroupsButton).toBeVisible();
    await expect(groupsPage.newGroupButton).toBeVisible();
    await expect(groupsPage.noGroupsPlaceholder).toHaveCount(0);
    await groupsPage.verifyGroupInList(viewA.name);
    await groupsPage.verifyGroupInList(viewB.name);
  });

  test('should switch between groups', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, switcher);

    // Seeded default is Switch A; selectGroup asserts the select then shows
    // the chosen group.
    await expect(groupsPage.groupSelect).toHaveText(switchA.name);
    await groupsPage.selectGroup(switchB.name);
    await groupsPage.selectGroup(switchA.name);
    await groupsPage.selectGroup(switchB.name);

    // The last selection is remembered as the default across a reload (safe
    // here: no other test signs in as groups-switcher).
    await groupsPage.goto();
    await expect(groupsPage.groupSelect).toHaveText(switchB.name);
  });

  test('should open manage groups dialog listing the admin groups', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, viewer);

    await groupsPage.openManageGroupsDialog();
    await groupsPage.manageGroupSelect.click();
    await expect(groupsPage.option(viewA.name)).toBeVisible();
    await expect(groupsPage.option(viewB.name)).toBeVisible();
    await groupsPage.closeSelectPanel();
    await groupsPage.cancelManageGroups();
  });

  test('should validate required fields in manage groups form', async ({
    page,
  }) => {
    const groupsPage = await openGroupsAs(page, viewer);
    await groupsPage.openManageGroupsFor(viewA.name);

    // Nothing changed yet.
    await expect(groupsPage.manageGroupsSaveButton).toBeDisabled();

    await groupsPage.manageGroupNameInput.clear();
    await groupsPage.manageGroupNameInput.blur();
    await expect(
      groupsPage.page.getByTestId('manage-group-name-error-0')
    ).toHaveText('*Required');
    await expect(groupsPage.manageGroupsSaveButton).toBeDisabled();

    await groupsPage.manageGroupNameInput.fill('Groups – Valid Name');
    await expect(groupsPage.manageGroupsSaveButton).toBeEnabled();

    await groupsPage.cancelManageGroups();
  });

  test('should cancel manage groups dialog without saving', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, viewer);
    await groupsPage.openManageGroupsFor(viewB.name);

    await groupsPage.manageGroupNameInput.fill('Groups – Changed Name');
    await expect(groupsPage.manageGroupsSaveButton).toBeEnabled();
    await groupsPage.cancelManageGroups();

    await expect(groupsPage.snackbar).toHaveCount(0);
    // Reopening shows the stored name, not the cancelled edit.
    await groupsPage.openManageGroupsFor(viewB.name);
    await groupsPage.cancelManageGroups();
    await groupsPage.verifyGroupInList(viewB.name);
  });

  test('should edit group name', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, renamer);
    const newName = uniqueGroupName('Renamed');

    await groupsPage.openManageGroupsFor(rename.name);
    await groupsPage.manageGroupNameInput.fill(newName);
    await expect(groupsPage.manageGroupNameInput).toHaveValue(newName);
    await groupsPage.saveManageGroups();

    await expect(groupsPage.snackbarWith('Group updated')).toBeVisible();
    await groupsPage.verifyGroupInList(newName);
    await groupsPage.verifyGroupNotInList(rename.name);
  });

  test('should toggle group active status', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, activator);

    await groupsPage.openManageGroupsFor(active.name);
    await expect(groupsPage.switchOf(groupsPage.manageActiveToggle)).toBeChecked();
    await groupsPage.setToggle(groupsPage.manageActiveToggle, false);
    await groupsPage.saveManageGroups();

    await expect(groupsPage.snackbarWith('Group updated')).toBeVisible();
    // Inactive groups drop out of the page's group select...
    await groupsPage.verifyGroupNotInList(active.name);
    // ...but stay manageable, now inactive.
    await groupsPage.openManageGroupsFor(active.name);
    await expect(
      groupsPage.switchOf(groupsPage.manageActiveToggle)
    ).not.toBeChecked();
    await groupsPage.cancelManageGroups();
  });

  test('should toggle auto-add members setting', async ({ page }) => {
    const groupsPage = await openGroupsAs(page, autoAdder);

    await groupsPage.openManageGroupsFor(autoAdd.name);
    await expect(
      groupsPage.switchOf(groupsPage.manageAutoAddToggle)
    ).not.toBeChecked();
    await groupsPage.setToggle(groupsPage.manageAutoAddToggle, true);
    await groupsPage.saveManageGroups();

    await expect(groupsPage.snackbarWith('Group updated')).toBeVisible();
    // Persisted: a fresh load shows it on.
    await groupsPage.goto();
    await groupsPage.openManageGroupsFor(autoAdd.name);
    await expect(
      groupsPage.switchOf(groupsPage.manageAutoAddToggle)
    ).toBeChecked();
    await groupsPage.cancelManageGroups();
  });
});
