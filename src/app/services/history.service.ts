import { inject, Injectable, signal } from '@angular/core';
import {
  collection,
  Firestore,
  onSnapshot,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { History } from '@models/history';

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  fs = inject(Firestore);

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
