# PipSplit — Future Ideas & Implementation Plans

This document captures ideas and rough plans for future features. Items are not committed to any release schedule; they exist to preserve thinking and provide a starting point when implementation begins.

---

## Table of Contents

- [Receipt OCR / Scan-to-Expense Wizard](#receipt-ocr--scan-to-expense-wizard)

---

## Receipt OCR / Scan-to-Expense Wizard

**Status:** Idea captured. Approach decided: Tesseract.js, invoked from a Firebase Function.

### Summary

Add an option in the add-expense flow to create an expense from a photo of a receipt instead of manual entry. The app extracts the total, tax, tip (if present), and individual line items via OCR, then walks the user through a wizard that assigns each line item to a member (or leaves it unassigned/shared). The wizard tracks a running per-member total as items are assigned, and on completion hands off to the existing add-expense screen with the date, description, total, and per-member split amounts pre-filled for final review/submission.

### Rough flow

1. User taps a new "Scan receipt" entry point on the add-expense screen (alongside the existing camera/gallery/file/clipboard options already wired up via `CameraService` and `FileSelectionDialogComponent`).
2. Image is uploaded to a Firebase Function, which runs Tesseract.js OCR and parses the result into total/tax/tip/line items.
3. Parsed result: total, tax, tip, and a list of `{ description, amount }` line items. Low-confidence or unparseable lines should surface for manual entry rather than silently dropping data.
4. Wizard dialog iterates line items one at a time: "Who gets `<description>` — `<amount>`?" with member chips/select plus a "shared/no one" option. Running per-member subtotal shown throughout.
5. On completion, wizard emits a payload similar to the existing `rentalPayload`/`memorizedExpense` handoff pattern (see `AddExpenseComponent.loadRentalExpense` / `loadMemorizedExpense` in [add-expense.component.ts](../src/app/features/expenses/add-expense/add-expense.component.ts)) — navigate to add-expense with router state carrying the parsed total, tax/tip handling, description, and per-member assigned amounts, and prefill `expenseModel`/`expenseFormData` accordingly. Tax/tip likely get folded into `sharedAmount` or distributed proportionally — needs a decision.
6. User reviews/adjusts on the normal add-expense screen and submits as usual — no changes needed to expense creation/validation logic itself.

### Open questions / decisions needed

- **Tax/tip allocation strategy** — proportional split across assigned items vs. dumping into `sharedAmount`.
- **Cost/quota** — per-scan pricing if using a paid API; need to decide whether this is gated (e.g., behind a usage cap) similar to other premium-feeling features.
- **Confidence handling** — how to present low-confidence line items so users can correct rather than trust bad OCR silently.

### Package/service options surveyed (not yet decided)

| Option | Type | Fit notes |
|---|---|---|
| **Google Cloud Document AI — Expense Parser** | Purpose-built receipt/expense parser (managed) | Same GCP project as existing Firebase/Firestore/Secret Manager usage; returns structured line items, total, tax, tip with confidence scores. Paid per page, free tier available. Best accuracy-to-effort ratio given we are already on GCP. |
| **Google Cloud Vision API (`@google-cloud/vision`)** | Generic OCR (text/document detection) | Cheaper and simpler than Document AI, but returns raw text/bounding boxes only — we would own all the total/tax/tip/line-item parsing heuristics ourselves. More fragile across receipt formats. |
| **AWS Textract — `AnalyzeExpense`** | Purpose-built receipt/invoice parser (managed) | Excellent accuracy specifically for receipts, but introduces an AWS account/credentials into an otherwise all-GCP/Firebase stack. |
| **Azure AI Document Intelligence — prebuilt receipt model** | Purpose-built receipt parser (managed) | Same trade-off as Textract — great accuracy, but a new cloud vendor to onboard. |
| **Taggun / Veryfi / Nanonets receipt APIs** | Third-party SaaS receipt-parsing APIs | Built specifically for this use case (line items, merchant, tax, tip out of the box), simple REST APIs. Smaller/less "big-3-cloud" vendors, pricing and reliability need vetting; worth a closer look if we want to avoid picking a full cloud OCR platform for one feature. |
| **Tesseract.js** | Open-source OCR (runs in-browser or Node, no API key/cost) | Free and works offline, but general-purpose text recognition only — no receipt structure awareness, and accuracy on real-world receipt photos (crumpled, skewed, thermal-print fading) is noticeably worse than the managed options above. Would need significant custom parsing logic and likely a pre-processing (deskew/contrast) step. |

**Decision (2026-07-27):** Going with Tesseract.js, called from a Firebase Function rather than the client. No per-scan cost, no new cloud vendor/credentials to manage, and keeps the (currently free) OCR step server-side so it can be swapped out later without touching the client. Trade-off accepted: weaker out-of-the-box accuracy than a purpose-built receipt parser, and no structured line-item output — we own the total/tax/tip/line-item parsing heuristics ourselves.

### Tesseract.js implementation notes

- Package: [`tesseract.js`](https://www.npmjs.com/package/tesseract.js) (currently v7.x). Pure WASM port of the Tesseract engine — runs directly in the Function's Node process, no native binary or shell-out involved.
- Do **not** use the separate `node-tesseract-ocr` wrapper package — it shells out to a system Tesseract binary and has a known OS command-injection advisory in its `recognize()` function. `tesseract.js` avoids this entirely since it never spawns a subprocess.
- No maintained npm package does structured receipt parsing (total/tax/tip/line-items) on top of raw OCR text — the field is thin/outdated (e.g. `receipt-scanner` on npm is ~9 years stale). We will need to write our own parsing layer on top of Tesseract's word/line bounding-box output: look for `TOTAL`/`TAX`/`TIP`/`SUBTOTAL` keywords and currency-formatted amounts, and treat remaining rows with a description + trailing amount as line items.
- Likely want an image pre-processing step (deskew/contrast/binarize, e.g. via `sharp`) before handing the image to Tesseract — accuracy on real phone photos of receipts (skew, shadows, thermal-print fading) degrades quickly without it.
- Firebase Function should validate/cap image size and timeout, since Tesseract recognition is CPU-bound and slower than a managed API call.
