import { expect, test } from '@playwright/test';

test.describe('Debug Login Page Elements', () => {
  test('should explore login page elements', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Take a screenshot to see what's on the page
    await page.screenshot({
      path: 'test-results/login-page-debug.png',
      fullPage: true,
    });

    // Log the page title
    const title = await page.title();
    console.log('Page title:', title);

    // Look for common form elements by type and other attributes
    const textInputs = await page.locator('input[type="text"]').count();
    const emailInputs = await page.locator('input[type="email"]').count();
    const passwordInputs = await page.locator('input[type="password"]').count();
    const buttons = await page.locator('button').count();
    const forms = await page.locator('form').count();

    console.log('Text inputs found:', textInputs);
    console.log('Email inputs found:', emailInputs);
    console.log('Password inputs found:', passwordInputs);
    console.log('Buttons found:', buttons);
    console.log('Forms found:', forms);

    // Check for inputs with email-related names or placeholders
    const emailLikeInputs = await page
      .locator(
        'input[placeholder*="email" i], input[name*="email" i], input[id*="email" i]'
      )
      .count();
    console.log('Email-like inputs found:', emailLikeInputs);

    // Get details on all input elements
    const allInputs = await page.locator('input').evaluateAll((inputs) =>
      inputs.map((input) => {
        const htmlInput = input as HTMLInputElement;
        return {
          type: htmlInput.type,
          id: htmlInput.id,
          name: htmlInput.name,
          placeholder: htmlInput.placeholder,
          className: htmlInput.className,
        };
      })
    );
    console.log('All inputs:', JSON.stringify(allInputs, null, 2));

    // Get details on all buttons
    const allButtons = await page.locator('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const htmlButton = button as HTMLButtonElement;
        return {
          id: htmlButton.id,
          type: htmlButton.type,
          textContent: htmlButton.textContent?.trim(),
          className: htmlButton.className,
        };
      })
    );
    console.log('All buttons:', JSON.stringify(allButtons, null, 2));

    // If we find inputs, let's get their attributes
    if (emailInputs > 0) {
      const emailInput = page.locator('input[type="email"]').first();
      const emailId = await emailInput.getAttribute('id');
      const emailName = await emailInput.getAttribute('name');
      const emailTestId = await emailInput.getAttribute('data-testid');

      console.log(
        'Email input - id:',
        emailId,
        'name:',
        emailName,
        'data-testid:',
        emailTestId
      );
    }

    if (passwordInputs > 0) {
      const passwordInput = page.locator('input[type="password"]').first();
      const passwordId = await passwordInput.getAttribute('id');
      const passwordName = await passwordInput.getAttribute('name');
      const passwordTestId = await passwordInput.getAttribute('data-testid');

      console.log(
        'Password input - id:',
        passwordId,
        'name:',
        passwordName,
        'data-testid:',
        passwordTestId
      );
    }

    // Check if there are any elements with data-testid attributes
    const testIdElements = await page.locator('[data-testid]').count();
    console.log('Elements with data-testid:', testIdElements);

    // Get all data-testid values
    if (testIdElements > 0) {
      const testIds = await page
        .locator('[data-testid]')
        .evaluateAll((elements) =>
          elements.map((el) => el.getAttribute('data-testid'))
        );
      console.log('Available data-testids:', testIds);
    }

    // This test will always pass - we're just exploring
    expect(title).toContain('PipSplit');
  });
});
