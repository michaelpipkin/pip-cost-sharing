import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Expense } from '@models/expense';
import { ExpenseService } from '@services/expense.service';
import { GroupStore } from '@store/group.store';

export const editExpenseResolver: ResolveFn<Expense> = (route) => {
  const expenseService = inject(ExpenseService);
  const groupStore = inject(GroupStore);
  const expenseId = route.paramMap.get('id')!;
  const groupId = groupStore.currentGroup()!.id;

  return expenseService.getExpense(groupId, expenseId);
};
