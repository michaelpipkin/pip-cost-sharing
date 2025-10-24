# Currency Internationalization Implementation Plan

## Progress Status

**Last Updated**: Session completing Phase 5
**Overall Progress**: 10 of 39 TODOs completed (25.6%)
**Current Phase**: Phase 5 ✅ COMPLETED

### Completed Phases:
- ✅ **Phase 1: Data Model & Currency Configuration** (3/3 TODOs)
  - Created CurrencyConfig interface with 9 supported currencies (alphabetically sorted)
  - Updated Group model with currency fields
  - Added currency selection to AddGroupComponent and ManageGroupsComponent
  - Added hasExpensesForGroup() helper to ExpenseService
  - Currency field conditionally disables when expenses exist

- ✅ **Phase 2: Locale Service** (2/2 TODOs)
  - Created LocaleService with reactive currency management
  - Automatically watches GroupStore.currentGroup() signal
  - Provides currency formatting, rounding, and decimal format utilities
  - No manual integration needed - updates automatically on group changes

- ✅ **Phase 3: Group UI** (3/3 TODOs)
  - AddGroupComponent has currency selector with all supported currencies
  - ManageGroupsComponent has currency field that conditionally disables when expenses exist
  - Forms include proper validation and helpful hints
  - Currency data (code, symbol, decimalPlaces) is saved to Group documents

- ✅ **Phase 4: Currency Pipe** (1/1 TODO)
  - Refactored currency.pipe.ts to inject and use LocaleService
  - Replaced hardcoded 'en-US' locale and '$' symbol with dynamic formatting
  - Pipe now automatically uses current group's currency settings

- ✅ **Phase 5: Input Directive** (1/1 TODO)
  - Refactored FormatCurrencyInputDirective to inject and use LocaleService
  - Replaced hardcoded '1.2-2' decimal format with dynamic pattern from LocaleService
  - Directive now uses browser locale for number formatting
  - Automatically adapts to different decimal places (e.g., 0 for JPY, 2 for USD)

### Next Steps:
- **Phase 6: Templates** (0/11 TODOs)
- **Phase 7: Number Formatting** (0/4 TODOs)
- And more...

---

## Overview
Generalize the application to support multiple currencies based on group-level settings, replacing hardcoded USD assumptions throughout the codebase.

## Core Principles
1. **Currency is a GROUP-level property** - All expenses within a group use the same currency
2. **Set at group creation** - Currency code selected when creating a group
3. **Immutable with expenses** - Cannot change currency once expenses exist for a group
4. **Locale-aware formatting** - Use browser locale for number/date formatting preferences
5. **No exchange rates** - We do NOT support multi-currency conversions

## Current State Analysis

### Hardcoded Assumptions (43+ files affected)
- **Currency Symbol**: Hardcoded `$` in 13 HTML templates
- **Locale**: Hardcoded `'en-US'` in currency pipe and 4 components
- **Decimal Places**: Hardcoded `.toFixed(2)` in 40+ locations
- **Decimal Separator**: Assumes `.` as decimal separator

### Key Files Requiring Changes

#### Core Infrastructure
- `src/app/shared/pipes/currency.pipe.ts` - Custom currency pipe (100+ uses)
- `src/app/shared/directives/format-currency-input.directive.ts` - Input formatting (30+ uses)
- `src/app/app.config.ts` - DecimalPipe configuration

#### Components with Hardcoded Formatting
- `src/app/components/summary/summary.component.ts`
- `src/app/components/split/split/split.component.ts`
- `src/app/components/history/history.component.ts`
- `src/app/components/expenses/expenses.component.ts`

#### Utilities with Rounding Logic
- `src/app/utilities/allocation-utils.service.ts` (10+ .toFixed instances)
- `src/app/utilities/string-utils.service.ts`

#### Templates with $ Symbol (13 files)
- `src/app/components/expenses/add-expense/add-expense.component.html`
- `src/app/components/expenses/edit-expense/edit-expense.component.html`
- `src/app/components/split/split/split.component.html`
- `src/app/components/memorized/add-memorized/add-memorized.component.html`
- `src/app/components/memorized/edit-memorized/edit-memorized.component.html`
- `src/app/components/history/history.component.html`
- `src/app/components/summary/summary.component.html`
- `src/app/components/members/members.component.html`
- `src/app/components/categories/categories.component.html`
- `src/app/components/groups/groups.component.html`
- Plus help and auth component templates

---

## Implementation Plan

### Phase 1: Data Model & Currency Configuration

#### TODO 1.1: Create Currency Configuration Interface
**File**: `src/app/models/currency-config.interface.ts` (new file)

```typescript
export interface CurrencyConfig {
  code: string;              // ISO 4217 currency code (USD, EUR, GBP, etc.)
  symbol: string;            // Currency symbol ($, €, £, ¥, etc.)
  symbolPosition: 'prefix' | 'suffix';  // Where to place symbol
  decimalPlaces: number;     // Number of decimal places (2 for most, 0 for JPY)
  decimalSeparator: string;  // '.' or ','
  thousandsSeparator: string; // ',' or '.' or ' '
  name: string;              // Display name (US Dollar, Euro, etc.)
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  {
    code: 'USD',
    symbol: '$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'US Dollar'
  },
  {
    code: 'EUR',
    symbol: '€',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    name: 'Euro'
  },
  {
    code: 'GBP',
    symbol: '£',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'British Pound'
  },
  {
    code: 'JPY',
    symbol: '¥',
    symbolPosition: 'prefix',
    decimalPlaces: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Japanese Yen'
  },
  {
    code: 'CAD',
    symbol: 'C$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Canadian Dollar'
  },
  {
    code: 'AUD',
    symbol: 'A$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Australian Dollar'
  },
  {
    code: 'CHF',
    symbol: 'CHF',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Swiss Franc'
  },
  {
    code: 'INR',
    symbol: '₹',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Indian Rupee'
  },
  {
    code: 'MXN',
    symbol: 'MX$',
    symbolPosition: 'prefix',
    decimalPlaces: 2,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    name: 'Mexican Peso'
  }
];

// Helper function to get currency config by code
export function getCurrencyConfig(code: string): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code);
}
```

**Status**: ✅ Completed

---

#### TODO 1.2: Update Group Model
**File**: `src/app/models/group.ts`

Add currency fields to the Group interface:
```typescript
export default interface Group {
  // ... existing fields
  currencyCode: string;        // ISO 4217 code (required)
  currencySymbol: string;      // Display symbol (required)
  decimalPlaces: number;       // Decimal precision (required)
}
```

**Status**: ✅ Completed

---

#### TODO 1.3: Add Form Validators for Currency
**File**: `src/app/components/groups/groups.component.ts`

Handle currency validation at the application layer instead of Firestore rules:

**For Add Group Form:**
```typescript
// Currency is required via Validators.required on the currencyCode control
this.addGroupForm = this.fb.group({
  groupName: ['', Validators.required],
  currencyCode: ['USD', Validators.required], // Currency is required
});
```

**For Edit Group Form:**
```typescript
// Check if expenses exist and conditionally disable currency field
async onEditGroup(group: Group): Promise<void> {
  this.selectedGroup = group;

  // Check if group has any expenses
  const hasExpenses = await this.expenseService.hasExpensesForGroup(group.id);

  this.editGroupForm = this.fb.group({
    groupName: [group.groupName, Validators.required],
    currencyCode: [
      { value: group.currencyCode, disabled: hasExpenses }, // Disable if expenses exist
      Validators.required
    ],
  });

  this.groupHasExpenses.set(hasExpenses); // For showing in UI
}
```

**For Edit Group Template:**
```html
<mat-form-field appearance="outline">
  <mat-label>Currency</mat-label>
  <mat-select formControlName="currencyCode" required>
    @for (currency of supportedCurrencies; track currency.code) {
      <mat-option [value]="currency.code">
        {{ currency.symbol }} - {{ currency.name }} ({{ currency.code }})
      </mat-option>
    }
  </mat-select>
  @if (groupHasExpenses()) {
    <mat-hint>Cannot be changed once expenses are added to the group</mat-hint>
  }
</mat-form-field>
```

**Add Helper Method to ExpenseService:**
```typescript
// In expense.service.ts
async hasExpensesForGroup(groupId: string): Promise<boolean> {
  const q = query(
    this.expensesCollection,
    where('groupId', '==', groupId),
    limit(1)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}
```

**Status**: ✅ Completed

---

### Phase 2: Locale Service (Core Foundation)

#### TODO 2.1: Create LocaleService
**File**: `src/app/services/locale.service.ts` (new file)

```typescript
import { Injectable, signal, computed, effect } from '@angular/core';
import { CurrencyConfig, getCurrencyConfig } from '@models/currency-config.interface';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  // Browser locale detection
  private browserLocale = signal<string>(
    navigator.language || 'en-US'
  );

  // Current group's currency (set by GroupService)
  private currentCurrencyCode = signal<string>('USD');

  // Computed currency configuration
  currency = computed(() => {
    const code = this.currentCurrencyCode();
    return getCurrencyConfig(code) || getCurrencyConfig('USD')!;
  });

  // Locale for number formatting (can be browser locale)
  locale = this.browserLocale.asReadonly();

  /**
   * Set the current currency based on active group
   * Called by GroupService when group changes
   */
  setGroupCurrency(currencyCode: string): void {
    this.currentCurrencyCode.set(currencyCode);
  }

  /**
   * Format a number as currency using current group's currency
   */
  formatCurrency(value: number): string {
    const curr = this.currency();
    const formatted = Math.abs(value).toLocaleString(this.locale(), {
      minimumFractionDigits: curr.decimalPlaces,
      maximumFractionDigits: curr.decimalPlaces,
    });

    const symbol = curr.symbolPosition === 'prefix'
      ? `${curr.symbol}${formatted}`
      : `${formatted}${curr.symbol}`;

    return value < 0 ? `-${symbol}` : symbol;
  }

  /**
   * Round to currency's decimal places
   */
  roundToCurrency(value: number): number {
    const places = this.currency().decimalPlaces;
    const multiplier = Math.pow(10, places);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Get decimal format pattern for DecimalPipe
   */
  getDecimalFormat(): string {
    const places = this.currency().decimalPlaces;
    return `1.${places}-${places}`;
  }
}
```

**Status**: ✅ Completed

**Note**: The LocaleService automatically watches the GroupStore's currentGroup signal using an effect, so no manual integration with GroupService is needed. The currency updates automatically whenever the current group changes.

---

#### TODO 2.2: Integrate LocaleService with GroupService
**File**: `src/app/services/locale.service.ts`

**Status**: ✅ Completed

**Implementation**: Integration is handled within the LocaleService itself, not in GroupService. The LocaleService constructor includes an effect that watches `GroupStore.currentGroup()`:

```typescript
constructor() {
  // Automatically update currency when current group changes
  effect(() => {
    const group = this.groupStore.currentGroup();
    if (group?.currencyCode) {
      this.currentCurrencyCode.set(group.currencyCode);
    }
  });
}
```

This reactive approach means:
- No manual calls to `setGroupCurrency()` needed
- Currency updates automatically when user switches groups
- Cleaner separation of concerns
- No circular dependency between services

---

### Phase 3: Update Group Creation UI

#### TODO 3.1: Add Currency Selector to Create Group Dialog
**File**: `src/app/components/groups/add-group/add-group.component.html`

In the create group dialog template, add currency selection:

```html
<mat-form-field appearance="outline">
  <mat-label>Currency</mat-label>
  <mat-select formControlName="currencyCode" required>
    @for (currency of supportedCurrencies; track currency.code) {
      <mat-option [value]="currency.code">
        {{ currency.symbol }} - {{ currency.name }} ({{ currency.code }})
      </mat-option>
    }
  </mat-select>
  <mat-hint>Cannot be changed once expenses are added to the group</mat-hint>
</mat-form-field>
```

**Status**: ✅ Completed

---

#### TODO 3.2: Update GroupsComponent Logic
**File**: `src/app/components/groups/add-group/add-group.component.ts`

```typescript
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '@models/currency-config.interface';

export class AddGroupComponent {
  supportedCurrencies = SUPPORTED_CURRENCIES;

  // In addGroup form initialization
  this.addGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    currencyCode: ['USD', Validators.required], // Default to USD
  });

  // In onAddGroup method
  async onAddGroup(): Promise<void> {
    const formValue = this.addGroupForm.getRawValue();
    const currencyConfig = getCurrencyConfig(formValue.currencyCode);

    const newGroup: Group = {
      // ... existing fields
      currencyCode: formValue.currencyCode,
      currencySymbol: currencyConfig.symbol,
      decimalPlaces: currencyConfig.decimalPlaces,
    };

    // ... save to Firestore
  }
}
```

**Status**: ✅ Completed

---

#### TODO 3.3: Update Edit Group Dialog with Conditional Currency Field
**File**: `src/app/components/groups/manage-groups/manage-groups.component.html` and `manage-groups.component.ts`

Update the edit group dialog to:
1. Show currency selector when no expenses exist (enabled)
2. Show disabled currency selector when expenses exist

**In Component TypeScript:**
```typescript
// Add signal to track if group has expenses
groupHasExpenses = signal<boolean>(false);

async onEditGroup(group: Group): Promise<void> {
  this.selectedGroup = group;

  // Check if group has any expenses
  const hasExpenses = await this.expenseService.hasExpensesForGroup(group.id);
  this.groupHasExpenses.set(hasExpenses);

  this.editGroupForm = this.fb.group({
    groupName: [group.groupName, Validators.required],
    currencyCode: [
      { value: group.currencyCode, disabled: hasExpenses },
      Validators.required
    ],
  });
}
```

**In Template:**
```html
<mat-form-field appearance="outline">
  <mat-label>Currency</mat-label>
  <mat-select formControlName="currencyCode" required>
    @for (currency of supportedCurrencies; track currency.code) {
      <mat-option [value]="currency.code">
        {{ currency.symbol }} - {{ currency.name }} ({{ currency.code }})
      </mat-option>
    }
  </mat-select>
  @if (groupHasExpenses()) {
    <mat-hint>Cannot be changed once expenses are added to the group</mat-hint>
  } @else {
    <mat-hint>Select the currency for this group</mat-hint>
  }
</mat-form-field>
```

**Status**: ✅ Completed

---

### Phase 4: Update Currency Pipe

#### TODO 4.1: Refactor Currency Pipe to Use LocaleService
**File**: `src/app/shared/pipes/currency.pipe.ts`

```typescript
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from '@services/locale.service';

@Pipe({
  name: 'currency',
  standalone: true,
})
export class CurrencyPipe implements PipeTransform {
  private localeService = inject(LocaleService);

  transform(value: number): string {
    return this.localeService.formatCurrency(value);
  }
}
```

**Status**: ✅ Completed

---

### Phase 5: Update Currency Input Directive

#### TODO 5.1: Update FormatCurrencyInputDirective
**File**: `src/app/shared/directives/format-currency-input.directive.ts`

The directive has been updated to:
- Inject LocaleService
- Use `localeService.getDecimalFormat()` for dynamic decimal pattern
- Use `localeService.locale()` for browser locale formatting
- Adapt default value based on currency decimal places

Key changes:
```typescript
// Use locale service for dynamic decimal formatting
const pattern = this.localeService.getDecimalFormat();
const locale = this.localeService.locale();
const currency = this.localeService.currency();
const defaultValue = '0'.padEnd(currency.decimalPlaces > 0 ? currency.decimalPlaces + 2 : 1, '.0');

this.el.nativeElement.value =
  this.decimalPipe.transform(calc, pattern, locale) || defaultValue;
```

**Status**: ✅ Completed

---

### Phase 6: Update Templates with Dynamic Currency Symbols

#### TODO 6.1: Update Add Expense Template
**File**: `src/app/components/expenses/add-expense/add-expense.component.html`

Replace all instances of:
```html
<span matTextPrefix>$</span>
```

With:
```html
<span matTextPrefix>{{ localeService.currency().symbol }}</span>
```

**Status**: ⬜ Not Started

---

#### TODO 6.2: Update Edit Expense Template
**File**: `src/app/components/expenses/edit-expense/edit-expense.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.3: Update Split Component Template
**File**: `src/app/components/split/split/split.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.4: Update Add Memorized Template
**File**: `src/app/components/memorized/add-memorized/add-memorized.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.5: Update Edit Memorized Template
**File**: `src/app/components/memorized/edit-memorized/edit-memorized.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.6: Update History Template
**File**: `src/app/components/history/history.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.7: Update Summary Template
**File**: `src/app/components/summary/summary.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.8: Update Members Template
**File**: `src/app/components/members/members.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.9: Update Categories Template
**File**: `src/app/components/categories/categories.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.10: Update Groups Template
**File**: `src/app/components/groups/groups.component.html`

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

#### TODO 6.11: Update Help and Auth Templates
**Files**: Help and auth component templates

Same replacement as 6.1.

**Status**: ⬜ Not Started

---

### Phase 7: Replace Hardcoded Intl.NumberFormat

#### TODO 7.1: Update SummaryComponent
**File**: `src/app/components/summary/summary.component.ts`

Inject LocaleService and replace:
```typescript
new Intl.NumberFormat('en-US', {...})
```

With:
```typescript
this.localeService.formatCurrency(value)
```

**Status**: ⬜ Not Started

---

#### TODO 7.2: Update SplitComponent
**File**: `src/app/components/split/split/split.component.ts`

Same replacement as 7.1.

**Status**: ⬜ Not Started

---

#### TODO 7.3: Update HistoryComponent
**File**: `src/app/components/history/history.component.ts`

Same replacement as 7.1.

**Status**: ⬜ Not Started

---

#### TODO 7.4: Update ExpensesComponent
**File**: `src/app/components/expenses/expenses.component.ts`

Same replacement as 7.1.

**Status**: ⬜ Not Started

---

### Phase 8: Centralize Rounding and Decimal Handling

#### TODO 8.1: Update AllocationUtilsService
**File**: `src/app/utilities/allocation-utils.service.ts`

Replace all `.toFixed(2)` calls with:
```typescript
constructor(private localeService: LocaleService) {}

// Replace:
value.toFixed(2)

// With:
this.localeService.roundToCurrency(value)
```

**Important**: Ensure allocation calculations still balance correctly with different decimal places.

**Status**: ⬜ Not Started

---

#### TODO 8.2: Update StringUtilsService
**File**: `src/app/utilities/string-utils.service.ts`

Same replacement as 8.1.

**Status**: ⬜ Not Started

---

#### TODO 8.3: Update Add Expense Component
**File**: `src/app/components/expenses/add-expense/add-expense.component.ts`

Replace `.toFixed(2)` calls with `localeService.roundToCurrency()`.

**Status**: ⬜ Not Started

---

#### TODO 8.4: Update Edit Expense Component
**File**: `src/app/components/expenses/edit-expense/edit-expense.component.ts`

Same replacement as 8.3.

**Status**: ⬜ Not Started

---

#### TODO 8.5: Update Add Memorized Component
**File**: `src/app/components/memorized/add-memorized/add-memorized.component.ts`

Same replacement as 8.3.

**Status**: ⬜ Not Started

---

#### TODO 8.6: Update Edit Memorized Component
**File**: `src/app/components/memorized/edit-memorized/edit-memorized.component.ts`

Same replacement as 8.3.

**Status**: ⬜ Not Started

---

### Phase 9: Database Migration

#### TODO 9.1: Create Migration Script for Existing Groups
**File**: `functions/src/migrations/add-currency-to-groups.ts` (new file)

```typescript
import * as admin from 'firebase-admin';

export async function migrateCurrencyToGroups() {
  const db = admin.firestore();
  const groupsRef = db.collection('groups');
  const snapshot = await groupsRef.get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    const group = doc.data();

    // Only update if currency fields don't exist
    if (!group.currencyCode) {
      batch.update(doc.ref, {
        currencyCode: 'USD',
        currencySymbol: '$',
        decimalPlaces: 2,
      });
    }
  });

  await batch.commit();
  console.log(`Migrated ${snapshot.docs.length} groups to include currency`);
}
```

**Status**: ⬜ Not Started

---

#### TODO 9.2: Run Migration
Execute the migration script against your Firestore database.

**IMPORTANT**: Test on a backup/staging environment first!

**Status**: ⬜ Not Started

---

### Phase 10: Testing

#### TODO 10.1: Test Group Creation
- Create new groups with different currencies
- Verify currency is saved correctly
- Verify currency cannot be changed in edit dialog
- Verify hint text displays correctly

**Status**: ⬜ Not Started

---

#### TODO 10.2: Test Currency Display
- Test all templates show correct currency symbol
- Test currency pipe formatting across different currencies
- Test with currencies having 0 decimal places (JPY)
- Test with currencies having comma decimal separator (EUR)

**Status**: ⬜ Not Started

---

#### TODO 10.3: Test Currency Input
- Test input directive with different decimal separators
- Test rounding behavior with different decimal places
- Test copy/paste formatted values
- Test keyboard input of decimal values

**Status**: ⬜ Not Started

---

#### TODO 10.4: Test Allocation Calculations
- Verify split calculations work with 0 decimal places (JPY)
- Verify split calculations work with 2 decimal places (USD, EUR)
- Verify allocations still sum to total correctly
- Test edge cases with rounding

**Status**: ⬜ Not Started

---

#### TODO 10.5: Test Group Switching
- Switch between groups with different currencies
- Verify UI updates to show correct currency
- Verify calculations use correct decimal places
- Test rapid group switching

**Status**: ⬜ Not Started

---

#### TODO 10.6: Test Edge Cases
- Test with very large amounts
- Test with very small amounts (near the minimum currency unit)
- Test negative amounts
- Test zero amounts
- Test browser locale different from group currency

**Status**: ⬜ Not Started

---

## Implementation Checklist Summary

### Phase 1: Data Model (3 TODOs) ✅ COMPLETED
- [x] 1.1: Create CurrencyConfig interface
- [x] 1.2: Update Group model
- [x] 1.3: Add form validators for currency (application-layer validation)

### Phase 2: Locale Service (2 TODOs) ✅ COMPLETED
- [x] 2.1: Create LocaleService
- [x] 2.2: Integrate with GroupService (via automatic effect watching GroupStore)

### Phase 3: Group UI (3 TODOs) ✅ COMPLETED
- [x] 3.1: Add currency selector to create dialog
- [x] 3.2: Update GroupsComponent logic
- [x] 3.3: Add currency display to edit dialog

### Phase 4: Currency Pipe (1 TODO) ✅ COMPLETED
- [x] 4.1: Refactor currency pipe

### Phase 5: Input Directive (1 TODO) ✅ COMPLETED
- [x] 5.1: Update FormatCurrencyInputDirective

### Phase 6: Templates (11 TODOs)
- [ ] 6.1: Add expense template
- [ ] 6.2: Edit expense template
- [ ] 6.3: Split component template
- [ ] 6.4: Add memorized template
- [ ] 6.5: Edit memorized template
- [ ] 6.6: History template
- [ ] 6.7: Summary template
- [ ] 6.8: Members template
- [ ] 6.9: Categories template
- [ ] 6.10: Groups template
- [ ] 6.11: Help/auth templates

### Phase 7: Number Formatting (4 TODOs)
- [ ] 7.1: Update SummaryComponent
- [ ] 7.2: Update SplitComponent
- [ ] 7.3: Update HistoryComponent
- [ ] 7.4: Update ExpensesComponent

### Phase 8: Decimal Handling (6 TODOs)
- [ ] 8.1: Update AllocationUtilsService
- [ ] 8.2: Update StringUtilsService
- [ ] 8.3: Update Add Expense Component
- [ ] 8.4: Update Edit Expense Component
- [ ] 8.5: Update Add Memorized Component
- [ ] 8.6: Update Edit Memorized Component

### Phase 9: Migration (2 TODOs)
- [ ] 9.1: Create migration script
- [ ] 9.2: Run migration

### Phase 10: Testing (6 TODOs)
- [ ] 10.1: Test group creation
- [ ] 10.2: Test currency display
- [ ] 10.3: Test currency input
- [ ] 10.4: Test allocation calculations
- [ ] 10.5: Test group switching
- [ ] 10.6: Test edge cases

---

## Total: 39 TODOs

## Estimated Effort: 15-20 hours

## Risk Areas
1. **Allocation calculations** with different decimal places (Phase 8)
2. **Decimal separator input parsing** edge cases (Phase 5)
3. **Database migration** on production data (Phase 9)
4. **Template injection** of LocaleService in all components (Phase 6)

## Success Criteria
- [ ] Users can create groups with any supported currency
- [ ] All expenses in a group display with correct currency symbol
- [ ] Input fields format according to currency decimal places
- [ ] Allocation calculations work correctly across all currencies
- [ ] Existing groups migrated successfully to USD
- [ ] No currency mixing within a single group
- [ ] Currency cannot be changed once expenses exist
- [ ] All tests pass

---

## Notes
- This implementation does NOT support currency conversion
- Groups are single-currency only
- Currency is immutable once expenses exist for a group
- Browser locale is used for number formatting preferences
- Default currency for new groups is USD
