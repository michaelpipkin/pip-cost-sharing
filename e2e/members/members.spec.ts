import { expect, test } from '../fixtures';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';
import { getSeedAdmin } from '../seed/admin';
import { MEMBERS } from '../seed/datasets/members';
import { signInAs } from '../utils/session';

// The admin tests share members-admin and "Members – Main" (see
// e2e/seed/datasets/members.ts): each works on its own placeholder member,
// and nobody switches groups. Adding a member is covered in groups-admin.

const { users, groups, placeholders, removeLinked } = MEMBERS;

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

  test('should remove a registered member and clear their default group', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const row = members.row(removeLinked.key);

    await signInAs(page, users.admin);
    await members.goto();
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      removeLinked.displayName
    );

    await members.clickMemberRow(removeLinked.key);
    await members.removeMember();
    await members.confirmRemove();
    await expect(members.snackbarWith('Member removed')).toBeVisible();
    await expect(row).toHaveCount(0);
    // The removal also cleared the group as the removed user's default
    // (read through the Admin SDK on the test emulator).
    await expect
      .poll(async () => {
        const snap = await getSeedAdmin()
          .db.doc(`users/${users.removed.uid}`)
          .get();
        return snap.get('defaultGroupRef');
      })
      .toBeNull();
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

  // An admin's edit of an unlinked member's email gets the same
  // duplicate check as the server's (case-insensitive), so two rows of one
  // group can't end up on one address.
  test("should refuse another member's address for an unlinked member", async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const { duplicate } = placeholders;
    const memberDoc = getSeedAdmin().db.doc(
      `groups/${groups.main.key}/members/${duplicate.key}`
    );

    await signInAs(page, users.admin);
    await members.goto();
    await expect(
      members.row(duplicate.key).getByTestId('member-name-cell')
    ).toHaveText(duplicate.displayName);

    await members.clickMemberRow(duplicate.key);
    // Ari's own address, in other casing.
    await members.fillEditMemberForm(
      undefined,
      users.admin.email.toUpperCase()
    );
    await members.editMemberSaveButton.click();
    await expect(
      members.snackbarWith(
        'Another member of this group already uses that address.'
      )
    ).toBeVisible();
    await members.waitForLoadingComplete();
    await expect(members.editMemberDialog).toBeVisible();
    await members.cancelEditMember();

    const stored = await memberDoc.get();
    expect(stored.get('email')).toBe('');
    expect(stored.get('userRef') ?? null).toBeNull();
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

    // Lee has no splits in the group, and the row is still kept as left:
    // it is what stops an admin inviting them back.
    const row = await getSeedAdmin()
      .db.doc(`groups/${leave.key}/members/${MEMBERS.leaverMemberKey}`)
      .get();
    expect(row.exists).toBe(true);
    expect(row.data()).toMatchObject({
      active: false,
      leftGroup: true,
      groupAdmin: false,
    });
    expect(row.get('userRef')?.id).toBe(users.leaver.uid);
  });
});
