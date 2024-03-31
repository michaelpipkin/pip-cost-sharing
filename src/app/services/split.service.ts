import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { updateDoc } from '@angular/fire/firestore';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { concatMap, from, map, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  constructor(private db: AngularFirestore) {}

  getSplitsForExpense(groupId: string, expenseId: string): Observable<Split[]> {
    return this.db
      .collection<Split>(`groups/${groupId}/splits`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((splits: Split[]) => {
          return <Split[]>splits.map((split) => {
            return new Split({
              ...split,
            });
          });
        })
      );
  }

  getSplitsForGroup(groupId: string): Observable<Split[]> {
    return this.db
      .collection<Split>(`groups/${groupId}/splits`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((splits: Split[]) => {
          return <Split[]>splits.map((split) => {
            return new Split({
              ...split,
            });
          });
        })
      );
  }

  getUnpaidSplitsForGroup(
    groupId: string,
    startDate: Date = null,
    endDate: Date = null
  ): Observable<Split[]> {
    if (startDate == null) {
      startDate = new Date('1/1/1900');
    }
    if (endDate == null) {
      const today = new Date();
      endDate = new Date(today.setFullYear(today.getFullYear() + 100));
    } else {
      endDate = new Date(endDate.setDate(endDate.getDate() + 1));
    }
    return this.db
      .collection<Expense>(`groups/${groupId}/expenses`, (ref) =>
        ref.where('date', '>=', startDate).where('date', '<', endDate)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        concatMap((res) => {
          const expenseIds = res.map((expense) => {
            return expense.id;
          });
          if (expenseIds.length > 0) {
            return this.db
              .collection<Split>(`groups/${groupId}/splits`, (ref) =>
                ref
                  .where('paid', '==', false)
                  .where('expenseId', 'in', expenseIds)
              )
              .valueChanges({ idField: 'id' })
              .pipe(
                map((splits: Split[]) => {
                  return <Split[]>splits.map((split) => {
                    return new Split({
                      ...split,
                    });
                  });
                })
              );
          } else return of([]);
        })
      );
  }

  getSplit(groupId: string, splitId: string): Observable<Split> {
    return this.db
      .doc<Split>(`groups/${groupId}/splits/${splitId}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((split: Split) => {
          return new Split({
            ...split,
          });
        })
      );
  }

  addSplit(groupId: string, split: Partial<Split>): Observable<any> {
    return from(this.db.collection(`groups/${groupId}/splits`).add(split));
  }

  updateSplit(
    groupId: string,
    splitId: string,
    changes: Partial<Split>
  ): Observable<any> {
    const docRef = this.db.doc(`groups/${groupId}/splits/${splitId}`).ref;
    return of(updateDoc(docRef, changes));
  }

  deleteSplit(groupId: string, splitId: string): Observable<any> {
    return from(this.db.doc(`groups/${groupId}/splits/${splitId}`).delete());
  }

  addSplits(groupId: string, splits: Partial<Split>[]): Observable<any> {
    const batch = this.db.firestore.batch();
    splits.forEach((split: Partial<Split>) => {
      const splitId = this.db.createId();
      const splitRef = this.db.doc(`/groups/${groupId}/splits/${splitId}`).ref;
      batch.set(splitRef, split);
    });
    return from(batch.commit());
  }

  clearSplits(groupId: string, expenseId: string): Observable<any> {
    const batch = this.db.firestore.batch();
    return this.db
      .collection<Split>(`groups/${groupId}/splits`, (ref) =>
        ref.where('expenseId', '==', expenseId)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.forEach((docSnap) => {
            batch.delete(docSnap.ref);
          });
          return from(batch.commit());
        })
      );
  }

  paySplitsBetweenMembers(groupId: string, splits: Split[]): Observable<any> {
    const batch = this.db.firestore.batch();
    splits.forEach((split) => {
      const docRef = this.db.doc(`groups/${groupId}/splits/${split.id}`).ref;
      batch.update(docRef, { paid: true });
    });
    return from(batch.commit());
  }
}
