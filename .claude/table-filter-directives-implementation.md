# Table Filter Directives Implementation Plan

## Overview

Create a reusable, directive-based filtering system for Material tables that can be easily applied to any table column. The system uses CDK Overlay for filter popups and a signal-based service for state management.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Table Component (e.g., ExpensesComponent)         │
│  - subscribes to TableFilterService                 │
│  - applies filters via computed signal              │
│  - passes service to filter directives              │
└─────────────────────────────────────────────────────┘
                     ▲
                     │ (reads active filters)
                     │
┌─────────────────────────────────────────────────────┐
│  TableFilterService<T>                              │
│  - filters = signal<Map<string, FilterValue>>()     │
│  - setFilter(key, value)                            │
│  - clearFilter(key)                                 │
│  - clearAllFilters()                                │
│  - Generic type T for type-safe filter keys         │
└─────────────────────────────────────────────────────┘
                     ▲
                     │ (updates filters)
                     │
┌─────────────────────────────────────────────────────┐
│  Filter Directives (applied to mat-header-cell)    │
│  - BaseFilterDirective (shared overlay logic)       │
│  - TextFilterDirective                              │
│  - SelectFilterDirective                            │
│  - DateRangeFilterDirective                         │
│  - ToggleFilterDirective                            │
│  (each opens CDK overlay with specific filter UI)   │
└─────────────────────────────────────────────────────┘
```

## Component Structure

```
src/app/shared/
├── directives/
│   ├── filters/
│   │   ├── base-filter.directive.ts          [Base class with overlay logic]
│   │   ├── text-filter.directive.ts          [Text search filter]
│   │   ├── select-filter.directive.ts        [Dropdown selection filter]
│   │   ├── date-range-filter.directive.ts    [Date range picker filter]
│   │   └── toggle-filter.directive.ts        [Boolean toggle filter]
├── services/
│   └── table-filter.service.ts               [Generic filter state service]
└── components/
    └── filter-panels/
        ├── text-filter-panel.component.ts
        ├── select-filter-panel.component.ts
        ├── date-range-filter-panel.component.ts
        └── toggle-filter-panel.component.ts
```

## Implementation TODOs

### ✅ TODO 1: Create TableFilterService - COMPLETED
**File**: `src/app/shared/services/table-filter.service.ts`

**Features**:
- Generic service `TableFilterService<T>` for type-safe filter keys
- Signal-based filter state: `filters = signal<Map<string, FilterValue>>(new Map())`
- Methods:
  - `setFilter(key: keyof T, value: FilterValue): void`
  - `clearFilter(key: keyof T): void`
  - `clearAllFilters(): void`
  - `hasActiveFilters(): boolean`
  - `getFilter(key: keyof T): FilterValue | undefined`
- Filter value types:
  ```typescript
  type FilterValue =
    | { type: 'text', value: string }
    | { type: 'select', value: any | any[] }
    | { type: 'dateRange', start: Date | null, end: Date | null }
    | { type: 'toggle', value: boolean | null };
  ```

### ✅ TODO 2: Create Base Filter Directive - COMPLETED
**File**: `src/app/shared/directives/filters/base-filter.directive.ts`

**Features**:
- Abstract base class for all filter directives
- CDK Overlay integration
- Inputs:
  - `@Input() filterKey: string` - The data property to filter
  - `@Input() filterService: TableFilterService<any>` - Service instance
- Manages filter icon injection into header cell
- Handles overlay positioning and lifecycle
- Provides template portal for filter panel content
- Shows active filter indicator (icon color change)
- Emits filter changes to service

**Implementation Details**:
- Inject `ElementRef`, `ViewContainerRef`, `Overlay`
- Use `@HostListener` for filter icon click
- Position overlay below header cell with fallback positioning
- Styled filter icon that appears after header text
- Visual indicator when filter is active (different icon color)

### ✅ TODO 3: Create Filter Panel Components - COMPLETED

#### 3a. Text Filter Panel Component
**File**: `src/app/shared/components/filter-panels/text-filter-panel.component.ts`

**Features**:
- Material input field for text search
- Case-sensitive toggle option
- "Clear" button
- "Apply" button
- Standalone component

#### 3b. Select Filter Panel Component
**File**: `src/app/shared/components/filter-panels/select-filter-panel.component.ts`

**Features**:
- Material select with options
- Support for single and multi-select
- "Select All" / "Clear All" for multi-select
- Search/filter within options for large lists
- "Apply" and "Clear" buttons
- Standalone component
- Inputs:
  - `@Input() options: any[]`
  - `@Input() multiple: boolean = false`
  - `@Input() displayFn: (option: any) => string`

#### 3c. Date Range Filter Panel Component
**File**: `src/app/shared/components/filter-panels/date-range-filter-panel.component.ts`

**Features**:
- Two date pickers (start and end)
- Quick select buttons (Today, Last 7 days, Last 30 days, Last 90 days)
- "Clear" button
- "Apply" button
- Standalone component
- Integration with existing `DateShortcutKeysDirective`

#### 3d. Toggle Filter Panel Component
**File**: `src/app/shared/components/filter-panels/toggle-filter-panel.component.ts`

**Features**:
- Three-state toggle: All / True / False
- Visual button group or radio buttons
- Immediately applies filter (no Apply button needed)
- Standalone component

### ✅ TODO 4: Create Concrete Filter Directives - COMPLETED

#### 4a. Text Filter Directive
**File**: `src/app/shared/directives/filters/text-filter.directive.ts`

- Extends `BaseFilterDirective`
- Opens `TextFilterPanelComponent` in overlay
- Selector: `[appTextFilter]`

#### 4b. Select Filter Directive
**File**: `src/app/shared/directives/filters/select-filter.directive.ts`

- Extends `BaseFilterDirective`
- Opens `SelectFilterPanelComponent` in overlay
- Additional inputs for options and configuration
- Selector: `[appSelectFilter]`

#### 4c. Date Range Filter Directive
**File**: `src/app/shared/directives/filters/date-range-filter.directive.ts`

- Extends `BaseFilterDirective`
- Opens `DateRangeFilterPanelComponent` in overlay
- Selector: `[appDateRangeFilter]`

#### 4d. Toggle Filter Directive
**File**: `src/app/shared/directives/filters/toggle-filter.directive.ts`

- Extends `BaseFilterDirective`
- Opens `ToggleFilterPanelComponent` in overlay
- Selector: `[appToggleFilter]`

### ✅ TODO 5: Add Shared Styles - COMPLETED
**File**: `src/styles.scss`

**Styles to add**:
```scss
/* ========================================
   TABLE FILTER STYLES
======================================== */

.filter-icon {
  color: tokens.color('outline') !important;
  font-size: 1rem !important;
  width: 1rem !important;
  height: 1rem !important;
  margin-left: 4px;
  cursor: pointer;
  vertical-align: middle;

  &:hover {
    color: tokens.color('primary') !important;
  }

  &.filter-active {
    color: tokens.color('primary') !important;
  }
}

.filter-panel {
  background: tokens.color('surface');
  border: 1px solid tokens.color('outline-variant');
  border-radius: 4px;
  padding: 16px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  min-width: 250px;
  max-width: 350px;

  .filter-panel-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-panel-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .filter-quick-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 8px;

    button {
      font-size: 0.75rem;
      padding: 4px 8px;
      min-height: 28px;
    }
  }
}

.filter-toggle-group {
  display: flex;
  gap: 4px;

  button {
    flex: 1;

    &.active {
      background-color: tokens.color('primary') !important;
      color: tokens.color('on-primary') !important;
    }
  }
}
```

### ✅ TODO 6: Update Expenses Component (Example Implementation) - COMPLETED

**File**: `src/app/components/expenses/expenses/expenses.component.ts`

**Changes**:
1. Create filter service instance:
   ```typescript
   expenseFilterService = new TableFilterService<Expense>();
   ```

2. Update `filteredExpenses` computed to use filter service:
   ```typescript
   filteredExpenses = computed(() => {
     let filtered = this.expenses();
     const filters = this.expenseFilterService.filters();

     // Apply each active filter
     filters.forEach((filterValue, key) => {
       filtered = this.applyFilter(filtered, key, filterValue);
     });

     // Apply existing unpaidOnly and searchText filters
     filtered = filtered.filter((expense: Expense) => {
       return (
         (!expense.paid || expense.paid != this.unpaidOnly()) &&
         (!this.searchText() || this.matchesSearch(expense))
       );
     });

     // Apply sorting
     if (filtered.length > 0) {
       filtered = this.sorter.sort(
         filtered,
         this.sortField(),
         this.sortAsc()
       );
     }

     return filtered;
   });
   ```

3. Add filter application method:
   ```typescript
   private applyFilter(
     expenses: Expense[],
     key: string,
     filterValue: FilterValue
   ): Expense[] {
     switch (filterValue.type) {
       case 'text':
         // Apply text filter to relevant field
       case 'select':
         // Apply select filter
       case 'dateRange':
         // Apply date range filter
       case 'toggle':
         // Apply boolean toggle filter
     }
   }
   ```

**File**: `src/app/components/expenses/expenses/expenses.component.html`

**Changes**:
1. Update table headers to include filter directives:
   ```html
   <ng-container matColumnDef="date">
     <th mat-header-cell *matHeaderCellDef
         mat-sort-header
         class="cell-left"
         [appDateRangeFilter]="'date'"
         [filterService]="expenseFilterService">
       Date
     </th>
   </ng-container>

   <ng-container matColumnDef="paidBy">
     <th mat-header-cell *matHeaderCellDef
         [appSelectFilter]="'paidBy'"
         [filterService]="expenseFilterService"
         [filterOptions]="members()"
         [displayFn]="memberDisplayFn">
       Payer
     </th>
   </ng-container>

   <ng-container matColumnDef="category">
     <th mat-header-cell *matHeaderCellDef
         [appSelectFilter]="'category'"
         [filterService]="expenseFilterService"
         [filterOptions]="categories()"
         [displayFn]="categoryDisplayFn">
       Category
     </th>
   </ng-container>

   <ng-container matColumnDef="description">
     <th mat-header-cell *matHeaderCellDef
         [appTextFilter]="'description'"
         [filterService]="expenseFilterService">
       Description
     </th>
   </ng-container>

   <ng-container matColumnDef="paid">
     <th mat-header-cell *matHeaderCellDef
         class="cell-center"
         [appToggleFilter]="'paid'"
         [filterService]="expenseFilterService">
       Paid
     </th>
   </ng-container>

   <ng-container matColumnDef="receipt">
     <th mat-header-cell *matHeaderCellDef
         class="cell-center"
         [appToggleFilter]="'hasReceipt'"
         [filterService]="expenseFilterService">
       Rcpt
     </th>
   </ng-container>
   ```

2. Add "Clear All Filters" button (optional):
   ```html
   <div class="filters mt-3">
     <!-- existing filter controls -->

     @if (expenseFilterService.hasActiveFilters()) {
       <button
         matButton
         type="button"
         (click)="expenseFilterService.clearAllFilters()"
       >
         <mat-icon>filter_alt_off</mat-icon>
         Clear All Filters
       </button>
     }
   </div>
   ```

### ✅ TODO 7: Testing & Refinement - BASIC IMPLEMENTATION COMPLETE

1. **Manual Testing**:
   - Test each filter type on the Expenses table
   - Verify overlay positioning across different screen sizes
   - Test filter combinations
   - Verify visual indicators for active filters
   - Test clear functionality

2. **Edge Cases**:
   - Empty option lists for select filters
   - Invalid date ranges
   - Filter interactions with existing search/unpaidOnly filters
   - Performance with large datasets

3. **Accessibility**:
   - Keyboard navigation for filter panels
   - ARIA labels for filter icons and panels
   - Focus management when opening/closing overlays

### ✅ TODO 8: Documentation

**File**: `README.md` or create `docs/table-filters.md`

Document:
- How to use filter directives in any table
- Required imports and setup
- FilterService instantiation
- Available filter types and their options
- Styling customization options
- Example implementations

## Usage Example (Final Result)

```typescript
// Component
export class MyTableComponent {
  filterService = new TableFilterService<MyDataType>();

  members = signal<Member[]>([]);

  filteredData = computed(() => {
    let data = this.rawData();
    const filters = this.filterService.filters();

    filters.forEach((filterValue, key) => {
      data = this.applyFilter(data, key as keyof MyDataType, filterValue);
    });

    return data;
  });
}
```

```html
<!-- Template -->
<table mat-table [dataSource]="filteredData()">
  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef
        [appTextFilter]="'name'"
        [filterService]="filterService">
      Name
    </th>
  </ng-container>

  <ng-container matColumnDef="status">
    <th mat-header-cell *matHeaderCellDef
        [appSelectFilter]="'status'"
        [filterService]="filterService"
        [filterOptions]="statusOptions">
      Status
    </th>
  </ng-container>

  <ng-container matColumnDef="active">
    <th mat-header-cell *matHeaderCellDef
        [appToggleFilter]="'active'"
        [filterService]="filterService">
      Active
    </th>
  </ng-container>
</table>
```

## Benefits

1. **Reusable**: Apply to any table with minimal setup
2. **Type-safe**: Generic service ensures filter keys match data model
3. **Consistent UX**: Unified filter UI across the application
4. **Signal-based**: Integrates with Angular's modern reactivity
5. **Extensible**: Easy to add new filter types
6. **Performant**: Computed signals optimize re-rendering
7. **Maintainable**: Centralized filter logic

## Future Enhancements (Out of Scope)

- Filter persistence (localStorage/URL params)
- Filter presets/saved filters
- Advanced query builder
- Export filtered data
- Filter analytics/usage tracking
