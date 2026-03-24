import { inject, Injectable } from '@angular/core';
import { AmountDue } from '@models/amount-due';
import { Expense } from '@models/expense';
import { HistoryDto } from '@models/history';
import { Split, SplitDto } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { SplitStore } from '@store/split.store';
import { parseDate, toIsoFormat } from '@utils/date-utils';
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
              date: parseDate(data.date),
              ref: d.ref as DocumentReference<Split>,
            });
          });
          this.splitStore.setSplits(splits);
        } catch (error) {
          this.analytics.logError(
            'Split Service',
            'getUnpaidSplitsForGroup',
            'Failed to process unpaid splits snapshot',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      },
      (error) => {
        this.analytics.logSnapshotError(
          'Split Service',
          'getUnpaidSplitsForGroup',
          'Failed to listen to unpaid splits',
          error instanceof Error ? error.message : 'Unknown error'
        );
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
      this.analytics.logError(
        'Split Service',
        'updateSplit',
        'Failed to update split',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<HistoryDto>
  ): Promise<void> {
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
    const newHistoryDoc = doc(collection(this.fs, `groups/${groupId}/history`));
    batch.set(newHistoryDoc, history);

    await batch.commit();
  }

  async settleGroup(
    groupId: string,
    splits: Split[],
    transfers: AmountDue[]
  ): Promise<void> {
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

    // Create one history record per transfer with full split ref list
    const batchId =
      crypto.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const batchSize = transfers.length;
    const splitRefs = splits
      .filter((s) => s.ref != null)
      .map((s) => s.ref as DocumentReference<Split>); // NOSONAR
    for (const transfer of transfers) {
      const newHistoryDoc = doc(
        collection(this.fs, `groups/${groupId}/history`)
      );
      batch.set(newHistoryDoc, {
        paidByMemberRef: transfer.owedByMemberRef,
        paidToMemberRef: transfer.owedToMemberRef,
        date: toIsoFormat(new Date()),
        totalPaid: transfer.amount,
        splitsPaid: splitRefs,
        batchId,
        batchSize,
      });
    }

    await batch.commit();
  }
}
