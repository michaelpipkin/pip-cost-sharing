import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { updateDoc } from '@angular/fire/firestore';
import { Split } from '@models/split';
import { from, map, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  constructor(private db: AngularFirestore) {}

  moveSplitsToGroupLevel(): Observable<any> {
    const batch = this.db.firestore.batch();
    return this.db
      .collectionGroup('splits')
      .valueChanges({ idField: 'id' })
      .pipe(
        map((splits: Split[]) => {
          splits.forEach((doc) => {
            const groupId = doc.groupId;
            const split: Partial<Split> = {
              expenseId: doc.expenseId,
              categoryId: doc.categoryId,
              assignedAmount: doc.assignedAmount,
              allocatedAmount: doc.allocatedAmount,
              paidByMemberId: doc.paidByMemberId,
              owedByMemberId: doc.owedByMemberId,
              paid: doc.paid ?? false,
            };
            const deleteRef = this.db.doc(
              `groups/${groupId}/expenses/${split.expenseId}/splits/${split.id}`
            ).ref;
            batch.delete(deleteRef);
            const splitId = this.db.createId();
            const addRef = this.db.doc(
              `groups/${groupId}/splits/${splitId}`
            ).ref;
            batch.set(addRef, split);
          });
          return from(batch.commit());
        })
      );
  }

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

  getUnpaidSplitsForGroup(groupId: string): Observable<Split[]> {
    return this.db
      .collection<Split>(`groups/${groupId}/splits`, (ref) =>
        ref.where('paid', '==', false)
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

  paySplitsBetweenMembers(
    groupId: string,
    member1Id: string,
    member2Id: string
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    return this.db
      .collection<Split>(`groups/${groupId}/splits`, (ref) =>
        ref
          .where('paidByMemberId', 'in', [member1Id, member2Id])
          .where('owedByMemberId', 'in', [member1Id, member2Id])
          .where('paid', '==', false)
      )
      .get()
      .pipe(
        map((querySnap) => {
          querySnap.docs.forEach((doc) => {
            batch.update(doc.ref, { paid: true });
          });
          return from(batch.commit());
        })
      );
  }
}
