# E2E Testing with Playwright and Firebase Emulators

This directory contains end-to-end tests for the PipSplit application using Playwright with Firebase emulator integration.

## Setup

The e2e testing environment has been configured with:

- **Playwright**: Modern web testing framework
- **Firebase Emulators**: Local Firebase services with test data
- **TypeScript**: Full TypeScript support for tests
- **Page Object Model**: Organized page objects for maintainable tests
- **Test Utilities**: Helper functions for common test operations
- **Multiple Browsers**: Tests run on Chromium, Firefox, WebKit, and mobile viewports

## Firebase Emulator Integration

Tests automatically start Firebase emulators before running:

- **Authentication Emulator** (port 9099): For testing user authentication
- **Firestore Emulator** (port 8080): For testing database operations
- **Functions Emulator** (port 5001): For testing cloud functions
- **Storage Emulator** (port 9199): For testing file storage
- **Test Data Import**: Automatically imports seed data from `seed-data/` directory

Each test runs with a clean Firebase state and can create test users and data as needed.

## Folder Structure

```
e2e/
├── constants/          # Test constants and Firebase configuration
├── fixtures/           # Test fixtures with Firebase emulator setup
├── pages/             # Page Object Model classes
│   ├── base.page.ts   # Base page object class
│   ├── home.page.ts   # Home page object
│   └── auth.page.ts   # Authentication page object
├── utils/             # Helper utilities for tests
│   ├── helpers.ts     # General test helpers
│   └── firebase.ts    # Firebase emulator utilities
├── tsconfig.json      # TypeScript configuration for e2e tests
└── README.md          # This documentation
```

## Running Tests

### Development Workflow (Recommended)

**Step 1: Start Firebase Emulators**
```bash
pnpm emu:data
```

**Step 2: Run Tests**
```bash
pnpm e2e              # Run all tests headlessly
pnpm e2e:headed       # Run with browser UI visible
pnpm e2e:debug        # Run in debug mode
pnpm e2e:ui           # Run with Playwright's interactive UI
```

### Alternative: Fully Automated
If you prefer everything automated in one command:
```bash
pnpm test:full        # Starts emulators + runs tests automatically
```

### Other Commands
- `pnpm e2e:report` - View the last test report
- `pnpm e2e:install` - Reinstall browsers if needed

## Configuration

The main configuration is in `playwright.config.ts` at the project root. Key features:

- **Base URL**: Set to `http://local.dev.com:4200` (matching your dev server)
- **Firebase Emulators**: Automatically starts `pnpm emu:data` before tests
- **Web Server Integration**: Starts your Angular dev server after emulators
- **Multiple Projects**: Tests run on different browsers and mobile viewports
- **Screenshots & Videos**: Captured on test failures
- **Traces**: Available for debugging failed tests

## Firebase Testing Features

### Automatic Emulator Management
- Emulators start automatically with test data import
- Clean state for each test (auth users and Firestore data cleared)
- Project ID: `pip-cost-sharing` (matches your Firebase project)

### Firebase Utilities
- `createTestUser()` - Create test users in Auth emulator
- `addFirestoreTestData()` - Add test data to Firestore
- `clearFirebaseData()` - Clean up between tests
- `waitForFirebaseEmulators()` - Ensure emulators are ready

### Test Fixtures
- `cleanFirebase` - Ensures clean Firebase state for each test
- `firebasePage` - Page with Firebase emulators pre-configured

## Page Object Model

Tests use the Page Object Model pattern for better maintainability:

1. **BasePage**: Common functionality for all pages
2. **Specific Pages**: Each page has its own class (e.g., `HomePage`)
3. **Locators**: Using data-testid attributes for reliable element selection

## Test Utilities

The `utils/helpers.ts` file provides common functions:

- `waitForAngular()` - Wait for Angular to stabilize
- `fillAndValidate()` - Fill forms and wait for validation
- `mockApiResponse()` - Mock API calls for testing
- `clearStorage()` - Clear browser storage between tests

## Best Practices

1. Use `data-testid` attributes in your Angular components for reliable element selection
2. Utilize the Page Object Model for organizing test code
3. Use meaningful test descriptions and organize tests in describe blocks
4. Mock external API calls when appropriate
5. Keep tests independent and atomic

## Adding New Tests

1. Create test files in appropriate subdirectories under `e2e/`
2. Use the `test` import from `fixtures/index.ts` for consistent setup
3. Create page objects for new pages in the `pages/` directory
4. Add test data constants to `constants/index.ts`

## Example Test Structure

```typescript
import { test, expect } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { TEST_DATA } from '../constants';

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ firebasePage }) => {
    const authPage = new AuthPage(firebasePage);
    
    // Create and login test user
    await authPage.createAndLoginTestUser();
    
    // Verify login success
    await expect(authPage.isLoggedIn()).resolves.toBe(true);
  });

  test('should handle invalid login', async ({ firebasePage }) => {
    const authPage = new AuthPage(firebasePage);
    await authPage.gotoLogin();
    
    // Try login with invalid credentials
    await authPage.login(TEST_DATA.validEmail, 'wrongpassword');
    
    // Verify error message
    await expect(authPage.errorMessage).toBeVisible();
  });
});
```

## Browser Installation

If you need to reinstall browsers:

```bash
pnpm e2e:install
```
