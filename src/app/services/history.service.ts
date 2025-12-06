import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import {
  collection,
  collectionGroup,
  deleteDoc,
  DocumentReference,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
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

  async deleteHistory(historyRef: DocumentReference<History>): Promise<void> {
    await deleteDoc(historyRef);
  }

  // Migration methods

  /**
   * Migrates history date fields from Timestamp to ISO 8601 string format.
   * Run this once when ready to switch to string-based date storage.
   */
  async migrateDateTimestampToString(): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> {
    try {
      const historyCollection = collectionGroup(this.fs, 'history');
      const historyDocs = await getDocs(historyCollection);

      let migratedCount = 0;
      const batchSize = 500; // Firestore batch limit
      let batch = writeBatch(this.fs);
      let batchCount = 0;

      for (const historyDoc of historyDocs.docs) {
        const data = historyDoc.data();

        // Check if date is a Timestamp (has toDate method)
        if (data.date instanceof Timestamp) {
          const isoDateString = data.date.toIsoDateString();
          batch.update(historyDoc.ref, { date: isoDateString });
          migratedCount++;
          batchCount++;

          // Commit batch if we hit the limit
          if (batchCount >= batchSize) {
            await batch.commit();
            batch = writeBatch(this.fs);
            batchCount = 0;
          }
        }
      }

      // Commit any remaining updates
      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(
        `Successfully migrated ${migratedCount} history date fields to ISO string format`
      );
      return { success: true, count: migratedCount };
    } catch (error) {
      console.error('Error migrating history date fields:', error);
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
