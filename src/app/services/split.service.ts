import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { Split } from '@models/split';
import { SplitStore } from '@store/split.store';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ISplitService } from './split.service.interface';

@Injectable({
  providedIn: 'root',
})
export class SplitService implements ISplitService {
  protected readonly fs = inject(getFirestore);
  protected readonly splitStore = inject(SplitStore);

  getUnpaidSplitsForGroup(groupId: string): void {
    const splitsQuery = query(
      collection(this.fs, `groups/${groupId}/splits`),
      where('paid', '==', false)
    );
    onSnapshot(splitsQuery, (splitsQuerySnap) => {
      const splits = [
        ...splitsQuerySnap.docs.map((d) => {
          return new Split({
            id: d.id,
            ...d.data(),
          });
        }),
      ];
      this.splitStore.setSplits(splits);
    });
  }

  async updateSplit(
    groupId: string,
    expenseId: string,
    splitId: string,
    changes: Partial<Split>
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    batch.update(doc(this.fs, `groups/${groupId}/splits/${splitId}`), changes);
    const splitsQuery = query(
      collection(this.fs, `groups/${groupId}/splits`),
      where('expenseId', '==', expenseId)
    );
    const splitsQuerySnap = await getDocs(splitsQuery);
    const expensePaid =
      splitsQuerySnap.docs.filter(
        (doc) => doc.id !== splitId && !doc.data().paid
      ).length === 0 && changes.paid;
    const expenseRef = doc(this.fs, `groups/${groupId}/expenses/${expenseId}`);
    batch.update(expenseRef, { paid: expensePaid });
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    paidByMemberId: string,
    paidToMemberId: string,
    history: Partial<History>
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    for (const split of splits) {
      // Update the split document to mark it as paid
      batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
        paid: true,
      });

      // Query for related splits
      const splitsQuery = query(
        collection(this.fs, `groups/${groupId}/splits`),
        where('expenseId', '==', split.expenseId)
      );
      const splitsQuerySnap = await getDocs(splitsQuery);

      // Determine if the expense is paid
      const expensePaid =
        splitsQuerySnap.docs.filter(
          (doc) => doc.id !== split.id && !doc.data().paid
        ).length === 0;

      // Update the expense document
      const expenseRef = doc(
        this.fs,
        `groups/${groupId}/expenses/${split.expenseId}`
      );
      batch.update(expenseRef, { paid: expensePaid });
    }
    history.paidByMemberRef = doc(
      this.fs,
      `groups/${groupId}/members/${paidByMemberId}`
    );
    history.paidToMemberRef = doc(
      this.fs,
      `groups/${groupId}/members/${paidToMemberId}`
    );
    const newHistoryDoc = doc(collection(this.fs, `groups/${groupId}/history`));
    batch.set(newHistoryDoc, history);
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
