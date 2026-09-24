import { GuidedTourStep } from '@models/guided-tour';

/** What the Summary tour needs from the page to demonstrate each step. */
export interface SummaryTourHooks {
  /** True when the page is showing sample balances (nothing unpaid). */
  usingSample(): boolean;
  /** True when the Fewest Transfers Settlement section shows (3+ members). */
  hasSettlement(): boolean;
  /** Shows one section at a time on small screens. */
  showView(view: 'individual' | 'settlement'): void;
  /** Expands the first row to show its category breakdown. */
  expandFirst(): void;
  collapse(): void;
  openSettleGroup(): Promise<void>;
  closeDialogs(): void;
}

export function buildSummaryTourSteps(
  hooks: SummaryTourHooks
): GuidedTourStep[] {
  const individual = () => {
    hooks.closeDialogs();
    hooks.collapse();
    hooks.showView('individual');
  };
  const settlement = () => {
    hooks.closeDialogs();
    hooks.collapse();
    hooks.showView('settlement');
  };
  const hasSettlement = () => hooks.hasSettlement();
  const done = hasSettlement() ? '' : " That's the tour!";

  return [
    {
      id: 'intro',
      title: 'Summary',
      text:
        'This page adds up the unpaid expenses to show who owes whom, and lets you record payments.' +
        (hooks.usingSample()
          ? ' Nothing is owed right now, so the tour uses some sample balances.'
          : ''),
      beforeShow: individual,
    },
    {
      id: 'member',
      title: 'Pick a member',
      text: 'The table shows what this member owes each other member and what each one owes them. It starts on you.',
      target: 'summary-member',
      beforeShow: individual,
    },
    {
      id: 'dates',
      title: 'Limit by date',
      text: 'Enter a start date, an end date, or both to include only expenses in that range. The dates apply to everything on the page.',
      target: 'summary-dates',
      beforeShow: individual,
    },
    {
      id: 'table',
      title: 'Who owes whom',
      text: 'Each row nets out everything two members owe each other, so there is one amount in one direction.',
      target: 'summary-table',
      beforeShow: individual,
    },
    {
      id: 'breakdown',
      title: 'See the breakdown',
      text: 'Click a row to see its amount by category. The copy button copies the breakdown to paste into a message.',
      target: 'summary-detail',
      beforeShow: () => {
        hooks.closeDialogs();
        hooks.showView('individual');
        hooks.expandFirst();
      },
    },
    {
      id: 'request-pay',
      title: 'Request or record a payment',
      text:
        "The envelope emails a payment request to the member who owes; only members who've registered can get it. The $ button records a payment: it shows the payee's payment handles from their account page, then marks every split between the two members paid and adds the payment to History." +
        done,
      target: ['summary-actions-header', 'summary-actions'],
      placement: 'left',
      beforeShow: individual,
    },
    {
      id: 'settlement',
      title: 'Fewest transfers',
      text: "With three or more members, this works out each member's overall balance and the fewest payments that settle everyone. If Alex owes you and you owe Jordan, Alex might pay Jordan directly instead.",
      target: ['summary-view-toggle', 'least-transfers'],
      when: hasSettlement,
      beforeShow: settlement,
    },
    {
      id: 'settlement-actions',
      title: 'Share the plan',
      text: 'Request All Payments emails everyone who owes (skipping anyone not registered or opted out). Copy Settlement copies the list of transfers.',
      target: 'settlement-actions',
      when: hasSettlement,
      beforeShow: settlement,
    },
    {
      id: 'settle-group',
      title: 'Settle the group',
      text: "Once everyone has made their transfers, Settle Group asks you to confirm them, then marks every unpaid expense in the date range paid and records each transfer in History. That's the tour!",
      target: ['settle-group-dialog-title', 'settle-group-dialog-actions'],
      placement: 'right',
      when: hasSettlement,
      beforeShow: () => {
        hooks.collapse();
        hooks.showView('settlement');
        return hooks.openSettleGroup();
      },
    },
  ];
}
