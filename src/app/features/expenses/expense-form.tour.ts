import { WritableSignal } from '@angular/core';
import { GuidedTourStep } from '@models/guided-tour';
import { SplitMethod } from '@utils/split-method';

/** The four pages that share the expense form layout, and its tour. */
export type ExpenseFormTourVariant =
  'add-expense' | 'edit-expense' | 'add-memorized' | 'edit-memorized';

/** What the tour needs from the page to demonstrate each step. */
export interface ExpenseFormTourHooks {
  /** Fills in a sample expense where the form is still empty (add pages). */
  loadSample(): void;
  /** Switches the split method, filling sample %/shares when switching. */
  setSplitMethod(method: SplitMethod): void;
  /** False when the group has a single category (the field is hidden). */
  categoryVisible(): boolean;
  /** Edit Expense only: the expense came from the vacation rental wizard. */
  hasRental?(): boolean;
  /** Edit Expense only: a receipt is already attached. */
  hasReceipt?(): boolean;
}

// ---------------------------------------------------------------------------
// Page state: snapshot, sample data and split switching
// ---------------------------------------------------------------------------

interface TourSplit {
  assignedAmount: string;
  percentage: number | null;
  shares: number | null;
}

interface TourModel {
  splits: TourSplit[];
}

interface TourFormData {
  description: string;
  amount: string;
  allocatedAmount: string;
}

/** The page's form signals and helpers the tour drives. */
export interface ExpenseFormTourState<
  M extends TourModel,
  F extends TourFormData,
> {
  model: WritableSignal<M>;
  formData: WritableSignal<F>;
  splitMethod: WritableSignal<SplitMethod>;
  /** Edit pages: the "has unsaved changes" flag, restored with the form. */
  dirty?: WritableSignal<boolean>;
  recalculate: () => void;
  formatAmount: (value: number) => string;
  toNumber: (value: string) => number;
  /** Add pages: adds a split per active member; enables the sample expense. */
  addAllMembers?: () => void;
  /** Description used for the sample (defaults to a dinner out). */
  sampleDescription?: string;
}

/**
 * Fills sample percentages or shares for a split method the tour switches
 * to, when none are entered yet (so the switch shows a worked example).
 * Returns the splits unchanged otherwise.
 */
export function withSampleSplitValues<S extends TourSplit>(
  method: SplitMethod,
  splits: S[]
): S[] {
  if (method === 'percentage' && splits.every((s) => !s.percentage)) {
    // 40% for the first member, the rest split the remainder; the last
    // member's percentage is calculated automatically
    const others = splits.length > 1 ? Math.floor(60 / (splits.length - 1)) : 0;
    return splits.map((s, i) => ({ ...s, percentage: i === 0 ? 40 : others }));
  }
  if (method === 'shares' && splits.every((s) => !s.shares)) {
    // Includes a fractional share to show decimals are allowed
    const sample = [2, 1.5];
    return splits.map((s, i) => ({ ...s, shares: sample[i] ?? 1 }));
  }
  return splits;
}

/**
 * Captures the form as it is now and returns the hooks the tour uses to
 * change it, plus `restore()` to put it back exactly. Form updates are
 * immutable (spread/map), so holding the current objects is enough.
 */
export function createExpenseFormTour<
  M extends TourModel,
  F extends TourFormData,
>(state: ExpenseFormTourState<M, F>) {
  const snapshot = {
    model: state.model(),
    formData: state.formData(),
    splitMethod: state.splitMethod(),
    dirty: state.dirty?.(),
  };
  const isZero = (value: string) => state.toNumber(value) === 0;

  const setSplitMethod = (method: SplitMethod) => {
    state.splitMethod.set(method);
    state.model.update((m) => ({
      ...m,
      splits: withSampleSplitValues(method, m.splits),
    }));
    state.recalculate();
  };

  /** Sample dinner; only fills what the user hasn't entered. */
  const loadSample = () => {
    if (!state.addAllMembers) return;
    const hasAmounts = !isZero(state.formData().amount);
    state.formData.update((fd) => ({
      ...fd,
      description: fd.description || (state.sampleDescription ?? 'Dinner out'),
      amount: hasAmounts ? fd.amount : state.formatAmount(100),
      allocatedAmount: hasAmounts ? fd.allocatedAmount : state.formatAmount(15),
    }));
    if (state.model().splits.length === 0) state.addAllMembers();
    if (!hasAmounts) {
      const personal = [30, 25];
      state.model.update((m) => ({
        ...m,
        splits: m.splits.map((s, i) =>
          i < personal.length && isZero(s.assignedAmount)
            ? { ...s, assignedAmount: state.formatAmount(personal[i]!) }
            : s
        ),
      }));
    }
    setSplitMethod('amount');
  };

  const restore = () => {
    state.splitMethod.set(snapshot.splitMethod);
    state.model.set(snapshot.model);
    state.formData.set(snapshot.formData);
    if (snapshot.dirty !== undefined) state.dirty?.set(snapshot.dirty);
  };

  return { hooks: { loadSample, setSplitMethod }, restore };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export function buildExpenseFormTourSteps(
  variant: ExpenseFormTourVariant,
  hooks: ExpenseFormTourHooks
): GuidedTourStep[] {
  const isAdd = variant === 'add-expense' || variant === 'add-memorized';
  const isExpense = variant === 'add-expense' || variant === 'edit-expense';

  // Steps that depend on the split method set it themselves, so Back always
  // shows the form in the state its text describes
  const amountMode = () => hooks.setSplitMethod('amount');

  const intro: Record<ExpenseFormTourVariant, [string, string]> = {
    'add-expense': [
      'Adding an expense',
      "This quick tour walks through the form. We'll fill in a sample dinner so you can see how everything works together. Anything you've already entered comes back when the tour ends.",
    ],
    'edit-expense': [
      'Editing an expense',
      'This quick tour walks through the form. Along the way it switches the split method to show each option, and everything is put back exactly as it was when the tour ends.',
    ],
    'add-memorized': [
      'Memorizing an expense',
      "A memorized expense is a template for a bill that repeats, like rent or a subscription. This quick tour fills in a sample so you can see how the form works. Anything you've already entered comes back when the tour ends.",
    ],
    'edit-memorized': [
      'Editing a memorized expense',
      'This quick tour walks through the template. Along the way it switches the split method to show each option, and everything is put back exactly as it was when the tour ends.',
    ],
  };

  const save: Record<ExpenseFormTourVariant, [string, string]> = {
    'add-expense': [
      'Save it',
      "Save enables once the whole total is allocated. Save & Add Another keeps you on this page for the next expense. That's the tour!",
    ],
    'edit-expense': [
      'Save your changes',
      "Save enables once you've changed something and the whole total is allocated. Delete removes the expense. That's the tour!",
    ],
    'add-memorized': [
      'Save the template',
      "Save enables once the whole total is allocated. Later, the + button on the Memorized page turns the template into a real expense, ready to date and save. That's the tour!",
    ],
    'edit-memorized': [
      'Save your changes',
      "Save enables once you've changed something and the whole total is allocated. Delete removes the template; expenses already created from it aren't affected. That's the tour!",
    ],
  };

  const steps: (GuidedTourStep | false)[] = [
    {
      id: 'intro',
      title: intro[variant][0],
      text: intro[variant][1],
      beforeShow: () => hooks.loadSample(),
    },
    {
      id: 'payer',
      title: 'Who paid',
      text: isAdd
        ? 'Choose the member who paid for the expense. It defaults to you.'
        : 'The member who paid for the expense.',
      target: 'payer',
    },
    isExpense && {
      id: 'date',
      title: 'When it happened',
      text: 'Pick the date, or type in the field and use shortcuts: + and - move a day forward or back, t sets today, and m or y jump to the first day of the month or year.',
      target: 'date',
    },
    {
      id: 'description',
      title: 'What it was for',
      text: hooks.categoryVisible()
        ? 'Describe the expense and choose a category. Categories let you filter and total expenses later.'
        : 'Describe the expense so everyone recognizes it later.',
      target: ['description', 'category'],
    },
    {
      id: 'total',
      title: 'Total amount',
      text: 'Enter the grand total exactly as charged, including tax and tip. The calculator button opens a popup calculator; press = to put the result back in the field.',
      target: 'total',
      beforeShow: amountMode,
    },
    {
      id: 'proportional',
      title: 'Tax, tip, and other proportional costs',
      text: "Enter the part of the total, like tax and tip, that should be split in proportion to what each person ordered. It's included in the total above, not added on top. This field is available when splitting by amount.",
      target: 'proportional',
      beforeShow: amountMode,
    },
    {
      id: 'remainder',
      title: 'Evenly shared remainder',
      text: "Whatever isn't assigned to someone personally, like a shared appetizer, is split evenly. This updates automatically as you change the amounts.",
      target: 'remainder',
      beforeShow: amountMode,
    },
    {
      id: 'splits-amount',
      title: 'Who owes what',
      text: "Each member gets a split line. Enter what they're personally responsible for in Member Amount. Their Allocated Amount (personal, plus their share of the remainder and of the tax and tip) updates automatically.",
      target: 'splits',
      beforeShow: amountMode,
    },
    {
      id: 'split-method',
      title: 'Choose how to split',
      text: 'Split by exact amounts, by percentage, or by shares. The next two steps show % and Shares.',
      target: 'split-method',
      beforeShow: amountMode,
    },
    {
      id: 'splits-percentage',
      title: 'Split by percentage',
      text: "Enter each member's percentage. The last member's percentage is filled in automatically so the total is always 100%.",
      target: 'splits',
      beforeShow: () => hooks.setSplitMethod('percentage'),
    },
    {
      id: 'splits-shares',
      title: 'Split by shares',
      text: "Enter a share for each member to split by ratio, like 2:1, without working out percentages. Shares don't have to be whole numbers (1.5 works), and each member's effective percentage shows next to their shares.",
      target: 'splits',
      beforeShow: () => hooks.setSplitMethod('shares'),
    },
    {
      id: 'add-splits',
      title: 'Adding members',
      text: isAdd
        ? "Add New Split adds one split line. Add All Members adds a line for every active member not already listed. Both are grayed out once everyone's on the list."
        : "Add New Split adds a line for another member. It's grayed out once everyone's on the list.",
      target: isAdd ? ['add-split', 'add-all-members'] : 'add-split',
      beforeShow: amountMode,
    },
    variant === 'edit-expense' && {
      id: 'rental',
      title: 'Vacation rental',
      text: 'This expense came from the Vacation Rental wizard. Edit Occupancy Grid reopens the grid so you can change who stayed which nights.',
      target: 'rental',
      when: () => hooks.hasRental?.() ?? false,
      beforeShow: amountMode,
    },
    isExpense && {
      id: 'receipt',
      title: 'Attach a receipt',
      text: hooks.hasReceipt?.()
        ? 'View Receipt opens the attached receipt, and uploading a PDF or image (up to 5MB) replaces it. Receipts are deleted automatically 90 days after the expense is fully paid, so keep a copy if you need one for your records.'
        : 'Upload a PDF or image of the receipt, up to 5MB. Receipts are deleted automatically 90 days after the expense is fully paid, so keep a copy if you need one for your records.',
      target: isAdd ? 'receipt' : ['receipt', 'view-receipt'],
      beforeShow: amountMode,
    },
    {
      id: 'save',
      title: save[variant][0],
      text: save[variant][1],
      target: 'save-actions',
      placement: 'top',
      beforeShow: amountMode,
    },
  ];

  return steps.filter((step): step is GuidedTourStep => !!step);
}
