import { inject, Injectable, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
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

  async getHistory(groupId: string, historyId: string): Promise<History> {
    const historyDoc = await getDoc(
      doc(this.fs, `groups/${groupId}/history/${historyId}`)
    );
    if (!historyDoc.exists()) {
      throw new Error('History not found');
    }
    return new History({
      id: historyDoc.id,
      ...historyDoc.data(),
    });
  }

  async addHistory(
    groupId: string,
    paidByMemberId: string,
    paidToMemberId: string,
    history: Partial<History>
  ): Promise<void> {
    history.paidByMemberRef = doc(this.fs, `members/${paidByMemberId}`);
    history.paidToMemberRef = doc(this.fs, `members/${paidToMemberId}`);
    await addDoc(collection(this.fs, `groups/${groupId}/history`), history);
  }

  async deleteHistory(groupId: string, historyId: string): Promise<void> {
    await deleteDoc(doc(this.fs, `groups/${groupId}/history/${historyId}`));
  }
}
