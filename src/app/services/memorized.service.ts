import { inject, Injectable, signal } from '@angular/core';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  updateDoc,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class MemorizedService {
  fs = inject(Firestore);

  memorizedExpenses = signal<Memorized[]>([]);

  getMemorizedExpensesForGroup(groupId: string) {
    const q = collection(this.fs, `groups/${groupId}/memorized`);
    onSnapshot(q, (memorizedSnap) => {
      let memorizedExpenses: Memorized[] = [];
      memorizedSnap.forEach((memorizedDoc) => {
        const memorized = new Memorized({
          id: memorizedDoc.id,
          ...memorizedDoc.data(),
        });
        const splitRef = collection(memorizedDoc.ref, 'splits');
        onSnapshot(splitRef, (splitSnap) => {
          splitSnap.docs.forEach((splitDoc) => {
            const split: Partial<Split> = {
              id: splitDoc.id,
              ...splitDoc.data(),
            };
            memorized.splits.push(split);
          });
        });
        memorizedExpenses.push(memorized);
      });
      this.memorizedExpenses.set(memorizedExpenses);
    });
  }

  async addMemorized(
    groupId: string,
    memorized: Partial<Memorized>
  ): Promise<any> {
    const c = collection(this.fs, `groups/${groupId}/memorized`);
    return await addDoc(c, memorized);
  }

  async updateMemorized(
    groupId: string,
    memorizedId: string,
    changes: Partial<Memorized>
  ): Promise<any> {
    const d = doc(this.fs, `groups/${groupId}/memorized/${memorizedId}`);
    return await updateDoc(d, changes);
  }

  async deleteMemorized(groupId: string, memorizedId: string): Promise<any> {
    const d = doc(this.fs, `groups/${groupId}/memorized/${memorizedId}`);
    return await deleteDoc(d);
  }
}
