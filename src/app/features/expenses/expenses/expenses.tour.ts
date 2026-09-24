import { GuidedTourStep } from '@models/guided-tour';

/** What the Expenses tour needs from the page to demonstrate each step. */
export interface ExpensesTourHooks {
  /** True when the page is showing sample expenses (none to show). */
  usingSample(): boolean;
  /** Admins see the Mark Paid/Unpaid column in the split details. */
  isAdmin(): boolean;
  /** Expands the first expense to show its splits. */
  expandFirst(): void;
  collapse(): void;
  openAddExpenseOptions(): Promise<void>;
  closeDialogs(): void;
}

export function buildExpensesTourSteps(
  hooks: ExpensesTourHooks
): GuidedTourStep[] {
  const onPage = () => {
    hooks.closeDialogs();
    hooks.collapse();
  };
  const expanded = () => {
    hooks.closeDialogs();
    hooks.expandFirst();
  };

  return [
    {
      id: 'intro',
      title: 'Expenses',
      text:
        "This page lists your group's expenses and how each one is split." +
        (hooks.usingSample()
          ? " There aren't any expenses to show right now, so the tour uses a few samples."
          : ''),
      beforeShow: onPage,
    },
    {
      id: 'search',
      title: 'Find expenses',
      text: 'The page starts with unpaid expenses from the last 90 days. Change the dates, payer, or category, or turn off Unpaid only, then click Search Expenses. Up to 200 expenses load at a time.',
      target: ['expense-filters', 'expense-filter-selects', 'search-expenses'],
      beforeShow: onPage,
    },
    {
      id: 'add-expense',
      title: 'Add an expense',
      text: 'Add New Expense offers three ways to start.',
      target: 'add-expense',
      beforeShow: onPage,
    },
    {
      id: 'add-expense-options',
      title: 'Three ways to add',
      text: 'Enter an expense by hand, scan a photo of the receipt to fill in the total and line items, or use the vacation rental splitter when not everyone stayed every night.',
      target: 'add-expense-options',
      placement: 'right',
      beforeShow: () => {
        hooks.collapse();
        return hooks.openAddExpenseOptions();
      },
    },
    {
      id: 'table',
      title: 'Your expenses',
      text: 'Click an expense to edit it. Editing an expense marks all of its splits unpaid.',
      target: 'expenses-table',
      beforeShow: onPage,
    },
    {
      id: 'column-filters',
      title: 'Filter and sort',
      text: 'Use the filter icons in the column headers to narrow the list; you can combine several. Click Date to sort by date.',
      target: 'expenses-header',
      beforeShow: onPage,
    },
    {
      id: 'splits',
      title: 'See the splits',
      text: "The arrow in the Splits column shows who owes what and whether each split has been paid. The copy button copies a summary you can paste into a message.",
      target: 'expense-detail',
      beforeShow: expanded,
    },
    {
      id: 'mark-paid',
      title: 'Correct a split',
      text: "Admins can mark a single split paid or unpaid to fix a mistake. This doesn't record a payment in History; to record a payment between members, use the Summary page. That's the tour!",
      target: 'expense-mark',
      placement: 'left',
      when: () => hooks.isAdmin(),
      beforeShow: expanded,
    },
  ];
}
