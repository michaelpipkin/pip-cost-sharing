import { expect, test } from '../fixtures';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';
import { MEMBERS } from '../seed/datasets/members';
import { signInAs } from '../utils/session';

// The admin tests share members-admin and "Members – Main" (see
// e2e/seed/datasets/members.ts): each works on its own placeholder member,
// and nobody switches groups. Adding a member is covered in groups-admin.

const { users, groups, placeholders } = MEMBERS;

test.describe('Members', { tag: ['@members'] }, () => {
  test("should edit a member's name and admin flag", async ({ page }) => {
    const members = new MembersPage(page);
    const row = members.row(placeholders.edit.key);
    const newName = `Edited ${Date.now().toString(36)}`;

    await signInAs(page, users.admin);
    await members.goto();
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      placeholders.edit.displayName
    );
    await expect(row.getByTestId('member-admin-cell')).toHaveText('');

    await members.editMember(placeholders.edit.key, {
      name: newName,
      groupAdmin: true,
    });
    await expect(members.snackbarWith('Member saved')).toBeVisible();
    await expect(row.getByTestId('member-name-cell')).toHaveText(newName);
    await expect(row.getByTestId('member-admin-cell')).toHaveText('✔');

    await members.reload();
    await expect(row.getByTestId('member-name-cell')).toHaveText(newName);
    await expect(row.getByTestId('member-admin-cell')).toHaveText('✔');
  });

  test('should remove a member without splits', async ({ page }) => {
    const members = new MembersPage(page);
    const row = members.row(placeholders.remove.key);

    await signInAs(page, users.admin);
    await members.goto();
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      placeholders.remove.displayName
    );

    await members.clickMemberRow(placeholders.remove.key);
    await members.removeMember();
    await members.confirmRemove();
    await expect(members.snackbarWith('Member removed')).toBeVisible();
    await expect(members.editMemberTitle).toBeHidden();
    await expect(row).toHaveCount(0);
  });

  test('should not remove a member with splits', async ({ page }) => {
    const members = new MembersPage(page);
    const row = members.row(placeholders.hasSplits.key);

    await signInAs(page, users.admin);
    await members.goto();
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      placeholders.hasSplits.displayName
    );

    await members.clickMemberRow(placeholders.hasSplits.key);
    await members.removeMember();
    await members.confirmRemove();
    await expect(
      members.snackbarWith(
        'This member has existing splits and cannot be deleted.'
      )
    ).toBeVisible();
    // The Edit dialog stays open; closing it shows the member still listed.
    await expect(members.editMemberTitle).toBeVisible();
    await members.cancelEditMember();
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      placeholders.hasSplits.displayName
    );
  });

  test('should leave a group', async ({ page }) => {
    const members = new MembersPage(page);
    const groupsPage = new GroupsPage(page);
    const expenses = new ExpensesPage(page);
    const { leave, leaveHome } = groups;

    await signInAs(page, users.leaver);
    await members.goto();
    await expect(members.currentGroupName).toHaveText(leave.name);

    await members.clickMemberRow(MEMBERS.leaverMemberKey);
    await members.leaveGroup();
    await members.confirmLeave();
    await expect(
      members.snackbarWith('You have left the group successfully.')
    ).toBeVisible();
    await expect(page).toHaveURL(/\/administration\/groups$/);

    await groupsPage.verifyGroupInList(leaveHome.name);
    await groupsPage.verifyGroupNotInList(leave.name);
    await expenses.navigateToList();
    await expect(expenses.currentGroupName).toHaveText(leaveHome.name);
  });
});
