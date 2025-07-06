import { Expense } from '@models/expense';
import { Split } from '@models/split';

export interface IExpenseService {
  getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Expense[]>;
  addExpense(
    groupId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[]
  ): Promise<any>;
  updateExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>,
    splits: Partial<Split>[]
  ): Promise<any>;
  deleteExpense(groupId: string, expenseId: string): Promise<void>;
  updateAllExpensesPaidStatus(): Promise<boolean | Error>;
}
