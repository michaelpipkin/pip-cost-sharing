import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { HistoryStore } from '@store/history.store';
import { IHistoryService } from './history.service.interface';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class HistoryService implements IHistoryService {
  fs = inject(getFirestore);
  historyStore = inject(HistoryStore);

  getHistoryForGroup(groupId: string): void {
    const historyQuery = query(
      collection(this.fs, `groups/${groupId}/history`),
      orderBy('date', 'desc')
    );
    onSnapshot(historyQuery, (historyQuerySnap) => {
      const history = [
        ...historyQuerySnap.docs.map((d) => {
          return new History({
            id: d.id,
            ...d.data(),
          });
        }),
      ];
      this.historyStore.setHistory(history);
    });
  }

  async deleteHistory(groupId: string, historyId: string): Promise<void> {
    await deleteDoc(doc(this.fs, `groups/${groupId}/history/${historyId}`));
  }
}
