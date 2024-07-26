import { inject, Injectable, signal } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import {
  collection,
  collectionGroup,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  fs = inject(Firestore);

  unpaidSplits = signal<Split[]>([]);

  async fixSplits() {
    const expDocs = await getDocs(collectionGroup(this.fs, `expenses`));
    const expenses = expDocs.docs.map(
      (e) => new Expense({ id: e.id, ...e.data() })
    );
    const splitDocs = await getDocs(collectionGroup(this.fs, 'splits'));
    splitDocs.docs.forEach(async (d) => {
      const groupId = d.ref.parent.parent.id;
      const allocatedAmount = +d.data().allocatedAmount.toFixed(2);
      const expense = expenses.find((e) => e.id === d.data().expenseId);
      if (!!expense) {
        await updateDoc(d.ref, {
          date: expense.date,
          groupId: groupId,
          allocatedAmount: allocatedAmount,
        });
      } else {
        await deleteDoc(d.ref);
      }
    });
  }

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
    splits: Split[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    splits.forEach((split) => {
      batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
        paid: true,
      });
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
}
