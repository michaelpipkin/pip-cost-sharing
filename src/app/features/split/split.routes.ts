import { Routes } from '@angular/router';
import { SplitComponent } from './split/split.component';

export const splitRoutes: Routes = [
  {
    path: '',
    title: 'Split Expense',
    component: SplitComponent,
    data: {
      description:
        'Split an expense in seconds — no sign-up required. Enter the total, add participants, and instantly see who owes what.',
      ogTitle: 'Quick Expense Splitter – PipSplit',
    },
  },
];
