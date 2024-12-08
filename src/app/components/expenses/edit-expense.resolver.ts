import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Expense } from '@models/expense';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';

export const editExpenseResolver: ResolveFn<Expense> = (route) => {
  const expenseService = inject(ExpenseService);
  const groupService = inject(GroupService);
  const expenseId = route.paramMap.get('id');
  const groupId = groupService.currentGroup().id;

  return expenseService.getExpense(groupId, expenseId);
};
