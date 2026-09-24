import { GuidedTourStep } from '@models/guided-tour';

/** What the Scan Receipt tour needs from the page to demonstrate each step. */
export interface ScanReceiptTourHooks {
  /** True when nothing was scanned yet, so the tour shows a sample. */
  usingSample(): boolean;
  /** Sample only: shows the photo picker (false) or the sample scan (true). */
  showScanned(scanned: boolean): void;
}

export function buildScanReceiptTourSteps(
  hooks: ScanReceiptTourHooks
): GuidedTourStep[] {
  const scanned = () => hooks.showScanned(true);

  return [
    {
      id: 'intro',
      title: 'Expense from a receipt',
      text:
        'Create an expense from a photo of a receipt instead of typing everything in.' +
        (hooks.usingSample()
          ? " We'll show a sample scan so you can see how it works."
          : ''),
      beforeShow: () => hooks.showScanned(false),
    },
    {
      id: 'select-photo',
      title: 'Choose a photo',
      text: 'Take or choose a photo of the receipt (a PDF works too). We scan it for the total, tax, tip, and line items, which can take a few seconds.',
      target: 'receipt-select',
      when: () => hooks.usingSample(),
      beforeShow: () => hooks.showScanned(false),
    },
    {
      id: 'file',
      title: 'Try another photo',
      text: 'If a photo scans poorly, Choose a Different Photo starts over. You can also just correct the fields by hand.',
      target: 'receipt-file',
      beforeShow: scanned,
    },
    {
      id: 'amounts',
      title: 'Check the amounts',
      text: 'Check the total, tax, tip, and description against the receipt; all of them can be edited. The total is the grand total, including tax and tip.',
      target: ['receipt-amounts', 'receipt-description'],
      beforeShow: scanned,
    },
    {
      id: 'items',
      title: 'Line items',
      text: "Every line item can be edited. A warning icon marks a line the scan wasn't sure about, so check those especially. Add Item adds a missing line, and the delete button removes one.",
      target: 'receipt-items',
      beforeShow: scanned,
    },
    {
      id: 'assign',
      title: 'Who bought what',
      text: 'Assign each item to whoever bought it, or leave it as Shared / No one if it was shared.',
      target: 'receipt-assign',
      beforeShow: scanned,
    },
    {
      id: 'totals',
      title: 'Running totals',
      text: "Each member's total covers their own items. Unassigned items are split evenly among the assigned members, and tax and tip are split in proportion to what each member bought.",
      target: 'receipt-totals',
      beforeShow: scanned,
    },
    {
      id: 'continue',
      title: 'Continue to the expense',
      text: "Continue opens Add Expense with the total, description, and each member's amount filled in and the receipt attached. Review it there and save. That's the tour!",
      target: 'receipt-actions',
      placement: 'top',
      beforeShow: scanned,
    },
  ];
}
