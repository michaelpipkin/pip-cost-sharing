import { GuidedTourStep } from '@models/guided-tour';

/** What the Memorized tour needs from the page to demonstrate each step. */
export interface MemorizedTourHooks {
  /** True when the page is showing sample templates (none saved yet). */
  usingSample(): boolean;
  /** Expands the first row to show its splits. */
  expandFirst(): void;
  collapse(): void;
}

export function buildMemorizedTourSteps(
  hooks: MemorizedTourHooks
): GuidedTourStep[] {
  const collapsed = () => hooks.collapse();

  return [
    {
      id: 'intro',
      title: 'Memorized expenses',
      text:
        'Memorized expenses are templates for bills that repeat, like rent or a subscription, so you can add them again in a couple of clicks.' +
        (hooks.usingSample()
          ? " You haven't memorized any yet, so the tour shows two samples."
          : ''),
      beforeShow: collapsed,
    },
    {
      id: 'search',
      title: 'Find a template',
      text: 'Search by payer, description, or category.',
      target: 'memorized-search',
      beforeShow: collapsed,
    },
    {
      id: 'memorize-new',
      title: 'Memorize an expense',
      text: 'Memorize New Expense opens the same form as adding an expense, without the date. It has its own guided tour.',
      target: 'memorize-new',
      beforeShow: collapsed,
    },
    {
      id: 'table',
      title: 'Your templates',
      text: 'Click a memorized expense to edit or delete it.',
      target: 'memorized-table',
      beforeShow: collapsed,
    },
    {
      id: 'splits',
      title: 'See the splits',
      text: 'The arrow in the Splits column shows how the template divides the expense between members.',
      target: 'memorized-detail',
      beforeShow: () => hooks.expandFirst(),
    },
    {
      id: 'create',
      title: 'Create an expense from it',
      text: "The + button starts a new expense from the template, with everything filled in. Just check the date and amounts, then save. That's the tour!",
      target: 'memorized-create',
      placement: 'top',
      beforeShow: collapsed,
    },
  ];
}
