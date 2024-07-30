import { inject } from '@angular/core';
import { Expense } from '@models/expense';
import { ExpenseService } from '@services/expense.service';
import { ResolveFn } from '@angular/router';

export const expensesResolver: ResolveFn<Expense[]> = () => {
  const expenseService = inject(ExpenseService);
  return expenseService.groupExpenses();
};
