import { inject, Injectable, signal } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { IExpenseService } from './expense.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService implements IExpenseService {
  fs = inject(getFirestore);

  groupExpenses = signal<Expense[]>([]);

  getExpensesForGroup(groupId: string): void {
    const splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
    onSnapshot(splitQuery, (splitQuerySnap) => {
      const splits = [
        ...splitQuerySnap.docs.map((d) => new Split({ id: d.id, ...d.data() })),
      ];
      const expenseQuery = query(
        collection(this.fs, `groups/${groupId}/expenses`),
        orderBy('date')
      );
      onSnapshot(expenseQuery, (expenseQuerySnap) => {
        const expenses = [
          ...expenseQuerySnap.docs.map(
            (d) =>
              new Expense({
                id: d.id,
                ...d.data(),
                splits: splits.filter((s) => s.expenseId === d.id),
              })
          ),
        ];
        this.groupExpenses.set(expenses);
      });
    });
  }

  async getExpense(groupId: string, expenseId: string): Promise<Expense> {
    const d = doc(this.fs, `groups/${groupId}/expenses/${expenseId}`);
    const expenseDoc = await getDoc(d);
    if (!expenseDoc.exists()) {
      throw new Error('Expense not found');
    }
    const expense = new Expense({
      id: expenseDoc.id,
      ...expenseDoc.data(),
    });
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
    );
    const splitDocs = await getDocs(splitQuery);
    expense.splits = splitDocs.docs.map(
      (d) => new Split({ id: d.id, ...d.data() })
    );
    return expense;
  }

  async addExpense(
    groupId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(collection(this.fs, `/groups/${groupId}/expenses`));
    batch.set(expenseRef, expense);
    splits.forEach((split) => {
      split.expenseId = expenseRef.id;
      const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
      batch.set(splitRef, split);
    });
    return await batch
      .commit()
      .then(() => {
        return expenseRef.id;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>,
    splits: Partial<Split>[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    batch.update(
      doc(this.fs, `/groups/${groupId}/expenses/${expenseId}`),
      changes
    );
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });
    splits.forEach((split) => {
      split.expenseId = expenseId;
      const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
      batch.set(splitRef, split);
    });
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async deleteExpense(groupId: string, expenseId: string): Promise<any> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(this.fs, `/groups/${groupId}/expenses/${expenseId}`);
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(expenseRef);
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateAllExpensesPaidStatus(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);
    const expenseCollection = collectionGroup(this.fs, 'expenses');
    const splitsCollection = collectionGroup(this.fs, 'splits');
    const expenseDocs = await getDocs(expenseCollection);
    for (const expense of expenseDocs.docs) {
      const splitsQuery = query(
        splitsCollection,
        where('expenseId', '==', expense.id)
      );
      const splitsDocs = await getDocs(splitsQuery);
      const expenseUnpaid =
        splitsDocs.docs.filter((doc) => !doc.data().paid).length > 0;
      batch.update(expense.ref, { paid: !expenseUnpaid });
    }
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }
}
