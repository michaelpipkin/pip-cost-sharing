import { expect, test } from './fixtures';
import { TEST_CONFIG } from './constants';
import { AuthPage } from './pages/auth.page';

test.describe('Groups Direct Navigation Test', () => {
  test('navigate directly to groups after auth', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    console.log('Step 1: Go to home page and authenticate...');
    await preserveDataFirebasePage.goto(`${TEST_CONFIG.baseUrl}/`);
    await authPage.createAndLoginTestUser();

    const isLoggedIn = await authPage.isLoggedIn();
    console.log('Is logged in:', isLoggedIn);
    expect(isLoggedIn).toBe(true);

    console.log('Step 2: Navigate directly to groups page...');
    await preserveDataFirebasePage.goto(
      `${TEST_CONFIG.baseUrl}/administration/groups`
    );

    console.log('Step 3: Wait for page to load...');
    await preserveDataFirebasePage.waitForSelector('app-root', {
      timeout: 10000,
    });

    console.log('Step 4: Check URL...');
    const currentUrl = preserveDataFirebasePage.url();
    console.log('Current URL:', currentUrl);

    console.log('Step 5: Take screenshot...');
    await preserveDataFirebasePage.screenshot({
      path: 'test-results/direct-groups-page.png',
      fullPage: true,
    });

    console.log('Step 6: Wait for any loading to complete...');
    await preserveDataFirebasePage.waitForTimeout(3000);

    console.log('Step 7: Look for groups-specific content...');

    // Look for loading state first
    const loadingText = await preserveDataFirebasePage
      .locator('text=Loading groups')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    console.log('Loading groups text visible:', loadingText);

    if (loadingText) {
      console.log('Waiting for loading to complete...');
      await preserveDataFirebasePage
        .locator('text=Loading groups')
        .waitFor({ state: 'hidden', timeout: 10000 })
        .catch(() => {
          console.log('Loading did not complete in time');
        });
    }

    // Look for key elements
    const groupSelectExists = await preserveDataFirebasePage
      .locator('[data-testid="group-select"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log('Group select visible:', groupSelectExists);

    const newGroupButton = await preserveDataFirebasePage
      .locator('[data-testid="new-group-button"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log('New Group button visible:', newGroupButton);

    // Check page content
    const pageText = await preserveDataFirebasePage.textContent('body');
    const hasGroupsContent = pageText?.includes('New Group');
    console.log('Page contains groups content:', hasGroupsContent);

    console.log('Step 8: Final screenshot...');
    await preserveDataFirebasePage.screenshot({
      path: 'test-results/direct-groups-final.png',
      fullPage: true,
    });

    // If we can see the New Group button, we're on the groups page successfully
    expect(newGroupButton).toBe(true);
  });
});
