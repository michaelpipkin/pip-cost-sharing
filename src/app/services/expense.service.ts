import { inject, Injectable, signal } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  collectionGroup,
  doc,
  Firestore,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  fs = inject(Firestore);

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

  async fixExpenses() {
    const expDocs = await getDocs(collectionGroup(this.fs, `expenses`));
    expDocs.docs.forEach(async (d) => {
      if (!('hasReceipt' in d.data())) {
        await updateDoc(d.ref, {
          hasReceipt: false,
        });
      }
    });
  }
}
