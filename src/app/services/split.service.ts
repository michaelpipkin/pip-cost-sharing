import { inject, Injectable, signal } from '@angular/core';
import { History } from '@models/history';
import { Split } from '@models/split';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  fs = inject(getFirestore);

  unpaidSplits = signal<Split[]>([]);

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
      this.unpaidSplits.set(splits);
    });
  }

  async updateSplit(
    groupId: string,
    splitId: string,
    changes: Partial<Split>
  ): Promise<any> {
    return await updateDoc(
      doc(this.fs, `groups/${groupId}/splits/${splitId}`),
      changes
    );
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    paidByMemberId: string,
    paidToMemberId: string,
    history: Partial<History>
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    splits.forEach((split) => {
      batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
        paid: true,
      });
    });
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
