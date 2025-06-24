import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { HistoryStore } from '@store/history.store';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { IHistoryService } from './history.service.interface';

@Injectable({
  providedIn: 'root',
})
export class HistoryService implements IHistoryService {
  protected readonly fs = inject(getFirestore);
  protected readonly historyStore = inject(HistoryStore);

  getHistoryForGroup(groupId: string): void {
    const historyQuery = query(
      collection(this.fs, `groups/${groupId}/history`),
      orderBy('date', 'desc')
    );
    onSnapshot(historyQuery, (historyQuerySnap) => {
      const history = [
        ...historyQuerySnap.docs.map((doc) => {
          return {
            id: doc.id,
            ...doc.data(),
            ref: doc.ref,
          } as History;
        }),
      ];
      this.historyStore.setHistory(history);
    });
  }

  async deleteHistory(groupId: string, historyId: string): Promise<void> {
    await deleteDoc(doc(this.fs, `groups/${groupId}/history/${historyId}`));
  }
}
