import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { updateDoc } from '@angular/fire/firestore';
import { Split } from '@models/split';
import { from, map, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  constructor(private db: AngularFirestore) {}

  getSplitsForExpense(groupId: string, expenseId: string): Observable<Split[]> {
    return this.db
      .collection<Split>(`groups/${groupId}/expenses/${expenseId}/splits`)
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
      .collectionGroup<Split>('splits', (ref) =>
        ref.where('groupId', '==', groupId)
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

  getUnpaidSplitsForGroup(groupId: string): Observable<Split[]> {
    return this.db
      .collectionGroup<Split>('splits', (ref) =>
        ref.where('groupId', '==', groupId).where('paid', '==', false)
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

  getSplit(
    groupId: string,
    expenseId: string,
    splitId: string
  ): Observable<Split> {
    return this.db
      .doc<Split>(`groups/${groupId}/expenses/${expenseId}/splits/${splitId}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((split: Split) => {
          return new Split({
            ...split,
          });
        })
      );
  }

  addSplit(
    groupId: string,
    expenseId: string,
    split: Partial<Split>
  ): Observable<any> {
    return from(
      this.db
        .collection(`groups/${groupId}/expenses/${expenseId}/splits`)
        .add(split)
    );
  }

  updateSplit(
    groupId: string,
    expenseId: string,
    splitId: string,
    changes: Partial<Split>
  ): Observable<any> {
    const docRef = this.db.doc(
      `groups/${groupId}/expenses/${expenseId}/splits/${splitId}`
    ).ref;
    return of(updateDoc(docRef, changes));
  }

  deleteSplit(
    groupId: string,
    expenseId: string,
    splitId: string
  ): Observable<any> {
    return from(
      this.db
        .doc(`groups/${groupId}/expenses/${expenseId}/splits/${splitId}`)
        .delete()
    );
  }

  addSplits(
    groupId: string,
    expenseId: string,
    splits: Partial<Split>[]
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    splits.forEach((split: Partial<Split>) => {
      const splitId = this.db.createId();
      const splitRef = this.db.doc(
        `/groups/${groupId}/expenses/${expenseId}/splits/${splitId}`
      ).ref;
      batch.set(splitRef, split);
    });
    return from(batch.commit());
  }

  clearSplits(groupId: string, expenseId: string): Observable<any> {
    const batch = this.db.firestore.batch();
    return this.db
      .collection<Split>(`groups/${groupId}/expenses/${expenseId}/splits`)
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
    member1Id: string,
    member2Id: string
  ): Observable<any> {
    const batch = this.db.firestore.batch();
    return this.db
      .collectionGroup('splits', (ref) =>
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
