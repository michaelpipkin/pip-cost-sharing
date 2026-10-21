import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { AdminPage } from '../pages/admin.page';
import { AuthPage } from '../pages/auth.page';
import { HomePage } from '../pages/home.page';
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
  // APP BUG (found writing this spec): visiting /admin signed out lands on
  // Home, not the login page. The route is guarded by [authGuard, adminGuard];
  // both run for the navigation, authGuard calls router.navigate(login) and
  // adminGuard (no user, so "not the owner") calls router.navigate(home) right
  // after, and the later redirect wins. The correct behaviour (login) is what
  // is asserted; remove test.fail() once adminGuard stops redirecting a
  // signed-out visitor.
  test('should send a signed-out visitor to login', async ({ page }) => {
    test.fail();
    const auth = new AuthPage(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(auth.loginButton).toBeVisible();
  });

  test('should keep non-admins out', async ({ page }) => {
    const home = new HomePage(page);
    const account = new AccountPage(page);
    const admin = new AdminPage(page);

    // Bob is signed in but is not the app owner: /admin goes to Home.
    await signInAs(page, SHARED.users.bob);
    await page.goto('/admin');
    await home.waitForInitialNavigation();
    await expect(home.title).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin/);

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
