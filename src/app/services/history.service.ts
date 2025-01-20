import { inject, Injectable, signal } from '@angular/core';
import { History } from '@models/history';
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
  fs = inject(getFirestore);

  groupHistory = signal<History[]>([]);

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
      this.groupHistory.set(history);
    });
  }

  async deleteHistory(groupId: string, historyId: string): Promise<void> {
    await deleteDoc(doc(this.fs, `groups/${groupId}/history/${historyId}`));
  }
}
