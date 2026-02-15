# E2E Testing Patterns and Best Practices

This document captures patterns and best practices learned from developing and fixing e2e tests, particularly from the `expense-to-payment-flow.spec.ts` implementation. These patterns ensure reliable, maintainable tests that work consistently across environments.

## Table of Contents

1. [Material MDC Selectors](#1-material-mdc-selectors)
2. [Component-Prefixed TestID Patterns](#2-component-prefixed-testid-patterns)
3. [Expandable Row Patterns](#3-expandable-row-patterns)
4. [Copy-to-Clipboard Patterns](#4-copy-to-clipboard-patterns)
5. [Date Input Patterns](#5-date-input-patterns)
6. [Auto-Add Members Feature](#6-auto-add-members-feature)
7. [Timing and Wait Strategies](#7-timing-and-wait-strategies)
8. [Page Object Patterns](#8-page-object-patterns)
9. [LoadingService Integration](#9-loadingservice-integration)
10. [Fixture Usage](#10-fixture-usage)
11. [Common Pitfalls and Solutions](#11-common-pitfalls-and-solutions)

---

## 1. Material MDC Selectors

### What Changed

Angular Material migrated to MDC (Material Design Components), which changed CSS class names across the library. Tests must use the new MDC-prefixed selectors.

### Pattern

**Material Tables:**
```typescript
// CORRECT - MDC selectors
this.summaryTable = page.locator('table.mat-mdc-table');
this.summaryRows = page.locator('table.mat-mdc-table tbody tr.mat-mdc-row');

// INCORRECT - Old Material selectors (will not match)
this.summaryTable = page.locator('table.mat-table');
this.summaryRows = page.locator('table.mat-table tbody tr.mat-row');
```

**Why `tbody tr.mat-mdc-row`?**
- Specifically targets data rows in table body
- Excludes header rows which also have `.mat-mdc-row` class
- More precise than just `tr.mat-mdc-row`

### Key Class Mappings

| Old Material | New MDC | Usage |
|--------------|---------|-------|
| `.mat-table` | `.mat-mdc-table` | Table container |
| `.mat-row` | `.mat-mdc-row` | Table rows (header and body) |
| `.mat-cell` | `.mat-mdc-cell` | Table cells |
| `.mat-error` | `.mat-error` | Form validation errors (no MDC variant!) |

**Important Exception:** `mat-error` for form validation errors does NOT have an MDC variant. Continue using `.mat-error` for form validation messages.

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 58-64
- [`e2e/pages/history.page.ts`](pages/history.page.ts) - Lines 54-61

---

## 2. Component-Prefixed TestID Patterns

### Pattern

Components use prefixed test IDs to avoid naming collisions and clarify element ownership. This is especially important in applications with many similar elements across components.

### Examples

**Summary Component** (prefix: `summary-`):
```typescript
this.pageTitle = page.getByTestId('summary-page-title');
this.helpButton = page.getByTestId('summary-help-button');
this.tourButton = page.getByTestId('summary-tour-button');
this.loadingMessage = page.getByTestId('loading-summary-message');
```

**History Component** (prefix: `history-`):
```typescript
this.pageTitle = page.getByTestId('history-page-title');
this.helpButton = page.getByTestId('history-help-button');
this.tourButton = page.getByTestId('history-tour-button');
this.loadingMessage = page.getByTestId('loading-history-message');
```

**Expenses Component** (prefix: `add-expense-`):
```typescript
this.addExpenseContainer = page.getByTestId('add-expense-container');
this.addExpenseForm = page.getByTestId('add-expense-form');
this.tourButton = page.getByTestId('add-expense-tour-button');
```

### Benefits

1. **Prevents Collisions:** Multiple components can have "help-button" without conflicts
2. **Clarifies Ownership:** `summary-help-button` clearly belongs to Summary component
3. **Easier Debugging:** Know which component an element belongs to
4. **Better Searchability:** Easy to find all testids for a specific component in codebase

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 44-47
- [`e2e/pages/history.page.ts`](pages/history.page.ts) - Lines 42-45
- [`e2e/pages/expenses.page.ts`](pages/expenses.page.ts) - Lines 56-59

---

## 3. Expandable Row Patterns

### How It Works

Summary and History components use expandable detail rows. **Critical insight:** The detail row elements remain in the DOM but their content is conditionally rendered and hidden using CSS.

### Pattern

```typescript
// Row locators
readonly expandButtons: Locator;  // The main summary row (clickable)
readonly detailRows: Locator;     // The detail row element

constructor(page: Page) {
  // Click entire row to expand/collapse
  this.expandButtons = page.locator('tr.mat-mdc-row.summary-row');
  this.detailRows = page.locator('tr.mat-mdc-row.detail-row');
}

async expandDetail(rowIndex: number): Promise<void> {
  await this.expandButtons.nth(rowIndex).click();
  await this.page.waitForTimeout(300);
}
```

### Testing Pattern

```typescript
// INCORRECT - Checking row count (row stays in DOM when collapsed!)
await summaryPage.expandDetail(0);
let detailCount = await summaryPage.detailRows.count();
expect(detailCount).toBe(1);  // ✓ Passes when expanded

await summaryPage.expandDetail(0);  // Collapse
detailCount = await summaryPage.detailRows.count();
expect(detailCount).toBe(0);  // ✗ FAILS! Row still exists in DOM

// CORRECT - Checking content visibility
await summaryPage.expandDetail(0);
const detailContent = summaryPage.detailRows
  .first()
  .locator('.detail-table-container');
await expect(detailContent).toBeVisible();  // ✓ Content is visible

await summaryPage.expandDetail(0);  // Collapse
await expect(detailContent).not.toBeVisible();  // ✓ Content is hidden
```

### Key Insight

**The row element persists, but its content (`.detail-table-container`) is conditionally rendered.** Always check visibility of content, not existence of row elements.

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 63-64, 141-143
- [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) - Lines 414-424

---

## 4. Copy-to-Clipboard Patterns

### Pattern

Copy-to-clipboard functionality is triggered by **clicking the expanded detail content**, not a separate copy button. Tests must grant clipboard permissions and check for clipboard support.

### Requirements

1. **Use correct fixture:** `firebasePage` (grants clipboard permissions)
2. **Check clipboard support:** `TEST_CONFIG.supportsClipboard`
3. **Click detail content:** Not a separate button

### Implementation

```typescript
// In test file
import { TEST_CONFIG } from '../constants';

test('should copy to clipboard', async ({ firebasePage }) => {
  // Skip if clipboard not supported in current environment
  if (!TEST_CONFIG.supportsClipboard) {
    test.skip();
    return;
  }

  const historyPage = new HistoryPage(firebasePage);

  // Expand detail and click detail content to copy
  await historyPage.copyToClipboard(0);

  // Verify success message
  await expect(historyPage.snackbar).toContainText('copied');
});
```

### Page Object Pattern

```typescript
async copyToClipboard(rowIndex: number): Promise<void> {
  // Expand the detail row first
  await this.expandDetail(rowIndex);

  // Click on the detail content to trigger copy
  const detailContent = this.detailRows.nth(rowIndex).locator('.detail-table-container');
  await detailContent.click();

  await this.page.waitForTimeout(500);
}
```

### Clipboard Permissions

Clipboard permissions are granted in the `firebasePage` fixture:

```typescript
// In e2e/fixtures/index.ts
firebasePage: async ({ page, cleanFirebase }, use) => {
  // Grant clipboard permissions for copy-to-clipboard tests
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await use(page);
}
```

### Configuration

```typescript
// In e2e/constants/index.ts
export const TEST_CONFIG = {
  baseUrl: 'http://localhost:4200',  // localhost enables Clipboard API
  supportsClipboard: true,            // Always true since we use localhost
  // ...
}
```

### Why Clipboard Tests Can Fail

- **Wrong fixture:** Using `page` instead of `firebasePage` (no permissions granted)
- **Wrong domain:** Non-localhost HTTP domains block clipboard (we now use localhost)
- **Automated environment:** Some CI environments restrict clipboard access despite permissions

### Reference Files
- [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) - Lines 312-361
- [`e2e/fixtures/index.ts`](fixtures/index.ts) - Lines 44-49
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 174-181

---

## 5. Date Input Patterns

### Pattern

Mat-datepicker inputs may not have testids. Use label-based selectors when testids are unavailable. Each date input has its own clear button that appears conditionally.

### Selector Strategies

```typescript
// Strategy 1: Label-based selectors (when no testid)
this.startDateInput = page.getByLabel('Start date');
this.endDateInput = page.getByLabel('End date');

// Strategy 2: Testid-based selectors (preferred when available)
this.startDateInput = page.getByTestId('start-date-input');
this.endDateInput = page.getByTestId('end-date-input');
```

### Filling Dates

```typescript
async filterByDateRange(startDate?: Date, endDate?: Date): Promise<void> {
  if (startDate) {
    await this.startDateInput.fill(startDate.toLocaleDateString());
    await this.startDateInput.blur();  // Trigger validation
  }
  if (endDate) {
    await this.endDateInput.fill(endDate.toLocaleDateString());
    await this.endDateInput.blur();
  }
  await this.page.waitForTimeout(500);  // Wait for filter to apply
}
```

### Clearing Dates

**Critical insight:** Each date input has its own clear button with `aria-label="Clear"` that only appears when a value exists.

```typescript
async clearFilters(): Promise<void> {
  // Each date input has its own clear button
  const clearButtons = this.page.locator('button[aria-label="Clear"]');
  const count = await clearButtons.count();

  // Click from right to left to avoid index shifts as buttons disappear
  for (let i = count - 1; i >= 0; i--) {
    await clearButtons.nth(i).click();
    await this.page.waitForTimeout(200);
  }

  await this.page.waitForTimeout(300);
}
```

### Template Pattern (from component HTML)

```html
@if (!startDate()) {
  <mat-datepicker-toggle matIconSuffix [for]="startDatepicker"></mat-datepicker-toggle>
} @else {
  <button matIconSuffix aria-label="Clear" (click)="startDate.set(null)">
    <mat-icon>close</mat-icon>
  </button>
}
```

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 52-54, 126-139
- [`src/app/components/summary/summary/summary.component.html`](../src/app/components/summary/summary/summary.component.html) - Lines 59-83

---

## 6. Auto-Add Members Feature

### How It Works

When a group is created with "auto-add members" enabled, the expense form automatically adds all group members as splits when an amount is entered. The amounts are equally divided among members.

### Testing Pattern

**With Auto-Add Enabled (Simpler Tests):**
```typescript
// Create group with auto-add enabled
await groupsPage.createGroup('Test Group', 'Admin User', true);

// Add second member to group
await firebasePage.goto('/members');
await firebasePage.click('[data-testid="add-member-button"]');
await firebasePage.fill('[data-testid="member-name-input"]', 'Test User');
await firebasePage.fill('[data-testid="member-email-input"]', 'testuser@example.com');
await firebasePage.click('[data-testid="add-member-save-button"]');
await firebasePage.waitForTimeout(1500);

// Create expense - splits auto-populate!
await expensesPage.gotoAddExpense();
await expensesPage.fillExpenseForm({
  description: 'Team Lunch',
  amount: 100,  // Will be split equally: Admin $50, Test User $50
});

// IMPORTANT: Wait for auto-added splits to appear and allocate
await firebasePage.waitForTimeout(1500);

await expensesPage.saveExpense();
```

**Without Auto-Add (Control Specific Amounts):**
```typescript
// Create group with auto-add DISABLED
await groupsPage.createGroup('Test Group', 'Admin User', false);

// Must manually add splits
await expensesPage.addSplit('Admin User', 50);
await expensesPage.addSplit('Test User', 50);
```

### Critical Timing

**Wait 1500ms after filling amount** to allow:
1. Auto-add to detect amount change
2. All members to be added as splits
3. Amounts to be equally allocated
4. Form validation to complete

### When to Use Each Approach

| Scenario | Auto-Add | Reason |
|----------|----------|--------|
| Testing equal splits | ✓ Enabled | Simpler test setup |
| Testing mutual debts | ✗ Disabled | Need specific amounts |
| Testing net calculations | ✗ Disabled | Control exact split values |
| Testing general workflow | ✓ Enabled | Matches real usage |

### Reference Files
- [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) - Lines 24, 50-61, 158-180
- [`e2e/pages/groups.page.ts`](pages/groups.page.ts) - Lines 135-149

---

## 7. Timing and Wait Strategies

### Consistent Timeout Values

Use these standard timeout values consistently across all tests:

```typescript
// Short waits - UI updates
await this.page.waitForTimeout(300);  // Dropdown close, expand/collapse

// Medium waits - Form state changes
await this.page.waitForTimeout(500);  // Filter changes, blur events, form validation

// Long waits - Async backend operations
await this.page.waitForTimeout(1500); // Auto-add members, save operations, Firebase writes
await this.page.waitForTimeout(2000); // Group creation, complex dialogs
```

### When to Use Which Wait

| Scenario | Method | Timeout |
|----------|--------|---------|
| Page navigation | `waitForLoadingComplete()` | 10s |
| Element appears | `waitFor({ state: 'visible' })` | 5s |
| Element disappears | `waitFor({ state: 'hidden' })` | 10s |
| UI animation | `waitForTimeout()` | 300ms |
| Form updates | `waitForTimeout()` | 500ms |
| Backend operations | `waitForTimeout()` | 1500ms |
| Dialog transitions | `waitForTimeout()` | 1000-2000ms |
| Test timeout | `test.setTimeout()` | 60000ms |

### Avoid Arbitrary Timeouts

```typescript
// WRONG - Random values without reason
await this.page.waitForTimeout(237);
await this.page.waitForTimeout(850);
await this.page.waitForTimeout(3472);

// RIGHT - Consistent, documented values
await this.page.waitForTimeout(300);   // UI updates
await this.page.waitForTimeout(500);   // Form state
await this.page.waitForTimeout(1500);  // Backend operations
```

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 86-106
- [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) - Throughout

---

## 8. Page Object Patterns

### Base Structure

All page objects should extend `BasePage` and follow this structure:

```typescript
import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class ComponentPage extends BasePage {
  // 1. Define all locators as readonly class properties
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly table: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    super(page);

    // 2. Initialize locators in constructor
    // Use getByTestId for elements with test IDs
    this.pageTitle = page.getByTestId('component-page-title');
    this.helpButton = page.getByTestId('component-help-button');

    // Use Material MDC selectors for tables
    this.table = page.locator('table.mat-mdc-table');
    this.rows = page.locator('table.mat-mdc-table tbody tr.mat-mdc-row');

    // Use getByLabel for form inputs without testids
    this.startDateInput = page.getByLabel('Start date');
  }

  // 3. Navigation with loading wait
  async goto(): Promise<void> {
    await this.page.goto('/route');
    await this.waitForLoadingComplete();
  }

  // 5. Action methods with appropriate waits
  async performAction(): Promise<void> {
    await this.button.click();
    await this.page.waitForTimeout(500);  // Wait for action to process
  }
}
```

### Locator Selection Priority

1. **data-testid** - Preferred for most elements
2. **getByLabel()** - For form inputs without testids
3. **Material MDC selectors** - For Material table/row elements
4. **aria-label** - For icon buttons and accessibility elements
5. **:has-text()** - Last resort for dynamic content

### Action Methods

Always include appropriate waits after actions:

```typescript
async openDialog(): Promise<void> {
  await this.openButton.click();
  await expect(this.dialog).toBeVisible();
  await this.page.waitForTimeout(500);  // Dialog animation
}

async submitForm(): Promise<void> {
  await this.saveButton.click();
  await expect(this.dialog).toBeHidden();
  await this.page.waitForTimeout(1000);  // Backend processing
}
```

### Reference Files
- [`e2e/pages/base.page.ts`](pages/base.page.ts) - Base class implementation
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Exemplar implementation
- [`e2e/pages/history.page.ts`](pages/history.page.ts) - Another exemplar

---

## 9. LoadingService Integration

### How It Works

The application uses a `LoadingService` that displays a full-screen overlay with a loading indicator when `loadingOn()` is called. This overlay **covers the entire screen**, disabling all interactions until loading completes.

### Pattern

**In Page Objects:**
```typescript
// Define loading message locator
readonly loadingMessage: Locator;

constructor(page: Page) {
  super(page);
  this.loadingMessage = page.getByTestId('loading-summary-message');
  // Or: page.locator('[data-testid="loading-component"]')
}
```

**In Tests (Navigation):**
```typescript
test('should navigate to page', async ({ page }) => {
  await page.goto('/summary');
  await page.waitForSelector('app-root', { timeout: 10000 });

  // Wait for loading overlay
  await Promise.race([
    page.locator('[data-testid="loading-component"]')
      .waitFor({ state: 'visible', timeout: 2000 })
      .catch(() => {}),
    page.waitForTimeout(500),
  ]);

  const isLoadingVisible = await page.locator('[data-testid="loading-component"]')
    .isVisible()
    .catch(() => false);
  if (isLoadingVisible) {
    await page.locator('[data-testid="loading-component"]')
      .waitFor({ state: 'hidden', timeout: 10000 });
  }

  // Now safe to interact with page
  await expect(page).toHaveURL('/summary');
});
```

### Backdrop Handling

Material dialogs and overlays create a backdrop. Sometimes this needs explicit dismissal:

```typescript
const backdrop = this.page.locator('.cdk-overlay-backdrop');
const isBackdropVisible = await backdrop.isVisible().catch(() => false);
if (isBackdropVisible) {
  await backdrop.click({ force: true });
  await this.page.waitForTimeout(500);
}
```

### Why This Matters

**Without LoadingService waits:**
- Tests try to interact with elements before they're ready
- Selectors timeout waiting for elements still loading
- Flaky tests that pass/fail based on load timing

**With LoadingService waits:**
- Tests reliably wait for app to be ready
- No premature interaction with disabled elements
- Consistent behavior across fast and slow environments

### Reference Files
- [`e2e/pages/summary.page.ts`](pages/summary.page.ts) - Lines 86-106
- [`e2e/pages/groups.page.ts`](pages/groups.page.ts) - Lines 156-161 (backdrop)
- [`CLAUDE.md`](../CLAUDE.md) - LoadingService architecture notes

---

## 10. Fixture Usage

### Three Fixtures Available

```typescript
// In e2e/fixtures/index.ts
export const test = base.extend<TestFixtures>({
  cleanFirebase: async ({ page }, use) => {
    // Clears Firebase data before AND after test
    await clearFirebaseData(page);
    await configureFirebaseEmulators(page);
    await use();
    await clearFirebaseData(page);
  },

  firebasePage: async ({ page, cleanFirebase }, use) => {
    // Clean state + clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await use(page);
  },

  preserveDataFirebasePage: async ({ page }, use) => {
    // Preserves seed data + clipboard permissions
    await configureFirebaseEmulators(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await use(page);
    // Does NOT clear data
  },
});
```

### When to Use Each Fixture

| Fixture | Use When | Clears Data | Clipboard | Example |
|---------|----------|-------------|-----------|---------|
| `page` | No Firebase needed | N/A | ❌ | Public page navigation |
| `firebasePage` | Need clean test state | ✓ Before & after | ✓ | Expense creation, payments |
| `preserveDataFirebasePage` | Need existing seed data | ❌ Never | ✓ | Login with existing user |

### Examples

**Use `page` for public pages:**
```typescript
test('should navigate to home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/PipSplit/i);
});
```

**Use `firebasePage` for tests needing clean state:**
```typescript
test('should create and pay expense', async ({ firebasePage }) => {
  const authPage = new AuthPage(firebasePage);
  const expensesPage = new ExpensesPage(firebasePage);

  await authPage.createAndLoginTestUser();
  await expensesPage.gotoAddExpense();
  // Test starts with clean Firebase state
});
```

**Use `preserveDataFirebasePage` for seed data:**
```typescript
test('should login with existing user', async ({ preserveDataFirebasePage }) => {
  const authPage = new AuthPage(preserveDataFirebasePage);

  // Seed data from emulators still exists
  await authPage.gotoLogin();
  await authPage.login('seed@example.com', 'password');
});
```

### Clipboard Tests MUST Use Firebase Fixtures

```typescript
// WRONG - No clipboard permissions
test('should copy to clipboard', async ({ page }) => {
  await summaryPage.copyToClipboard(0);  // FAILS!
});

// CORRECT - Has clipboard permissions
test('should copy to clipboard', async ({ firebasePage }) => {
  if (!TEST_CONFIG.supportsClipboard) {
    test.skip();
    return;
  }
  await summaryPage.copyToClipboard(0);  // Works!
});
```

### Reference Files
- [`e2e/fixtures/index.ts`](fixtures/index.ts) - Fixture definitions
- [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) - `firebasePage` usage

---

## 11. Common Pitfalls and Solutions

### Pitfall 1: Direct Page Usage Instead of Page Objects

```typescript
// ❌ WRONG - Direct page manipulation
test('should navigate', async ({ page }) => {
  await page.goto('/groups');
  await page.click('[data-testid="new-group-button"]');
  await page.fill('[data-testid="group-name"]', 'Test');
});

// ✅ CORRECT - Use page objects
test('should navigate', async ({ firebasePage }) => {
  const groupsPage = new GroupsPage(firebasePage);
  await groupsPage.goto();
  await groupsPage.openAddGroupDialog();
  await groupsPage.fillGroupForm({ name: 'Test' });
});
```

**Why:** Page objects encapsulate selector logic, provide reusable methods, and make tests more maintainable.

### Pitfall 2: Missing LoadingService Waits

```typescript
// ❌ WRONG - No loading wait
async goto(): Promise<void> {
  await this.page.goto('/summary');
  // Missing loading wait!
}

// ✅ CORRECT - Wait for loading
async goto(): Promise<void> {
  await this.page.goto('/summary');
  await this.waitForLoadingComplete();
}
```

**Why:** The app shows a full-screen loading overlay. Tests must wait for it to disappear before interacting with elements.

### Pitfall 3: Using Wrong Fixture

```typescript
// ❌ WRONG - No clipboard permissions
test('should copy', async ({ page }) => {
  await historyPage.copyToClipboard(0);  // Fails!
});

// ❌ WRONG - Clears seed data you need
test('should use seed data', async ({ firebasePage }) => {
  // Seed data was cleared!
});

// ✅ CORRECT - Right fixture for clipboard
test('should copy', async ({ firebasePage }) => {
  await historyPage.copyToClipboard(0);
});

// ✅ CORRECT - Preserves seed data
test('should use seed data', async ({ preserveDataFirebasePage }) => {
  // Seed data still exists
});
```

### Pitfall 4: Inconsistent Timeout Values

```typescript
// ❌ WRONG - Random values
await page.waitForTimeout(237);
await page.waitForTimeout(1843);

// ✅ CORRECT - Standard values
await page.waitForTimeout(300);   // UI updates
await page.waitForTimeout(500);   // Form state
await page.waitForTimeout(1500);  // Backend operations
```

**Why:** Consistent timeouts make tests predictable and easier to maintain.

### Pitfall 5: Checking Row Count Instead of Content Visibility

```typescript
// ❌ WRONG - Detail row stays in DOM when collapsed
await summaryPage.expandDetail(0);
await summaryPage.expandDetail(0);  // Collapse
expect(await summaryPage.detailRows.count()).toBe(0);  // FAILS!

// ✅ CORRECT - Check content visibility
const detailContent = summaryPage.detailRows.first().locator('.detail-table-container');
await summaryPage.expandDetail(0);
await expect(detailContent).toBeVisible();
await summaryPage.expandDetail(0);  // Collapse
await expect(detailContent).not.toBeVisible();
```

### Pitfall 6: Old Material Selectors

```typescript
// ❌ WRONG - Old Material selectors
this.table = page.locator('table.mat-table');
this.rows = page.locator('tr.mat-row');

// ✅ CORRECT - MDC selectors
this.table = page.locator('table.mat-mdc-table');
this.rows = page.locator('table.mat-mdc-table tbody tr.mat-mdc-row');

// ✅ EXCEPTION - Form errors don't have MDC variant
this.formError = page.locator('mat-error');  // Correct!
```

### Pitfall 7: Not Waiting for Auto-Add Members

```typescript
// ❌ WRONG - Save immediately after filling amount
await expensesPage.fillExpenseForm({ amount: 100 });
await expensesPage.saveExpense();  // Splits not populated yet!

// ✅ CORRECT - Wait for auto-add to complete
await expensesPage.fillExpenseForm({ amount: 100 });
await firebasePage.waitForTimeout(1500);  // Auto-add + allocation
await expensesPage.saveExpense();
```

### Pitfall 8: Generic Selectors Without Context

```typescript
// ❌ WRONG - Too generic, might match multiple elements
await page.locator('mat-option').click();
await page.locator('button').click();

// ✅ CORRECT - Specific with context
await page.locator('mat-option:has-text("Test User")').click();
await page.getByTestId('submit-button').click();
```

---

## Quick Reference

### Standard Timeout Values
- **300ms** - UI animations, expand/collapse
- **500ms** - Form state changes, filters
- **1500ms** - Backend operations, auto-add members
- **2000ms** - Dialog transitions, complex operations
- **60000ms** - Test timeout for e2e flows

### Selector Priority
1. `getByTestId()` - Most reliable
2. `getByLabel()` - Form inputs
3. `.mat-mdc-*` - Material components
4. `[aria-label]` - Icon buttons
5. `:has-text()` - Last resort

### Fixture Selection
- **Public pages** → `page`
- **Clean state + Firebase** → `firebasePage`
- **Preserve seed data** → `preserveDataFirebasePage`
- **Clipboard tests** → MUST use Firebase fixture

### Loading Waits
Always use:
```typescript
await page.waitForSelector('app-root', { timeout: 10000 });
await Promise.race([loading wait, content wait]);
if (loading visible) await wait for hidden;
```

---

## Reference Files

| Pattern | Exemplar File | Lines |
|---------|---------------|-------|
| Material MDC Selectors | [`e2e/pages/summary.page.ts`](pages/summary.page.ts) | 58-64 |
| Component Prefixes | [`e2e/pages/history.page.ts`](pages/history.page.ts) | 42-45 |
| Expandable Rows | [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) | 414-424 |
| Clipboard | [`e2e/pages/summary.page.ts`](pages/summary.page.ts) | 174-181 |
| Date Inputs | [`e2e/pages/summary.page.ts`](pages/summary.page.ts) | 126-139 |
| Auto-Add Members | [`e2e/critical-flows/expense-to-payment-flow.spec.ts`](critical-flows/expense-to-payment-flow.spec.ts) | 24, 50-61 |
| Timing | [`e2e/pages/summary.page.ts`](pages/summary.page.ts) | 86-106 |
| Page Objects | [`e2e/pages/base.page.ts`](pages/base.page.ts) | Full file |
| LoadingService | [`e2e/pages/summary.page.ts`](pages/summary.page.ts) | 86-106 |
| Fixtures | [`e2e/fixtures/index.ts`](fixtures/index.ts) | 44-72 |

---

**Last Updated:** 2026-02-07
**Based on:** expense-to-payment-flow.spec.ts implementation and debugging
