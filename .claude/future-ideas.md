# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

- [Receipt OCR / Scan-to-Expense Wizard](#receipt-ocr--scan-to-expense-wizard)

---

## Receipt OCR / Scan-to-Expense Wizard

**Status:** Built and manually verified end-to-end against real receipt photos and a real signed-in click-through, including a real allocation bug, OCR parsing gaps, and responsive-layout issues all found and fixed along the way (see "Real-receipt validation", "Manual click-through findings", and "Compact/responsive layout" below). User has confirmed the wizard works and looks correct on both small and large screens. Small polish items remain — see "Known follow-ups".

### Summary

An option in the add-expense flow to create an expense from a photo of a receipt instead of manual entry. The app extracts the total, tax, tip, and individual line items via OCR, then lets the user assign each line item to a member (or leave it shared). On completion it hands off to the existing Add Expense screen with the total, description, per-member amounts, and the receipt photo itself pre-filled for final review/submission.

### How it works (as built)

1. **Entry point:** `ExpensesComponent`'s "Add New Expense" button opens `AddExpenseOptionsDialogComponent`, a small popup with three choices: "Enter Manual Expense" (→ `/expenses/add`), "Create Expense From Receipt" (→ `/expenses/scan-receipt`), and "Vacation Rental" (→ `/expenses/rental`). The standalone Vacation Rental button that used to sit next to Add New Expense on the expenses list was removed — new expense-creation methods are meant to be added to this dialog instead of accumulating more buttons on the list page. In demo mode, choosing the receipt option shows the standard demo-restriction snackbar instead of navigating — see "Demo mode" below.
2. **Photo selection:** `/expenses/scan-receipt` (`ScanReceiptComponent`) uses the exact same picker `AddExpenseComponent` already used for receipt attachments — platform-aware camera/gallery/browse-files/clipboard dialog, the one-time receipt-policy gate, 5MB size validation. This logic was extracted out of `AddExpenseComponent`'s private methods into a shared [`ReceiptFileSelectionService`](../src/app/services/receipt-file-selection.service.ts), which both components now inject — no more duplicated dialog/policy/clipboard handling.
3. **Scanning:** once a file is picked, [`ReceiptScanService`](../src/app/services/receipt-scan.service.ts) base64-encodes it client-side (`FileReader.readAsDataURL`, stripped of its `data:` prefix) and calls the `scanReceipt` callable with `{ groupId, imageBase64 }`. No Storage upload at this stage — see the Function-side notes below for why. The `LoadingService` overlay covers the screen while this is in flight.
4. **Review & assign:** the wizard shows the parsed total/tax/tip (all editable) plus a description field, and lists every parsed line item as an editable row (description, amount, and a member-assignment select defaulting to "Shared / No one"). Items below 70% OCR confidence get a warning icon/tooltip but stay fully editable — never silently dropped. The user can also add a missed item or remove a spurious one. Running totals show each assigned member's subtotal (from their directly-assigned items only) plus one combined "Shared Pool" total (tax + tip + any unassigned items).

   (Deviated from the original one-item-at-a-time modal-stepper idea: showing every item in an editable list — consistent with how the rest of the app presents splits/rows — turned out to be a better fit than a step-through wizard, with no loss of the core capability.)
5. **Handoff:** on Continue, the wizard builds a payload (total, description, shared pool, and one merged split per assigned member) and hands it to [`ReceiptScanHandoffService`](../src/app/services/receipt-scan-handoff.service.ts) — a simple root-provided in-memory service, **not router navigation state**. `AddExpenseComponent`'s constructor checks this service (alongside its existing `rentalPayload`/`memorizedExpense` checks) and, if a payload is waiting, calls `loadReceiptScanExpense()` to prefill `expenseModel`/`expenseFormData`/`receiptFile` and run `allocateSharedAmounts()` — the exact same allocation logic that already powers manual entry, rental splits, and memorized expenses. No new allocation math was needed.

   **Why a handoff service instead of router state** (this was an open question during planning, now resolved by building it): `SerializableRentalPayload` already has to convert member `DocumentReference`s to plain string ids because Firestore references aren't structured-cloneable through `history.pushState`. A receipt photo compounds that with size: multi-MB `File` objects risk exceeding browsers' `pushState` payload limits. A plain in-memory singleton sidesteps both — the `File` and `DocumentReference`s travel as live object references, no serialization involved. The tradeoff (doesn't survive a page reload) is irrelevant here since it's a same-tab, same-session handoff between two adjacent screens.
6. User reviews/adjusts on the normal Add Expense screen and submits as usual. `receiptFile` uploads exactly once, at submit time, through the existing `ExpenseService.addExpense` path (`groups/{groupId}/receipts/{expenseId}`) — unchanged. Nothing is ever written to Storage before that point, so an abandoned wizard or abandoned Add Expense screen leaves nothing behind to clean up.

### Demo mode

`scanReceipt` is a real (billable-compute) Cloud Function keyed to real group membership, so it can't run against demo mode's fake group. There is no `/demo/expenses/scan-receipt` route; `ExpensesComponent.onAddExpenseClick()` shows the standard demo-restriction snackbar instead of navigating when "Create Expense From Receipt" is chosen in demo mode. Manual entry and Vacation Rental remain fully explorable in demo mode as before (both are pure client-side compute).

### Resolved decisions (from planning)

- **Tax/tip allocation** — no new math, but this took a real bug to get right (see "Manual click-through" below): unassigned items → `sharedAmount` (the form's "Evenly Shared Remainder", split evenly), tax + tip → `allocatedAmount` (the form's "Proportional Amount", split proportionally to each member's assigned item total) — matching what the Add & Edit Expenses help text has always said that field is for. Per-split `assignedAmount` carries each member's directly-assigned items.
- **Compute guardrail** — no cap on `scanReceipt` calls for now (Tesseract.js has no per-call vendor cost); revisit only if usage patterns show real Cloud Functions compute cost.
- **Confidence handling** — flag inline (warning icon + tooltip below 70% confidence), keep every field editable regardless.
- **Cleanup of scanned images** — moot: `scanReceipt` never touches Storage (image travels as inline base64), and the final receipt upload reuses the existing upload-at-submit path unchanged.
- **Photo picker reuse** — extracted into `ReceiptFileSelectionService` rather than duplicated, matching how the wizard needed the same camera/gallery/file/clipboard picker `AddExpenseComponent` already used.

### Package/service choice

Went with **Tesseract.js**, called from a Firebase Function, over Google Cloud Document AI / Vision, AWS Textract, Azure Document Intelligence, and third-party receipt-parsing SaaS APIs (Taggun/Veryfi/Nanonets). No per-scan cost, no new cloud vendor/credentials, keeps OCR server-side so it can be swapped out later without touching the client. Tradeoff accepted: weaker out-of-the-box accuracy than a purpose-built receipt parser, and the total/tax/tip/line-item parsing heuristics are hand-rolled (no maintained npm package does this on top of raw OCR text).

Implementation notes:
- Pure WASM (`tesseract.js`, not the `node-tesseract-ocr` wrapper, which shells out to a system binary and has a known OS command-injection advisory).
- Image is preprocessed with `sharp` (auto-orient/grayscale/normalize/sharpen) before OCR — meaningfully improves accuracy on real phone photos (skew, shadows, low contrast).
- `scanReceipt` runs at `memory: '1GiB'` / `timeoutSeconds: 60`, since OCR is CPU-heavy compared to the app's other (fast, I/O-bound) callables.

### Implementation map

Backend:
- [`functions/src/receipt-parser.ts`](../functions/src/receipt-parser.ts) — pure `parseReceiptLines(lines)`, unit tested against synthetic OCR line data.
- [`functions/src/receipt-ocr.ts`](../functions/src/receipt-ocr.ts) — the `scanReceipt` callable. Takes `{ groupId, imageBase64 }`, verifies active group membership, preprocesses + OCRs the image, returns the parsed result.
- Exported from `functions/src/index.ts`. Dependencies: `tesseract.js`, `sharp`.

Frontend:
- [`AddExpenseOptionsDialogComponent`](../src/app/features/expenses/add-expense-options-dialog/add-expense-options-dialog.component.ts) — the "Add New Expense" entry-point dialog.
- [`ScanReceiptComponent`](../src/app/features/expenses/scan-receipt/scan-receipt.component.ts) — the wizard itself, at route `/expenses/scan-receipt`.
- [`ReceiptFileSelectionService`](../src/app/services/receipt-file-selection.service.ts) — shared photo-picker logic (policy gate, source dialog, camera/gallery/clipboard, size validation), used by both `AddExpenseComponent` and `ScanReceiptComponent`.
- [`ReceiptScanService`](../src/app/services/receipt-scan.service.ts) — calls the `scanReceipt` callable.
- [`ReceiptScanHandoffService`](../src/app/services/receipt-scan-handoff.service.ts) — in-memory wizard → Add Expense handoff (see "Why a handoff service" above).
- [`models/receipt-scan.ts`](../src/app/models/receipt-scan.ts) — `ParsedReceipt`/`ParsedReceiptLineItem`, mirroring the Function's response shape.
- `AddExpenseComponent.loadReceiptScanExpense()` — reads the handoff payload and prefills the form, alongside the existing `loadRentalExpense`/`loadMemorizedExpense`.
- Shared dialog list-button styling (`.selection-options`/`.selection-button`) was promoted from `file-selection-dialog`'s component-scoped `.scss` into `src/styles.scss`, since `AddExpenseOptionsDialogComponent` uses the identical pattern.

Test coverage: unit specs for the parser, all three new services, `ScanReceiptComponent`, `AddExpenseOptionsDialogComponent`, and updated specs for `ExpensesComponent`/`AddExpenseComponent` — full suite (1144 tests) green. The entry-point dialog and all three routing choices (manual/receipt-in-demo-mode/rental) were also verified live in a real headless-Chromium session against the local dev server + Firebase emulators.

### Real-receipt validation (2026-07-27)

Ran the actual `sharp` → `tesseract.js` → `parseReceiptLines` pipeline directly (standalone script, bypassing the `scanReceipt` callable's auth/Firestore wrapper) against two real photographed receipts. This caught one real bug and several real parsing gaps that synthetic test fixtures hadn't surfaced:

- **Bug (fixed):** `worker.recognize()` was returning an empty `data.blocks` for every scan — Tesseract.js only populates the hierarchical blocks/paragraphs/lines output when explicitly requested via a third `output` argument (`worker.recognize(buffer, {}, { blocks: true })`). Without it, `recognizeLines()` silently produced zero lines every time, regardless of image quality. **`scanReceipt` would have returned an empty result for every real scan before this fix** — none of the earlier manual entry/rental/dialog testing exercised this path, so it went unnoticed until real photos were tried.
- **Fixed, based on real receipt patterns:**
  - Grocery receipts commonly suffix prices with a tax-status letter with no space (`5.99F`, `14.99 T`) — `AMOUNT_RE` now tolerates one optional trailing letter.
  - "Balance" alone (no "total" anywhere on the receipt) is a common way receipts state what's owed — added to `TOTAL_RE`.
  - "Credit Card Surcharge" and similar lines were being miscounted as line items — added to the noise-keyword list.
  - Pre-computed tip-suggestion lines ("18% $10.98", "20% $12.20"...) were being miscounted as line items — added a dedicated filter for lines starting with a percentage.
  - All captured as regression tests in `receipt-parser.spec.ts` using the real line text (with real OCR noise/garbling) from these receipts, not idealized fixtures.
- **Known, accepted limitations (not fixed — inherent to OCR, not parser bugs):**
  - OCR occasionally misreads a digit (a `$68.40` total was read as `$686.40` on one receipt). The wizard surfaces total as an editable field specifically so this kind of error gets caught by the user before saving — no auto-correction heuristic was added (a "does total ≈ subtotal+tax+tip" sanity check was considered but skipped: not robust when a receipt legitimately has multiple valid totals, as one test receipt did with separate cash/credit pricing).
  - A receipt with one region shot in poor/uneven lighting OCR'd at 6–33% confidence in that region (vs. 80–95% elsewhere) and the total there wasn't extracted at all — no line had a recoverable trailing amount to begin with. Photo quality matters; nothing to fix in the parser here.
  - Handwritten amounts (e.g., a tip written in by hand) are invisible to Tesseract, as expected — it only reads printed text.

Two housekeeping side effects from this pass: `functions/.gitignore` now excludes `*.traineddata` (Tesseract.js downloads its English language data into the working directory on first local run — `functions/eng.traineddata`, ~5MB — and it was untracked/uncommitted, worth excluding explicitly so it's never accidentally committed). Also worth knowing for next time: `functions/vitest.config.ts` runs a `globalSetup` that **wipes the Auth and Firestore emulator data** before every functions test run (mirrors the e2e suite's setup) — running `pnpm test` (or any `vitest run`) in `functions/` against a shared/already-running emulator instance clears whatever was in it. That happened repeatedly over the course of building this feature.

### Manual click-through findings (2026-07-27)

User did the full authenticated click-through (photo → scan → assign → Continue → Add Expense) that hadn't been tested yet. Found four real issues, all fixed:

- **Allocation bug (the important one):** tax + tip were landing in the Add Expense form's "Evenly Shared Remainder" field (`sharedAmount`, split evenly across members) instead of "Proportional Amount" (`allocatedAmount`, split proportionally to what each member ordered) — even though the app's own Add & Edit Expenses help text has always documented the Proportional Amount field as being "for items like tax and tip that should be split proportionally." This was a mistake in the original planning decision (recorded above), not caught by unit tests because they only checked that *a* value landed in `sharedAmount`, never questioned whether it was the *right* field. Fixed by splitting `ReceiptScanPayload.sharedAmount` (now unassigned items only) from a new `proportionalAmount` field (tax + tip), and routing `proportionalAmount` into `expenseFormData.allocatedAmount` in `loadReceiptScanExpense()` instead of hardcoding it to zero. `ScanReceiptComponent`'s running-totals display was also split into two labeled lines ("Unassigned Items (split evenly)" / "Tax + Tip (split proportionally)") instead of one combined "Shared Pool," so the UI doesn't claim a single split behavior that no longer matches the math. Locked in with a new `AddExpenseComponent` regression test asserting `allocatedAmount` (not `sharedAmount`) receives the tax/tip figure.
- **Two CSS bugs**, both from styles that were never actually scoped to `ScanReceiptComponent`: the scanned-filename/"Choose a Different Photo" row was using `.attachment`, a class only defined in `add-expense.component.scss` (Angular view encapsulation means it never applied here) — added a proper `.scanned-file-info` flex rule with a gap and baseline alignment. The Cancel/Continue row was using `.form-buttons`/`.form-buttons-left`/`.form-buttons-right`, a legacy pattern not used anywhere else in the app that pushes the buttons to opposite edges — replaced with the same `.flex-wrap.fw-center` utility the rest of the app already uses for centered button rows.
- **Missing select-on-focus behavior:** every other amount field in the app (`AddExpenseComponent`, `EditExpenseComponent`, `RentalComponent`, both memorized-expense forms, the standalone split calculator) selects an amount input's existing text on focus so the user can type over it, via a duplicated `viewChildren('inputElement')` + `afterEveryRender` + `addSelectFocus()` pattern. `ScanReceiptComponent` didn't have it. Added the same pattern (now duplicated a 7th time — a reasonable candidate for a shared directive at some point, but out of scope to refactor all seven call sites here) to the total/tax/tip/line-item amount inputs.

One caching gotcha hit while iterating on this: after a template/property-shape change, the dev server's Vite dependency cache (`.angular/cache`) can serve a stale compiled component and throw a `ctx_r1.<oldPropertyName> is not a function` error even though the source is already fixed. Fix is `rm -rf .angular/cache` + restart `pnpm start` + hard-refresh the browser, not more source changes.

### Compact/responsive layout (2026-07-27)

On a narrow screen, the amounts row (Total/Tax/Tip) and each line-item row (description/amount/member/delete) were wrapping to multiple lines - the global `.total-amount-field`/`.number-field` classes those fields originally used are fixed-px-width and shared with other forms across the app, so they couldn't just be shrunk without affecting other pages. Replaced with new classes scoped to `ScanReceiptComponent` only. This went through a few real iterations based on live testing:

1. **First attempt (`flex-wrap: nowrap` + `min-width: 0` on everything) overflowed the page horizontally instead of shrinking.** Root cause: `.container` is `width: fit-content` globally (fine for pages whose widest row already wraps or is made of small fixed-width fields that happen to sum to something narrow) — it gives a `nowrap` flex row nothing to actually shrink against, so the row (and the whole page) just grows wider than the viewport instead. Fixed by giving this component's own `.container` a real bounded width (`width: 100%; max-width: 640px`) so descendant rows have something concrete to resolve against.
2. **Even with that fixed, raw `<input>` elements inside the shrunk `mat-form-field`s still overflowed their container** — plain inputs default to the browser's native `size=20`-ish width and don't automatically shrink just because their flex parent got squeezed. Fixed by explicitly setting `width: 100%; box-sizing: border-box` on the `input` (and `.mat-mdc-select-trigger` for the assignee dropdown) inside each of these field classes.
3. **User feedback: cramming all 4 line-item fields onto one row was too cramped on small screens, but should still be one row on large screens.** Switched `.line-item-row` to `flex-wrap: wrap` with the description field forced to `flex-basis: 100%` below a 599px breakpoint (`$line-item-breakpoint`) — this pushes description onto its own line and lets amount/assignee/delete share a roomier second line, while above the breakpoint everything fits together on one line same as before (no wrap needed at that width).
4. **User feedback: amount and member-assignee fields ended up the same width, which looked odd for a currency field.** Uncapped `flex: 2 1 0` on `.line-item-amount` was giving it equal grow-weight to `.line-item-assignee`. Changed to a capped `flex: 0 1 150px` (won't grow past 150px, still shrinks if truly needed) so it stays a sensible currency-field size regardless of leftover row space, while `.line-item-assignee` absorbs the rest. (150px came from user iteration in-editor - tried 100px, then 200px, settled on 150px as "perfect.")
5. **User feedback: on wide screens (single-line layout), the member dropdown rendered almost illegibly narrow while description took up excess room.** `.line-item-description` still had `flex: 3` from the original (pre-breakpoint) single-row design, three times `.line-item-assignee`'s `flex: 1` — fine when they were the only two flexible fields sharing space with a fixed-width amount, but far too description-heavy once the wide-screen row needed to look balanced on its own. Since the sub-599px layout puts description on its own line (no longer competing with assignee for space at all), this ratio only ever affected the wide-screen case and could be changed with zero risk to the now-confirmed-correct narrow-screen layout. Inverted the balance: `.line-item-description` → `flex: 1 1 140px`, `.line-item-assignee` → `flex: 2 1 0`.
6. **Final small nudge, user-requested (~25px):** amount felt slightly too wide relative to the dropdown even after (5). Shifted 25px directly between their fixed bases rather than touching the grow ratio (which would've also pulled from description): `.line-item-amount` basis `150px → 125px`, `.line-item-assignee` basis `0 → 25px` (still keeps its `flex-grow: 2` for absorbing leftover space). Confirmed by the user as correct on both screen sizes — this is the final tuning.

Also fixed a small pre-existing gap while in this code: the line-item amount field only handled a currency-symbol *prefix*, never a *suffix* — a suffix-position currency would have shown no symbol at all on line items.

**Verification approach:** rather than trust a hand-built static-HTML mockup for pixel-accurate visual review (an earlier attempt at this had real fidelity problems — see below), verification here was geometric/computational: loading the real compiled `dist/browser/styles-*.css` plus the real DOM markup structure (captured from an actual rendered `mat-form-field`/`mat-select` via Playwright) into a standalone test page, then measuring actual `getBoundingClientRect()` widths/positions and `scrollWidth` vs viewport width across several breakpoints — this is what caught both the `fit-content` overflow and the raw-`<input>` overflow above, and confirmed the responsive breakpoint produces one line above 599px / two lines below with zero horizontal overflow at any tested width (320–1024px). What it can't verify is fine-grained visual polish (exact spacing, whether something "looks cramped") since the mockup is missing most of Angular Material's actual per-component CSS (that ships bundled with each component, not in the global stylesheet) — hence labels overlapping input values in on-screen renders of the mockup. That gap is exactly why items 3 and 4 above came from the user's own live testing rather than being caught computationally first.

### Known follow-ups

- No dedicated e2e test yet for the receipt-scan flow (the existing e2e suite covers manual entry and rental; this feature has none).
- The wizard's "guess a description from the first OCR line" heuristic hasn't been specifically evaluated — the one real click-through so far happened to produce a good description ("Compton Ale House"), but that's one data point.
- `src/app/services/receipt-scan.service.spec.ts` was observed to fail intermittently only when the full suite runs (passes reliably in isolation) — looks like cross-file mock-state leakage (`vi.mocked(functionsModule.httpsCallable).mock.results[0]` indexing), not something introduced by this feature, but not yet root-caused either.
