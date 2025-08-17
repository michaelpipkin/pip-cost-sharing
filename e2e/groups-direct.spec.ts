import { expect, test } from '@playwright/test';
import { AuthPage } from './pages/auth.page';

test.describe('Groups Direct Navigation Test', () => {
  test('navigate directly to groups after auth', async ({ page }) => {
    const authPage = new AuthPage(page);

    console.log('Step 1: Go to home page and authenticate...');
    await page.goto('http://localhost:4200/');
    await authPage.createAndLoginTestUser();

    const isLoggedIn = await authPage.isLoggedIn();
    console.log('Is logged in:', isLoggedIn);
    expect(isLoggedIn).toBe(true);

    console.log('Step 2: Navigate directly to groups page...');
    await page.goto('http://localhost:4200/groups');

    console.log('Step 3: Wait for page to load...');
    await page.waitForSelector('app-root', { timeout: 10000 });

    console.log('Step 4: Check URL...');
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    console.log('Step 5: Take screenshot...');
    await page.screenshot({ path: 'direct-groups-page.png', fullPage: true });

    console.log('Step 6: Wait for any loading to complete...');
    await page.waitForTimeout(3000);

    console.log('Step 7: Look for groups-specific content...');

    // Look for loading state first
    const loadingText = await page
      .locator('text=Loading groups')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    console.log('Loading groups text visible:', loadingText);

    if (loadingText) {
      console.log('Waiting for loading to complete...');
      await page
        .locator('text=Loading groups')
        .waitFor({ state: 'hidden', timeout: 10000 })
        .catch(() => {
          console.log('Loading did not complete in time');
        });
    }

    // Look for key elements
    const groupSelectExists = await page
      .locator('#group-select')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log('Group select visible:', groupSelectExists);

    const newGroupButton = await page
      .locator('button:has-text("New Group")')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log('New Group button visible:', newGroupButton);

    const joinGroupButton = await page
      .locator('button:has-text("Join Group")')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log('Join Group button visible:', joinGroupButton);

    // Check page content
    const pageText = await page.textContent('body');
    const hasGroupsContent =
      pageText?.includes('New Group') || pageText?.includes('Join Group');
    console.log('Page contains groups content:', hasGroupsContent);

    console.log('Step 8: Final screenshot...');
    await page.screenshot({ path: 'direct-groups-final.png', fullPage: true });

    // If we can see buttons, that means we're on the groups page successfully
    expect(newGroupButton || joinGroupButton).toBe(true);
  });
});
