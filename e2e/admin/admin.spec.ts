import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { AdminPage } from '../pages/admin.page';
import { AuthPage } from '../pages/auth.page';
import { ADMIN } from '../seed/datasets/admin';
import { SHARED } from '../seed/datasets/shared';
import { signInAs } from '../utils/session';

// The admin area (e2e/seed/datasets/admin.ts): signed in as SHARED.users.admin
// (read-only: it has no groups and nothing here changes it) or, for the
// non-admin check, SHARED.users.bob (a read-only visit). mail and app_errors
// are global collections other specs write to, so every row is found by the
// subject or component this spec seeded, never by position or by counting.
// The only writes are deleting the two documents this spec seeded for that.

const { mail, appErrors } = ADMIN;

// The overview report scans every group and user through a Cloud Function,
// which can take 20+ s on cold functions: give that wait a generous bound.
const REPORT_TIMEOUT_MS = 90_000;

test.describe('Admin', { tag: ['@admin'] }, () => {
  // The route runs [authGuard, adminGuard]. adminGuard used to call
  // router.navigate(home) for any non-owner, which superseded authGuard's
  // redirect, so a signed-out visitor landed on Home; it now returns UrlTrees.
  test('should send a signed-out visitor to login', async ({ page }) => {
    const auth = new AuthPage(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(auth.loginButton).toBeVisible();
  });

  test('should keep non-admins out', async ({ page }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);

    await signInAs(page, SHARED.users.bob);

    // Bob is signed in but is not the app owner: adminGuard sends /admin to
    // Home. For a signed-in user with a group, Home is only a stop: once
    // the reloaded app has handled his groups snapshot, GroupService moves
    // him on to Expenses (handleGroupsSnapshot's redirect pages in
    // src/app/services/group.service.ts). That landing is the evidence the
    // snapshot has run, so that redirect can't land after the Account
    // click below and carry him off the Account page. The guard decides on
    // auth state alone, so it has always sent him Home before the snapshot
    // (three Firestore reads later) can arrive.
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        visited.push(new URL(frame.url()).pathname);
      }
    });
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/expenses$/);
    expect(visited).toContain('/');
    await account.waitForInitialNavigation();
    await account.waitForLoadingComplete();

    // And his Account page offers no way in.
    await account.gotoAccount();
    await expect(page.getByTestId('nav-payments')).toBeVisible();
    await expect(admin.navAdminLink).toHaveCount(0);
  });

  test('should open the admin area from the account page', async ({ page }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);

    await signInAs(page, SHARED.users.admin);
    await account.gotoAccount();
    await admin.openFromAccount();
    await expect(admin.runReportButton).toBeVisible();

    await admin.openEmailLog();
    await expect(admin.emailChip('all')).toBeVisible();

    await admin.openErrorLog();
    await expect(admin.individualToggle).toBeVisible();
  });

  test('should run a report', async ({ page }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);

    await signInAs(page, SHARED.users.admin);
    await account.gotoAccount();
    await admin.openFromAccount();
    await expect(admin.reportResults).toHaveCount(0);

    await admin.runFirstReport();
    // Structure only: the figures depend on everything else seeded and
    // created in the run. The first report is the Overview, a set of stat
    // cards plus the generation time.
    await expect(admin.reportResults).toBeVisible({
      timeout: REPORT_TIMEOUT_MS,
    });
    await expect(page.getByText('Total Groups')).toBeVisible();
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(admin.reportResults.getByText(/^Generated:/)).toBeVisible();
    // Once there is a result the button re-runs it.
    await expect(admin.runReportButton).toHaveText(/Refresh/);
  });

  test('should filter the email log by state', async ({ page }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);
    const error = admin.emailRow(mail.error.subject);
    const retry = admin.emailRow(mail.retry.subject);

    await signInAs(page, SHARED.users.admin);
    await account.gotoAccount();
    await admin.openFromAccount();
    await admin.openEmailLog();
    // Unfiltered, both are listed.
    await expect(error).toBeVisible();
    await expect(retry).toBeVisible();

    await admin.filterEmails('error');
    await expect(error).toBeVisible();
    await expect(retry).toBeHidden();

    await admin.filterEmails('retry');
    await expect(retry).toBeVisible();
    await expect(error).toBeHidden();
  });

  test('should delete one email log entry', async ({ page }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);
    const { deleteMe, error } = mail;

    await signInAs(page, SHARED.users.admin);
    await account.gotoAccount();
    await admin.openFromAccount();
    await admin.openEmailLog();
    await expect(admin.emailRow(deleteMe.subject)).toBeVisible();

    await admin.deleteEmail(deleteMe.subject);
    await expect(admin.emailRow(deleteMe.subject)).toHaveCount(0);
    // Only that entry went: a neighbour seeded the same way is still listed.
    await expect(admin.emailRow(error.subject)).toBeVisible();
  });

  test('should list and group seeded errors, then delete one', async ({
    page,
  }) => {
    const account = new AccountPage(page);
    const admin = new AdminPage(page);
    const listed = appErrors.listedFirst.component;
    const doomed = appErrors.deleteMe.component;

    await signInAs(page, SHARED.users.admin);
    await account.gotoAccount();
    await admin.openFromAccount();
    await admin.openErrorLog();

    // Individually, the repeated error is two rows.
    await expect(admin.errorRow(listed)).toHaveCount(2);
    await expect(admin.errorRow(doomed)).toHaveCount(1);

    // Grouped, they collapse into one row with a count of 2.
    await admin.showGrouped();
    await expect(admin.errorRow(listed)).toHaveCount(1);
    await expect(
      admin.errorRow(listed).getByTestId('error-group-count')
    ).toHaveText('2');

    await admin.showIndividual();
    await expect(admin.errorRow(listed)).toHaveCount(2);

    await admin.deleteError(doomed);
    await expect(admin.errorRow(doomed)).toHaveCount(0);
    // The repeated error is untouched.
    await expect(admin.errorRow(listed)).toHaveCount(2);
  });
});
