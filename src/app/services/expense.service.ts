import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { concatMap, from, map, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  constructor(private db: AngularFirestore) {}

  getExpensesWithSplitsForGroup(groupId: string): Observable<Expense[]> {
    return this.db
      .collection(`groups/${groupId}/splits`)
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const splits = res.map((split) => {
            return new Split({
              ...split,
            });
          });
          return this.db
            .collection<Expense>(`groups/${groupId}/expenses`, (ref) =>
              ref.orderBy('date')
            )
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

  getMemorizedExpensesWithSplitsForGroup(
    groupId: string
  ): Observable<Expense[]> {
    return this.db
      .collection(`groups/${groupId}/splits`)
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const splits = res.map((split) => {
            return new Split({
              ...split,
            });
          });
          return this.db
            .collection<Expense>(`groups/${groupId}/memorized`)
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

  getExpensesForGroup(groupId: string): Observable<Expense[]> {
    return this.db
      .collection<Expense>(`groups/${groupId}/expenses`, (ref) =>
        ref.orderBy('date')
      )
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

  getExpenseWithSplits(
    groupId: string,
    expenseId: string
  ): Observable<Expense> {
    return this.db
      .collection(`groups/${groupId}/splits`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const splits = res.map((split) => {
            return new Split({
              ...split,
            });
          });
          return this.db
            .doc<Expense>(`groups/${groupId}/expenses/${expenseId}`)
            .valueChanges({ idField: 'id' })
            .pipe(
              map((expense: Expense) => {
                return new Expense({
                  ...expense,
                  splits: splits,
                });
              })
            );
        })
      );
  }

  getMemorizedExpenseWithSplits(
    groupId: string,
    expenseId: string
  ): Observable<Expense> {
    return this.db
      .collection(`groups/${groupId}/splits`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const splits = res.map((split) => {
            return new Split({
              ...split,
            });
          });
          return this.db
            .doc<Expense>(`groups/${groupId}/memorized/${expenseId}`)
            .valueChanges({ idField: 'id' })
            .pipe(
              map((expense: Expense) => {
                return new Expense({
                  ...expense,
                  splits: splits,
                });
              })
            );
        })
      );
  }

  addExpense(
    groupId: string,
    expenseId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[]
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/expenses/${expenseId}`
    ).ref;
    batch.set(expenseRef, expense);
    splits.forEach((split) => {
      const splitId = this.db.createId();
      const splitRef = this.db.doc(`/groups/${groupId}/splits/${splitId}`).ref;
      batch.set(splitRef, split);
    });
    return from(batch.commit());
  }

  memorizeExpense(
    groupId: string,
    expenseId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[]
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/memorized/${expenseId}`
    ).ref;
    batch.set(expenseRef, expense);
    splits.forEach((split) => {
      const splitId = this.db.createId();
      const splitRef = this.db.doc(`/groups/${groupId}/splits/${splitId}`).ref;
      batch.set(splitRef, split);
    });
    return from(batch.commit());
  }

  updateExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>,
    splits: Partial<Split>[]
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/expenses/${expenseId}`
    ).ref;
    batch.update(expenseRef, changes);
    return this.db
      .collection(`/groups/${groupId}/splits/`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
        })
      )
      .pipe(
        tap(() => {
          splits.forEach((split) => {
            const splitId = this.db.createId();
            const splitRef = this.db.doc(
              `/groups/${groupId}/splits/${splitId}`
            ).ref;
            split.expenseId = expenseId;
            batch.set(splitRef, split);
          });
          return from(batch.commit());
        })
      );
  }

  updateMemorizedExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>,
    splits: Partial<Split>[]
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/memorized/${expenseId}`
    ).ref;
    batch.update(expenseRef, changes);
    return this.db
      .collection(`/groups/${groupId}/splits/`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
        })
      )
      .pipe(
        tap(() => {
          splits.forEach((split) => {
            const splitId = this.db.createId();
            const splitRef = this.db.doc(
              `/groups/${groupId}/splits/${splitId}`
            ).ref;
            split.expenseId = expenseId;
            batch.set(splitRef, split);
          });
          return from(batch.commit());
        })
      );
  }

  deleteExpense(groupId: string, expenseId: string): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/expenses/${expenseId}`
    ).ref;
    return this.db
      .collection(`/groups/${groupId}/splits/`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
        })
      )
      .pipe(
        tap(() => {
          batch.delete(expenseRef);
          return from(batch.commit());
        })
      );
  }

  deleteMemorizedExpense(groupId: string, expenseId: string): Observable<any> {
    const batch = this.db.firestore.batch();
    const expenseRef = this.db.doc(
      `/groups/${groupId}/memorized/${expenseId}`
    ).ref;
    return this.db
      .collection(`/groups/${groupId}/splits/`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
        })
      )
      .pipe(
        tap(() => {
          batch.delete(expenseRef);
          return from(batch.commit());
        })
      );
  }
}
