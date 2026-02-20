import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { History } from '@models/history';
import { Split } from '@models/split';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { AnalyticsService } from '@services/analytics.service';
import {
  collection,
  DocumentReference,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { IHistoryService } from './history.service.interface';

@Injectable({
  providedIn: 'root',
})
export class HistoryService implements IHistoryService {
  protected readonly fs = inject(getFirestore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly analytics = inject(AnalyticsService);

  getHistoryForGroup(groupId: string): void {
    const historyQuery = query(
      collection(this.fs, `groups/${groupId}/history`),
      orderBy('date', 'desc')
    );
    onSnapshot(historyQuery, (historyQuerySnap) => {
      // Skip processing if stores are not loaded yet
      if (!this.memberStore.loaded()) {
        return;
      }

      const history = [
        ...historyQuerySnap.docs.map((doc) => {
          const data = doc.data();
          return new History({
            id: doc.id,
            ...data,
            date: data.date.parseDate(),
            paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
            paidToMember: this.memberStore.getMemberByRef(data.paidToMemberRef),
            ref: doc.ref as DocumentReference<History>,
          });
        }),
      ];
      this.historyStore.setHistory(history);
    });
  }

  async unpayHistory(groupId: string, history: History): Promise<void> {
    try {
      const batch = writeBatch(this.fs);

      const splitRefs = history.splitsPaid ?? [];

      // Fetch all splits to get their expenseRefs
      const splitDocs = await Promise.all(
        splitRefs.map((ref) => getDoc(ref))
      );

      // Mark all splits as unpaid
      for (const splitRef of splitRefs) {
        batch.update(splitRef, { paid: false });
      }

      // Mark all unique related expenses as unpaid
      const uniqueExpenseRefs = new Map<
        string,
        DocumentReference<Expense>
      >();
      for (const splitDoc of splitDocs) {
        const expenseRef = splitDoc.data()!['expenseRef'] as DocumentReference<Expense>;
        if (!uniqueExpenseRefs.has(expenseRef.path)) {
          uniqueExpenseRefs.set(expenseRef.path, expenseRef);
        }
      }
      for (const expenseRef of uniqueExpenseRefs.values()) {
        batch.update(expenseRef, { paid: false });
      }

      // Delete the history record
      batch.delete(history.ref!);

      await batch.commit();
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'HistoryService',
        method: 'unpayHistory',
        message: 'Failed to unpay history record',
        groupId,
        historyId: history.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async unpaySingleSplitFromHistory(
    groupId: string,
    splitRef: DocumentReference<Split>,
    expenseRef: DocumentReference<Expense>,
    history: History,
    splitAllocatedAmount: number,
    isPositiveDirection: boolean
  ): Promise<void> {
    try {
      const batch = writeBatch(this.fs);

      // Mark split as unpaid
      batch.update(splitRef, { paid: false });

      // Mark expense as unpaid (always false when marking a split unpaid)
      batch.update(expenseRef, { paid: false });

      // Compute new splitsPaid array
      const newSplitsPaid = (history.splitsPaid ?? []).filter(
        (ref) => !ref.eq(splitRef)
      );

      if (newSplitsPaid.length === 0) {
        // Last split — delete the history record
        batch.delete(history.ref!);
      } else {
        // Recalculate totalPaid
        const newTotalPaid = isPositiveDirection
          ? history.totalPaid - splitAllocatedAmount
          : history.totalPaid + splitAllocatedAmount;

        batch.update(history.ref!, {
          splitsPaid: newSplitsPaid,
          totalPaid: newTotalPaid,
        });
      }

      await batch.commit();
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'HistoryService',
        method: 'unpaySingleSplitFromHistory',
        message: 'Failed to unpay single split from history',
        groupId,
        historyId: history.id,
        splitId: splitRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
