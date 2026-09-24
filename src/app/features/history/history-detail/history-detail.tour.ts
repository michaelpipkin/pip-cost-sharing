import { GuidedTourStep } from '@models/guided-tour';

/** What the Payment Detail tour needs from the page to demonstrate each step. */
export interface HistoryDetailTourHooks {
  /** A group settlement rather than a payment between two members. */
  isGroupSettle(): boolean;
  /** False for a group settlement recorded without its splits. */
  hasBreakdown(): boolean;
  /** Admins can unpay splits and payments. */
  isAdmin(): boolean;
  showView(view: 'details' | 'summary'): void;
}

export function buildHistoryDetailTourSteps(
  hooks: HistoryDetailTourHooks
): GuidedTourStep[] {
  const settle = hooks.isGroupSettle();
  const details = () => hooks.showView('details');

  const steps: GuidedTourStep[] = [
    {
      id: 'intro',
      title: 'Payment detail',
      text: settle
        ? 'This is a group settlement: every transfer recorded when the group was settled on this date.'
        : 'This is one recorded payment: who paid whom, when, and how much.',
      target: 'payment-summary',
      beforeShow: details,
    },
    {
      id: 'copy',
      title: 'Share it',
      text: 'Copy puts a summary of the payment, with its category breakdown, on your clipboard to paste into a message.',
      target: 'payment-copy',
      beforeShow: details,
    },
    {
      id: 'view',
      title: 'Two views',
      text: 'Switch between every split the payment covered and the same splits totaled by category.',
      target: 'payment-view',
      when: () => hooks.hasBreakdown(),
      beforeShow: details,
    },
    {
      id: 'splits',
      title: 'Split details',
      text: settle
        ? 'Every split the settlement paid. Click one to open its expense.'
        : 'Every split the payment covered. Click one to open its expense. A negative amount is a split owed the other way, netted out of the payment.',
      target: 'payment-splits',
      when: () => hooks.hasBreakdown(),
      beforeShow: details,
    },
    {
      id: 'categories',
      title: 'Summary by category',
      text: 'The same splits, totaled by category.',
      target: 'payment-categories',
      when: () => hooks.hasBreakdown(),
      beforeShow: () => hooks.showView('summary'),
    },
    {
      id: 'unpay-split',
      title: 'Unpay one split',
      text: 'Paid a split by mistake? Unpay marks just that split unpaid and removes it from this payment, and the total updates. If it was the last split, the record is deleted.',
      target: ['payment-unpay-split-header', 'payment-unpay-split'],
      placement: 'left',
      when: () => hooks.isAdmin() && !settle && hooks.hasBreakdown(),
      beforeShow: details,
    },
    {
      id: 'unpay-all',
      title: settle ? 'Undo the settlement' : 'Undo the payment',
      text: settle
        ? 'Unpay Group Settle marks every split from the settlement unpaid again and deletes all of its transfer records. Everyone involved who can receive emails is notified.'
        : "Unpay Payment marks every split in this payment unpaid again and deletes this record. Both members are emailed, if they're registered and haven't opted out.",
      target: 'payment-unpay-all',
      when: () => hooks.isAdmin(),
      beforeShow: details,
    },
  ];

  // End on whichever step is last for this person and payment
  // (findLast needs the ES2023 lib; the app targets ES2022)
  const last = [...steps].reverse().find((s) => s.when?.() ?? true);
  if (last) last.text += " That's the tour!";
  return steps;
}
