import { inject, Injectable } from '@angular/core';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { MemorizedStore } from '@store/memorized.store';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { IMemorizedService } from './memorized.service.interface';

@Injectable({
  providedIn: 'root',
})
export class MemorizedService implements IMemorizedService {
  protected readonly fs = inject(getFirestore);
  protected readonly memorizedStore = inject(MemorizedStore);

  getMemorizedExpensesForGroup(groupId: string): void {
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
      this.memorizedStore.setMemorizedExpenses(memorizedExpenses);
    });
  }

  async getMemorized(groupId: string, memorizedId: string): Promise<Memorized> {
    const d = doc(this.fs, `groups/${groupId}/memorized/${memorizedId}`);
    const memorizedDoc = await getDoc(d);
    if (!memorizedDoc.exists()) {
      throw new Error('Memorized expense not found');
    }
    const memorized = new Memorized({
      id: memorizedDoc.id,
      ...memorizedDoc.data(),
    });
    const splitRef = collection(d, 'splits');
    const splitSnap = await getDocs(splitRef);
    splitSnap.forEach((splitDoc) => {
      const split: Partial<Split> = {
        id: splitDoc.id,
        ...splitDoc.data(),
      };
      memorized.splits.push(split);
    });
    return memorized;
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
