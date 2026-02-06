# E2E Test Update Implementation

## Status: COMPLETE

## Summary
Updated all existing e2e tests to match the current state of the application after route restructuring and UI changes.

## Changes Made

### 1. `e2e/constants/index.ts` - DONE
- Fixed `navbar` selector: `"navbar"` → `"main-toolbar"`
- Fixed `menuButton` selector: `"menu-button"` → `"mobile-menu-toggle"`
- Fixed `loadingSpinner` selector: `"loading-spinner"` → `"loading-component"`
- Fixed `errorMessage` selector: `"error-message"` → `'[role="alert"], mat-error'`
- Fixed `successMessage` selector: `"success-message"` → `'simple-snack-bar'`

### 2. `e2e/pages/home.page.ts` - DONE
- Fixed `title` test ID: `"app-title"` → `"welcome-title"`
- Fixed `navigationToolbar` test ID: `"navigation-toolbar"` → `"main-toolbar"`
- Fixed `themeToggleButton` test ID: `"theme-toggle"` → `"theme-toggle-desktop"`
- Fixed `splitPageLink` test ID: `"split-page-link"` → `"split-expense-button"`
- Fixed `isAuthenticated()`: `"user-menu"` → `"logout-button-desktop"`

### 3. `e2e/pages/auth.page.ts` - DONE
- Fixed `logout()` spinner selector: `.spinner-container, .loading` → `[data-testid="loading-component"]`
- Fixed `logout()` button selector: matTooltip-based → `[data-testid="logout-button-desktop"]`
- Fixed `isLoggedIn()` logout button: matTooltip-based → `[data-testid="logout-button-desktop"]`
- Fixed `isLoggedIn()` account button: matTooltip-based → `[data-testid="nav-account-desktop"]`
- Fixed `isLoggedIn()` groups link: `a[routerlink="groups"]` → `[data-testid="nav-groups"]`
- Fixed `isLoggedIn()` login button: routerlink-based → `[data-testid="nav-login-desktop"]`

### 4. `e2e/pages/groups.page.ts` - DONE
- Fixed `goto()` route: `/groups` → `/administration/groups`
- Fixed `helpButton` test ID: `"help-button"` → `"groups-help-button"`
- Fixed `verifyPageLoaded()`: Removed `manageGroupsButton` assertion (only visible when user has groups)

### 5. `e2e/navigation.spec.ts` - DONE
- Updated all protected route paths to canonical URLs:
  - `/groups` → `/administration/groups`
  - `/members` → `/administration/members`
  - `/categories` → `/administration/categories`
  - `/summary` → `/analysis/summary`
  - `/history` → `/analysis/history`

### 6. `e2e/groups.spec.ts` - DONE
- Changed import from `@playwright/test` to `./fixtures`
- Changed `beforeEach` to use `firebasePage` fixture instead of raw `page`

### 7. `e2e/groups-direct.spec.ts` - DONE
- Changed import from `@playwright/test` to `./fixtures`
- Changed to use `preserveDataFirebasePage` fixture
- Replaced hardcoded `http://localhost:4200` with `TEST_CONFIG.baseUrl`
- Updated route from `/groups` to `/administration/groups`
- Replaced `#group-select` selector with `[data-testid="group-select"]`
- Replaced text-based button selectors with `[data-testid="new-group-button"]`
- Removed stale "Join Group" button reference

### 8. `e2e/debug-auth-persistence.spec.ts` - DONE
- Fixed `account_circle` icon → `[data-testid="nav-account-desktop"]`
- Fixed `mattooltip="Log out"` → `[data-testid="logout-button-desktop"]`
- Fixed route `/groups` → `/administration/groups`

### 9. `e2e/debug-login-state.spec.ts` - DONE
- Fixed logout button selector → `[data-testid="logout-button-desktop"]`
- Fixed account button selector → `[data-testid="nav-account-desktop"]`
- Fixed account icon → `manage_accounts`

### 10. `e2e/debug-logout.spec.ts` - DONE
- Fixed all `mattooltip="Log out"` → `[data-testid="logout-button-desktop"]`
- Fixed all `mattooltip="Account"` → `[data-testid="nav-account-desktop"]`

### 11. `e2e/debug-auth-flow.spec.ts` - DONE
- Fixed `account_circle` icon → `[data-testid="nav-account-desktop"]`

### 12. `e2e/utils/firebase.ts` - DONE (Login fix)
- Fixed `createTestUser` endpoint: old v3 endpoint (`/www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser`) → v1 endpoint (`/identitytoolkit.googleapis.com/v1/accounts:signUp`)
- Added Step 2: After user creation, calls `/accounts:update` with `emailVerified: true` so users can pass `authGuard`
- Added Step 3: Passes `additionalClaims` to `setCustomClaims` if provided (instead of mixing them into signUp body)
- Added error handling with descriptive messages for both signUp and update calls

### No changes needed:
- `e2e/pages/base.page.ts`
- `e2e/debug-login.spec.ts`
- `e2e/debug-register.spec.ts`
- `e2e/debug-firebase-fixture.spec.ts`
- `e2e/groups-debug.spec.ts` (inherits route fix from groups.page.ts)
- `e2e/auth.spec.ts`
- `e2e/auth-unauthenticated.spec.ts`
- `e2e/auth-authenticated.spec.ts`
- `e2e/homepage.spec.ts`
- `e2e/homepage-basic.spec.ts`
