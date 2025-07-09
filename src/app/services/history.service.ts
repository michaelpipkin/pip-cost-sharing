import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { HistoryStore } from '@store/history.store';
import {
  collection,
  deleteDoc,
  DocumentReference,
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
          return new History({
            id: doc.id,
            ...doc.data(),
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
}
