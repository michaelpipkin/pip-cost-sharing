import { inject, Injectable, signal } from '@angular/core';
import { History } from '@models/history';
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
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
}
