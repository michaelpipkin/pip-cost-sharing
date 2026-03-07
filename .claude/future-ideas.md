# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

1. [Split by Shares](#split-by-shares)

---

## Split by Shares

### Motivation

"Split by shares" lets users express ratios (e.g., 2:1) instead of computing percentages manually (66.67%/33.33%). It adds no new capability — anything expressible as shares is also expressible as percentages — but lowers friction for common non-equal splits. Most valuable for recurring arrangements with fixed ratios (e.g., roommates with different-sized rooms).

---

### Design Decision — `splitMethod` String vs. Second Boolean

The current `splitByPercentage: boolean` field on Expense is already awkward; adding a second boolean (`splitByShares`) would create a three-state value across two fields. The clean approach is to migrate to `splitMethod: 'amount' | 'percentage' | 'shares'` on the Expense model.

**Backwards compatibility:** Existing Firestore documents have `splitByPercentage` but no `splitMethod`. When reading, check for `splitMethod` first; if absent, derive from `splitByPercentage` (`true` → `'percentage'`, `false` → `'amount'`). New writes always use `splitMethod` and can omit `splitByPercentage`. No migration script needed — the app can remain dual-read-compatible indefinitely.

---

### Model Changes

| Model | Change |
|---|---|
| `Expense` | Replace `splitByPercentage: boolean` with `splitMethod: string`; add backwards-compatible read logic |
| `Split` | Add `shares: number` alongside existing `assignedAmount`, `percentage`, `allocatedAmount` |

`shares` is only populated when `splitMethod === 'shares'`; it is stored so an expense can be re-opened for editing with original share values intact.

---

### AllocationUtils Change

Add `allocateByShares(splits, totalAmount)` to `AllocationUtilsService`:

1. Sum all member shares → `totalShares`.
2. Each member's effective percentage = `shares / totalShares * 100`.
3. Delegate to the existing percentage allocation logic (same rounding-adjustment pass already used by `allocateByPercentage`).

This keeps the calculation DRY — shares is just a percentage-derivation step.

---

### UI Changes

Replace the two-button toggle ("By Amount" | "By Percentage") with a three-button toggle ("By Amount" | "By Percentage" | "By Shares") in `add-expense`, `edit-expense`, and `split` components.

Replace the current icon-only split button (`$` | `%`) with a three-option `MatButtonToggleGroup` using short text labels: **Amount | % | Shares**. Icon-only works for `$` and `%` (universally recognized symbols) but "shares" has no recognizable icon equivalent — and since tooltips don't appear in the mobile app, text labels are the only reliable way to make all three options self-descriptive across platforms.

In shares mode:
- Show a `shares` number input column (replacing the percentage input column).
- Display the computed effective percentage next to each member's shares as a read-only hint (e.g., "33.33%").
- Unlike percentage mode, the last member's shares are **not** auto-filled — shares don't need to sum to a target value.
- Validation: all shares must be > 0 before allocation is calculated.

---

### Relevant Existing Code

| Layer | File | Key Symbol |
|---|---|---|
| Expense model | `src/app/models/expense.ts` | `splitByPercentage: boolean` → replace with `splitMethod: string` |
| Split model | `src/app/models/split.ts` | add `shares: number` |
| Allocation utils | `src/app/utilities/allocation-utils.service.ts` | add `allocateByShares()` |
| Add expense | `src/app/features/expenses/add-expense/add-expense.component.ts` | `splitByPercentage` model signal, `onSplitByPercentageClick()`, `onSplitByAmountClick()`, `allocateByPercentage()`, `allocateSharedAmounts()` |
| Add expense template | `src/app/features/expenses/add-expense/add-expense.component.html` | two-button split method toggle |
| Edit expense | `src/app/features/expenses/edit-expense/edit-expense.component.ts` | same as add-expense |
| Edit expense template | `src/app/features/expenses/edit-expense/edit-expense.component.html` | same as add-expense |
| Add memorized | `src/app/features/memorized/add-memorized/add-memorized.component.ts` | same as add-expense |
| Add memorized template | `src/app/features/memorized/add-memorized/add-memorized.component.html` | same as add-expense |
| Edit memorized | `src/app/features/memorized/edit-memorized/edit-memorized.component.ts` | same as add-expense |
| Edit memorized template | `src/app/features/memorized/edit-memorized/edit-memorized.component.html` | same as add-expense |
| Split calculator | `src/app/features/split/split/split.component.ts` | same toggle + allocation logic |
| Split calculator template | `src/app/features/split/split/split.component.html` | same toggle |

---

### Implementation Steps (rough order)

1. Update `Expense` model — replace `splitByPercentage: boolean` with `splitMethod: string`; add a backwards-compatible getter that reads either field from Firestore data.
2. Update `Split` model — add `shares: number`.
3. Add `allocateByShares()` to `AllocationUtilsService`.
4. Update `AddExpenseComponent` — replace two-button toggle with three-button; add `onSplitBySharesClick()` handler; add shares form controls to the splits `FormArray`; wire allocation.
5. Update `EditExpenseComponent` — same changes; load existing `shares` values when reopening a shares-type expense.
6. Update `AddMemorizedComponent` and `EditMemorizedComponent` — same toggle and allocation wiring as the expense components.
7. Update `SplitComponent` (standalone calculator) — same toggle and allocation wiring.
8. Update any expense detail/history views that display the split method label (currently "By Percentage" / "By Amount").

---

### Open Questions

- Should the effective percentage hint (e.g., "33.33%") be shown inline next to each share input, or only in a summary row at the bottom?
- Should decimal shares (e.g., 1.5 : 1) be allowed, or restricted to integers? Integers are simpler UX; decimals cover edge cases.
- Should the split calculator (`SplitComponent`) support shares mode, or just the expense entry forms?
