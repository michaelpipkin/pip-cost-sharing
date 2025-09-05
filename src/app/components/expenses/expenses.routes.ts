import { Routes } from '@angular/router';
import { authGuard, groupGuard } from '@components/auth/guards.guard';
import { AddExpenseComponent } from './add-expense/add-expense.component';
import { editExpenseResolver } from './edit-expense.resolver';
import { EditExpenseComponent } from './edit-expense/edit-expense.component';
import { ExpensesComponent } from './expenses/expenses.component';

export const expensesRoutes: Routes = [
  {
    path: '',
    title: 'Expenses',
    component: ExpensesComponent,
  },
  {
    path: 'add',
    title: 'Add Expense',
    component: AddExpenseComponent,
  },
  {
    path: ':id',
    title: 'Edit Expense',
    component: EditExpenseComponent,
    resolve: { expense: editExpenseResolver },
  },
];
