import { test } from './fixtures';
import { AuthPage } from './pages/auth.page';
import { GroupsPage } from './pages/groups.page';

test.describe('Groups Debug Tests', () => {
  let authPage: AuthPage;
  let groupsPage: GroupsPage;

  test('debug authentication and groups page access', async ({
    preserveDataFirebasePage,
  }) => {
    authPage = new AuthPage(preserveDataFirebasePage);
    groupsPage = new GroupsPage(preserveDataFirebasePage);

    console.log('Step 1: Going to auth page...');
    await authPage.goto();

    console.log('Step 2: Creating and logging in test user...');
    await authPage.createAndLoginTestUser();

    console.log('Step 3: Checking if logged in...');
    const isLoggedIn = await authPage.isLoggedIn();
    console.log('Is logged in:', isLoggedIn);

    if (!isLoggedIn) {
      console.log('Not logged in, taking screenshot...');
      await preserveDataFirebasePage.screenshot({
        path: 'test-results/debug-not-logged-in.png',
        fullPage: true,
      });
    }

    console.log('Step 4: Going to groups page...');
    await groupsPage.goto();

    console.log('Step 5: Taking screenshot of groups page...');
    await preserveDataFirebasePage.screenshot({ path: 'test-results/debug-groups-page.png', fullPage: true });

    console.log('Step 6: Checking page content...');
    const pageContent = await preserveDataFirebasePage.textContent('body');
    console.log('Page content includes:', pageContent?.substring(0, 200));

    console.log('Step 7: Looking for potential loading states...');
    const loadingElements = await preserveDataFirebasePage.locator('text=Loading').count();
    console.log('Loading elements found:', loadingElements);

    const groupElements = await preserveDataFirebasePage.locator('text=group').count();
    console.log('Elements containing "group" text:', groupElements);

    // Check if user might need to be redirected
    const currentUrl = preserveDataFirebasePage.url();
    console.log('Current URL:', currentUrl);

    // Check if there are any error messages
    const errorElements = await preserveDataFirebasePage
      .locator('[role="alert"], .error, mat-error')
      .count();
    console.log('Error elements found:', errorElements);

    // Wait a bit for any async loading
    await preserveDataFirebasePage.waitForTimeout(2000);

    console.log('Step 8: Taking final screenshot...');
    await preserveDataFirebasePage.screenshot({ path: 'test-results/debug-groups-final.png', fullPage: true });

    // Try to find any form of navigation or menu
    const buttons = await preserveDataFirebasePage.locator('button').count();
    const links = await preserveDataFirebasePage.locator('a').count();
    console.log('Buttons found:', buttons, 'Links found:', links);

    // Look for any Angular Material components
    const matComponents = await preserveDataFirebasePage.locator('[class*="mat-"]').count();
    console.log('Material components found:', matComponents);
  });
});
