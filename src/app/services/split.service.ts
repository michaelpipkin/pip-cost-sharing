import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { History } from '@models/history';
import { Split } from '@models/split';
import { SplitStore } from '@store/split.store';
import { ISplitService } from './split.service.interface';
import { getAnalytics, logEvent } from 'firebase/analytics';
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

@Injectable({
  providedIn: 'root',
})
export class SplitService implements ISplitService {
  protected readonly fs = inject(getFirestore);
  protected readonly splitStore = inject(SplitStore);
  protected readonly analytics = inject(getAnalytics);

  getUnpaidSplitsForGroup(groupId: string): void {
    const splitsQuery = query(
      collection(this.fs, `groups/${groupId}/splits`),
      where('paid', '==', false)
    );
    
    onSnapshot(
      splitsQuery, 
      (splitsQuerySnap) => {
        try {
          const splits = splitsQuerySnap.docs.map((d) => {
            return new Split({
              id: d.id,
              ...d.data(),
              ref: d.ref as DocumentReference<Split>,
            });
          });
          this.splitStore.setSplits(splits);
        } catch (error) {
          logEvent(this.analytics, 'error', {
            service: 'SplitService',
            method: 'getUnpaidSplitsForGroup',
            message: 'Failed to process unpaid splits snapshot',
            groupId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      (error) => {
        logEvent(this.analytics, 'error', {
          service: 'SplitService',
          method: 'getUnpaidSplitsForGroup',
          message: 'Failed to listen to unpaid splits',
          groupId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    );
  }

  async updateSplit(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    splitRef: DocumentReference<Split>,
    changes: Partial<Split>
  ): Promise<void> {
    try {
      const batch = writeBatch(this.fs);
      batch.update(splitRef, changes);
      
      // Check if expense should be marked as paid
      const splitsQuery = query(
        collection(this.fs, `groups/${groupId}/splits`),
        where('expenseRef', '==', expenseRef)
      );
      const splitsQuerySnap = await getDocs(splitsQuery);
      
      const expensePaid =
        splitsQuerySnap.docs.filter(
          (doc) => !doc.ref.eq(splitRef) && !doc.data().paid
        ).length === 0 && changes.paid;
        
      batch.update(expenseRef, { paid: expensePaid });
      
      await batch.commit();
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'SplitService',
        method: 'updateSplit',
        message: 'Failed to update split',
        groupId,
        splitId: splitRef.id,
        expenseId: expenseRef.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<History>
  ): Promise<void> {
    try {
      const batch = writeBatch(this.fs);

      // Build all split queries in parallel
      const splitQueries = splits.map((split) =>
        query(
          collection(this.fs, `groups/${groupId}/splits`),
          where('expenseRef', '==', split.expenseRef)
        )
      );

      // Execute all queries in parallel
      const splitQueryResults = await Promise.all(
        splitQueries.map((query) => getDocs(query))
      );

      // Process each split with its corresponding query result
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const splitsQuerySnap = splitQueryResults[i];

        // Update the split document to mark it as paid
        batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
          paid: true,
        });

        // Determine if the expense is paid
        const expensePaid =
          splitsQuerySnap.docs.filter(
            (doc) => doc.id !== split.id && !doc.data().paid
          ).length === 0;

        // Update the expense document
        batch.update(split.expenseRef, { paid: expensePaid });
      }

      // Add history record
      const newHistoryDoc = doc(collection(this.fs, `groups/${groupId}/history`));
      batch.set(newHistoryDoc, history);
      
      await batch.commit();
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'SplitService',
        method: 'paySplitsBetweenMembers',
        message: 'Failed to pay splits between members',
        groupId,
        splitCount: splits.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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
