import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { concatMap, from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  constructor(private db: AngularFirestore) {}

  getExpensesForGroup(groupId: string): Observable<Expense[]> {
    return this.db
      .collectionGroup('splits', (ref) => ref.where('groupId', '==', groupId))
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const splits = res.map((split) => {
            return new Split({
              ...split,
            });
          });
          return this.db
            .collection<Expense>(`groups/${groupId}/expenses`)
            .valueChanges({ idField: 'id' })
            .pipe(
              map((expenses: Expense[]) => {
                return <Expense[]>expenses.map((expense) => {
                  return new Expense({
                    ...expense,
                    splits: splits.filter((s) => s.expenseId === expense.id),
                  });
                });
              })
            );
        })
      );
  }

  getExpense(groupId: string, expenseId: string): Observable<Expense> {
    return this.db
      .doc<Expense>(`groups/${groupId}/expenses/${expenseId}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((expense: Expense) => {
          return new Expense({
            ...expense,
          });
        })
      );
  }

  addExpense(groupId: string, expense: Partial<Expense>): Observable<any> {
    return from(this.db.collection(`groups/${groupId}/expenses`).add(expense));
  }

  updateExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>
  ): Observable<any> {
    return from(
      this.db.doc(`groups/${groupId}/expenses/${expenseId}`).update(changes)
    );
  }

  deleteExpense(groupId: string, expenseId: string): Observable<any> {
    return from(
      this.db.doc(`groups/${groupId}/expenses/${expenseId}`).delete()
    );
  }
}
