import { inject, Injectable } from '@angular/core';
import { History } from '@models/history';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
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
}
