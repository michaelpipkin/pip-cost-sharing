import { Routes } from '@angular/router';
import { CategoriesComponent } from '@features/categories/categories/categories.component';
import { AddExpenseComponent } from '@features/expenses/add-expense/add-expense.component';
import { editExpenseResolver } from '@features/expenses/edit-expense.resolver';
import { EditExpenseComponent } from '@features/expenses/edit-expense/edit-expense.component';
import { ExpensesComponent } from '@features/expenses/expenses/expenses.component';
import { GroupsComponent } from '@features/groups/groups/groups.component';
import { HelpComponent } from '@features/help/help.component';
import { HistoryComponent } from '@features/history/history/history.component';
import { MembersComponent } from '@features/members/members/members.component';
import { AddMemorizedComponent } from '@features/memorized/add-memorized/add-memorized.component';
import { editMemorizedResolver } from '@features/memorized/edit-memorized.resolver';
import { EditMemorizedComponent } from '@features/memorized/edit-memorized/edit-memorized.component';
import { MemorizedComponent } from '@features/memorized/memorized/memorized.component';
import { SummaryComponent } from '@features/summary/summary/summary.component';

/**
 * Demo routes that mirror the main application routes but without auth guards
 * These routes use the same components as the real app, but the components
 * detect demo mode via the route path and disable data operations
 */
export const demoRoutes: Routes = [
  {
    path: 'administration',
    children: [
      {
        path: 'groups',
        title: 'Demo - Groups',
        component: GroupsComponent,
      },
      {
        path: 'members',
        title: 'Demo - Members',
        component: MembersComponent,
      },
      {
        path: 'categories',
        title: 'Demo - Categories',
        component: CategoriesComponent,
      },
    ],
  },
  {
    path: 'expenses',
    children: [
      {
        path: '',
        title: 'Demo - Expenses',
        component: ExpensesComponent,
      },
      {
        path: 'add',
        title: 'Demo - Add Expense',
        component: AddExpenseComponent,
      },
      {
        path: ':id',
        title: 'Demo - Edit Expense',
        component: EditExpenseComponent,
        resolve: { expense: editExpenseResolver },
      },
    ],
  },
  {
    path: 'memorized',
    children: [
      {
        path: '',
        title: 'Demo - Memorized',
        component: MemorizedComponent,
      },
      {
        path: 'add',
        title: 'Demo - Add Memorized Expense',
        component: AddMemorizedComponent,
      },
      {
        path: ':id',
        title: 'Demo - Edit Memorized Expense',
        component: EditMemorizedComponent,
        resolve: { memorized: editMemorizedResolver },
      },
    ],
  },
  {
    path: 'analysis',
    children: [
      {
        path: 'summary',
        title: 'Demo - Summary',
        component: SummaryComponent,
      },
      {
        path: 'history',
        title: 'Demo - History',
        component: HistoryComponent,
      },
    ],
  },
  {
    path: 'split',
    loadChildren: () =>
      import('@features/split/split.routes').then((m) => m.splitRoutes),
  },
  {
    path: 'help',
    title: 'Demo - Help',
    component: HelpComponent,
  },
  // Default redirect to split when entering demo mode
  {
    path: '',
    redirectTo: 'split',
    pathMatch: 'full',
  },
];
