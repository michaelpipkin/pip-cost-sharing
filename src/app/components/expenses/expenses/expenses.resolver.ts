import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';
import { Expense } from '@models/expense';
import { ExpenseService } from '@services/expense.service';

export const expensesResolver: ResolveFn<Expense[]> = (
  _route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot
) => {
  const expenseService = inject(ExpenseService);
  return expenseService.groupExpenses();
};
