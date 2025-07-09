import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { DocumentReference } from 'firebase/firestore';

export interface IExpenseService {
  getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Expense[]>;
  addExpense(
    groupId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[],
    receipt: File | null
  ): Promise<DocumentReference<Expense> | Error>;
  updateExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    changes: Partial<Expense>,
    splits: Partial<Split>[],
    receipt: File | null
  ): Promise<any>;
  deleteExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>
  ): Promise<void>;
}
