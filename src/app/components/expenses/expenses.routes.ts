import { Routes } from '@angular/router';
import { authGuard, groupGuard } from '@components/auth/guards.guard';
import { AddExpenseComponent } from './add-expense/add-expense.component';
import { editExpenseResolver } from './edit-expense.resolver';
import { EditExpenseComponent } from './edit-expense/edit-expense.component';
import { ExpensesComponent } from './expenses/expenses.component';

export const expensesRoutes: Routes = [
  {
    path: 'expenses',
    title: 'Expenses',
    component: ExpensesComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'expenses/add',
    title: 'Add Expense',
    component: AddExpenseComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'expenses/:id',
    title: 'Edit Expense',
    component: EditExpenseComponent,
    resolve: { expense: editExpenseResolver },
    canActivate: [authGuard, groupGuard],
  },
];
