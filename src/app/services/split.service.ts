import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { History } from '@models/history';
import { Split } from '@models/split';
import { SplitStore } from '@store/split.store';
import {
  collection,
  doc,
  DocumentReference,
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
            ref: d.ref as DocumentReference<Split>,
          });
        }),
      ];
      this.splitStore.setSplits(splits);
    });
  }

  async updateSplit(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    splitRef: DocumentReference<Split>,
    changes: Partial<Split>
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    batch.update(splitRef, changes);
    const splitsQuery = query(
      collection(this.fs, `groups/${groupId}/splits`),
      where('expenseRef', '==', expenseRef)
    );
    const splitsQuerySnap = await getDocs(splitsQuery);
    const expensePaid =
      splitsQuerySnap.docs.filter(
        (doc) => doc.ref !== splitRef && !doc.data().paid
      ).length === 0 && changes.paid;
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
        where('expenseRef', '==', split.expenseRef)
      );
      const splitsQuerySnap = await getDocs(splitsQuery);

      // Determine if the expense is paid
      const expensePaid =
        splitsQuerySnap.docs.filter(
          (doc) => doc.id !== split.id && !doc.data().paid
        ).length === 0;

      // Update the expense document
      batch.update(split.expenseRef, { paid: expensePaid });
    }
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

  // Migration method to update split documents

  // async migrateFieldIdsToRefs(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);

  //   try {
  //     // Query all split documents across all groups
  //     const splitsCollection = collectionGroup(this.fs, 'splits');
  //     const splitDocs = await getDocs(splitsCollection);

  //     for (const splitDoc of splitDocs.docs) {
  //       const splitData = splitDoc.data();

  //       // Extract groupId from the document path
  //       // Path: groups/{groupId}/splits/{splitId}
  //       const pathSegments = splitDoc.ref.path.split('/');
  //       const groupId = pathSegments[1];

  //       const updates: any = {};

  //       // Migrate expenseId to expenseRef
  //       if (splitData.expenseId && !splitData.expenseRef) {
  //         const expenseRef = doc(
  //           this.fs,
  //           `groups/${groupId}/expenses/${splitData.expenseId}`
  //         );
  //         updates.expenseRef = expenseRef;
  //         updates.expenseId = deleteField();
  //       }

  //       // Migrate categoryId to categoryRef
  //       if (splitData.categoryId && !splitData.categoryRef) {
  //         const categoryRef = doc(
  //           this.fs,
  //           `groups/${groupId}/categories/${splitData.categoryId}`
  //         );
  //         updates.categoryRef = categoryRef;
  //         updates.categoryId = deleteField();
  //       }

  //       // Migrate paidByMemberId to paidByMemberRef
  //       if (splitData.paidByMemberId && !splitData.paidByMemberRef) {
  //         const paidByMemberRef = doc(
  //           this.fs,
  //           `groups/${groupId}/members/${splitData.paidByMemberId}`
  //         );
  //         updates.paidByMemberRef = paidByMemberRef;
  //         updates.paidByMemberId = deleteField();
  //       }

  //       // Migrate owedByMemberId to owedByMemberRef
  //       if (splitData.owedByMemberId && !splitData.owedByMemberRef) {
  //         const owedByMemberRef = doc(
  //           this.fs,
  //           `groups/${groupId}/members/${splitData.owedByMemberId}`
  //         );
  //         updates.owedByMemberRef = owedByMemberRef;
  //         updates.owedByMemberId = deleteField();
  //       }

  //       // Only update if there are changes to make
  //       if (Object.keys(updates).length > 0) {
  //         batch.update(splitDoc.ref, updates);
  //       }
  //     }

  //     return await batch
  //       .commit()
  //       .then(() => {
  //         console.log('Successfully migrated all split documents');
  //         return true;
  //       })
  //       .catch((err: Error) => {
  //         console.error('Error migrating split documents:', err);
  //         return new Error(err.message);
  //       });
  //   } catch (error) {
  //     console.error('Error during migration:', error);
  //     return new Error(
  //       error instanceof Error ? error.message : 'Unknown error occurred'
  //     );
  //   }
  // }
}
