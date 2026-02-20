# History Detail Refactor — Implementation Plan

## Overview
Replace `lineItems` array in History records with `splitsPaid: DocumentReference<Split>[]`, add a new History Detail page, and enable admin-only "Unpay" functionality.

## TODOs

- [x] Create this README
- [x] Update `src/app/models/history.ts` — replace `lineItems` with `splitsPaid`
- [x] Update `src/app/services/history.service.interface.ts` — add `unpayHistory`, `unpaySingleSplitFromHistory`; remove `deleteHistory`
- [x] Update `src/app/services/history.service.ts` — implement new methods, remove `deleteHistory`
- [x] Update `src/app/services/split.service.ts` — `paySplitsBetweenMembers` uses `splitsPaid`, `settleGroup` uses `splitsPaid: []`
- [x] Update `src/app/components/summary/summary/summary.component.ts` — build `splitsPaid` array instead of `lineItems`
- [x] Create `src/app/components/history/history.routes.ts`
- [x] Update `src/app/components/analysis/analysis.routes.ts` — use `loadChildren` for history
- [x] Update `src/app/components/history/history/history.component.ts` — Type column, row navigation, remove expand/delete
- [x] Update `src/app/components/history/history/history.component.html` — Type column, remove expand detail rows
- [x] Create `src/app/components/history/history-detail/history-detail.component.ts`
- [x] Create `src/app/components/history/history-detail/history-detail.component.html`
- [x] Create `src/app/components/history/history-detail/history-detail.component.scss`
- [x] Update `src/app/services/help-content.service.ts` — update history section, add history-detail section
- [x] Update `src/app/services/tour.service.ts` — update history tour steps
- [x] Update `.claude/app-functionality-guide.md`
- [x] Also updated: `src/app/services/demo-mode.service.ts`, `src/testing/test-helpers.ts`
- [x] Build and verify: `ng build` — SUCCESS, no errors

## Key Design Decisions

### splitsPaid field
- `splitsPaid: DocumentReference<Split>[]` replaces `lineItems: { category: string; amount: number }[]`
- Empty array (`[]`) for group settle records (Least Transfers method)
- Non-empty for direct member-to-member payments

### Type Column (History main page)
- Replaces the Delete column
- `person` icon for member payments (`splitsPaid.length > 0`)
- `group` icon for group settle (`splitsPaid.length === 0`)
- Clicking group settle row shows snackbar: "Group settle payments don't have a breakdown available"

### Unpay All Logic
1. Fetch splits via `Promise.all(history.splitsPaid.map(ref => getDoc(ref)))`
2. Batch: mark all splits `paid: false`
3. Batch: mark all unique related expenses `paid: false`
4. Batch: delete history record
5. Navigate back to history list

### Unpay Single Split Logic
1. Batch: mark split `paid: false`
2. Batch: mark expense `paid: false`
3. Compute `newSplitsPaid = history.splitsPaid.filter(ref => !ref.eq(splitRef))`
4. Compute `newTotalPaid`:
   - Positive direction (`split.owedByMemberRef == history.paidByMemberRef`): `totalPaid - allocatedAmount`
   - Negative direction (`split.owedByMemberRef == history.paidToMemberRef`): `totalPaid + allocatedAmount`
5. If `newSplitsPaid.length === 0`: batch delete history record, navigate back
6. Else: batch update history record with new `splitsPaid` and `totalPaid`
