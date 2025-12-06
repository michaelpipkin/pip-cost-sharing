import { Expense, ExpenseDto } from '@models/expense';
import { SplitDto } from '@models/split';
import { DocumentReference } from 'firebase/firestore';

export interface IExpenseService {
  getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Expense[]>;
  addExpense(
    groupId: string,
    expense: Partial<ExpenseDto>,
    splits: Partial<SplitDto>[],
    receipt: File | null
  ): Promise<DocumentReference<Expense> | Error>;
  updateExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    changes: Partial<ExpenseDto>,
    splits: Partial<SplitDto>[],
    receipt: File | null
  ): Promise<any>;
  deleteExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>
  ): Promise<any>;
}
