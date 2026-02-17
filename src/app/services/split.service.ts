import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { HistoryDto } from '@models/history';
import { Split, SplitDto } from '@models/split';
import { AmountDue } from '@models/amount-due';
import { SplitStore } from '@store/split.store';
import { AnalyticsService } from '@services/analytics.service';
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
  protected readonly analytics = inject(AnalyticsService);

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
            const data = d.data();
            return new Split({
              id: d.id,
              ...data,
              date: data.date.parseDate(),
              ref: d.ref as DocumentReference<Split>,
            });
          });
          this.splitStore.setSplits(splits);
        } catch (error) {
          this.analytics.logEvent('error', {
            service: 'SplitService',
            method: 'getUnpaidSplitsForGroup',
            message: 'Failed to process unpaid splits snapshot',
            groupId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      (error) => {
        this.analytics.logEvent('error', {
          service: 'SplitService',
          method: 'getUnpaidSplitsForGroup',
          message: 'Failed to listen to unpaid splits',
          groupId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    );
  }

  async updateSplit(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    splitRef: DocumentReference<Split>,
    changes: Partial<SplitDto>
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
      this.analytics.logEvent('error', {
        service: 'SplitService',
        method: 'updateSplit',
        message: 'Failed to update split',
        groupId,
        splitId: splitRef.id,
        expenseId: expenseRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<HistoryDto>
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
        const split = splits[i]!;
        const splitsQuerySnap = splitQueryResults[i]!;

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
      const newHistoryDoc = doc(
        collection(this.fs, `groups/${groupId}/history`)
      );
      batch.set(newHistoryDoc, history);

      await batch.commit();
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'SplitService',
        method: 'paySplitsBetweenMembers',
        message: 'Failed to pay splits between members',
        groupId,
        splitCount: splits.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async settleGroup(
    groupId: string,
    splits: Split[],
    transfers: AmountDue[]
  ): Promise<void> {
    try {
      const batch = writeBatch(this.fs);

      // Collect unique expense refs (keyed by path to avoid reference equality issues)
      const expenseRefMap = new Map<string, DocumentReference<Expense>>();
      for (const split of splits) {
        if (!expenseRefMap.has(split.expenseRef.path)) {
          expenseRefMap.set(split.expenseRef.path, split.expenseRef);
        }
      }
      const uniqueExpenseRefs = [...expenseRefMap.values()];

      // Query all splits for each expense in parallel
      const expenseQueries = uniqueExpenseRefs.map((expenseRef) =>
        query(
          collection(this.fs, `groups/${groupId}/splits`),
          where('expenseRef', '==', expenseRef)
        )
      );
      const expenseQueryResults = await Promise.all(
        expenseQueries.map((q) => getDocs(q))
      );

      // Set of split IDs being paid in this batch
      const paidSplitIds = new Set(splits.map((s) => s.id));

      // Mark all splits as paid
      for (const split of splits) {
        batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
          paid: true,
        });
      }

      // Update each expense's paid status
      for (let i = 0; i < uniqueExpenseRefs.length; i++) {
        const expenseRef = uniqueExpenseRefs[i]!;
        const querySnap = expenseQueryResults[i]!;

        // Expense is paid if every split will be paid after this batch
        const expensePaid = querySnap.docs.every(
          (d) => paidSplitIds.has(d.id) || d.data().paid
        );

        batch.update(expenseRef, { paid: expensePaid });
      }

      // Create one history record per transfer (no line items)
      for (const transfer of transfers) {
        const newHistoryDoc = doc(
          collection(this.fs, `groups/${groupId}/history`)
        );
        batch.set(newHistoryDoc, {
          paidByMemberRef: transfer.owedByMemberRef,
          paidToMemberRef: transfer.owedToMemberRef,
          date: new Date().toIsoFormat(),
          totalPaid: transfer.amount,
          lineItems: [],
        });
      }

      await batch.commit();
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'SplitService',
        method: 'settleGroup',
        message: 'Failed to settle group',
        groupId,
        splitCount: splits.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
