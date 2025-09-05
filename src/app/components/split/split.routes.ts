import { Routes } from '@angular/router';
import { SplitComponent } from './split/split.component';

export const splitRoutes: Routes = [
  {
    path: '',
    title: 'Split Expense',
    component: SplitComponent,
  },
];