import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Expense } from '@models/expense';
import { from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ExpensesService {
  constructor(private db: AngularFirestore) {}

  getExpensesForGroup(groupId: string): Observable<Expense[]> {
    return this.db
      .collection<Expense>(`groups/${groupId}/expenses`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((expenses: Expense[]) => {
          return <Expense[]>expenses.map((expense) => {
            return new Expense({
              ...expense,
            });
          });
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
