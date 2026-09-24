import { GuidedTourStep } from '@models/guided-tour';

/** What the History tour needs from the page. */
export interface HistoryTourHooks {
  /** True when the page is showing sample payments (none recorded yet). */
  usingSample(): boolean;
}

export function buildHistoryTourSteps(
  hooks: HistoryTourHooks
): GuidedTourStep[] {
  return [
    {
      id: 'intro',
      title: 'History',
      text:
        'History lists the payments recorded in your group: payments between members, and group settlements.' +
        (hooks.usingSample()
          ? " No payments have been recorded yet, so the tour shows a few samples."
          : ''),
    },
    {
      id: 'member-select',
      title: 'Choose a member',
      text: 'Pick a member to see the payments made to and from them. It starts with you.',
      target: 'history-member',
    },
    {
      id: 'dates',
      title: 'Date range',
      text: 'The list starts with the last 30 days. Change or clear the dates to look further back.',
      target: 'history-dates',
    },
    {
      id: 'table',
      title: 'Payments',
      text: 'Each row is a payment to or from that member. Click a member payment to see exactly which expenses it paid off.',
      target: 'history-table',
    },
    {
      id: 'type',
      title: 'Payment type',
      text: "A person icon marks a payment between two members; a group icon marks a group settlement. Group settlements don't have a per-expense breakdown. That's the tour!",
      target: 'history-type',
      // Above the header, so the icons in the rows stay visible
      placement: 'top',
    },
  ];
}
