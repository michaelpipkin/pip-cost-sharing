import { inject, Injectable } from '@angular/core';
import { Memorized } from '@models/memorized';
import { CategoryStore } from '@store/category.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
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
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly analytics = inject(getAnalytics);

  getMemorizedExpensesForGroup(groupId: string): void {
    const memorizedCollection = collection(
      this.fs,
      `groups/${groupId}/memorized`
    );

    onSnapshot(
      memorizedCollection,
      (snapshot) => {
        try {
          const memorized = snapshot.docs.map((doc) => {
            const data = doc.data();
            const memorized = new Memorized({
              id: doc.id,
              ...data,
              category: this.categoryStore.getCategoryByRef(data.categoryRef),
              paidByMember: this.memberStore.getMemberByRef(
                data.paidByMemberRef
              ),
              // Note: Splits inside memorized expenses do not have member/category objects
              ref: doc.ref as DocumentReference<Memorized>,
            });
            memorized.splits.forEach((split) => {
              split.paidByMember = this.memberStore.getMemberByRef(
                split.paidByMemberRef
              );
              split.owedByMember = this.memberStore.getMemberByRef(
                split.owedByMemberRef
              );
              split.category = this.categoryStore.getCategoryByRef(
                split.categoryRef
              );
            });
            return memorized;
          });
          this.memorizedStore.setMemorizedExpenses(memorized);
        } catch (error) {
          logEvent(this.analytics, 'error', {
            service: 'MemorizedService',
            method: 'getMemorizedExpensesForGroup',
            message: 'Failed to process memorized expenses snapshot',
            groupId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      (error) => {
        logEvent(this.analytics, 'error', {
          service: 'MemorizedService',
          method: 'getMemorizedExpensesForGroup',
          message: 'Failed to listen to memorized expenses',
          groupId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    );
  }

  async getMemorized(groupId: string, memorizedId: string): Promise<Memorized> {
    try {
      // Wait for stores to be loaded before processing
      while (!this.categoryStore.loaded() || !this.memberStore.loaded()) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const d = doc(this.fs, `groups/${groupId}/memorized/${memorizedId}`);
      const memorizedDoc = await getDoc(d);

      if (!memorizedDoc.exists()) {
        throw new Error('Memorized expense not found');
      }
      const data = memorizedDoc.data();
      return new Memorized({
        id: memorizedDoc.id,
        ...data,
        category: this.categoryStore.getCategoryByRef(data.categoryRef),
        paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
        ref: memorizedDoc.ref as DocumentReference<Memorized>,
      });
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'MemorizedService',
        method: 'getMemorized',
        message: 'Failed to get memorized expense',
        groupId,
        memorizedId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async addMemorized(
    groupId: string,
    memorized: Partial<Memorized>
  ): Promise<DocumentReference<Memorized>> {
    try {
      const c = collection(this.fs, `groups/${groupId}/memorized`);
      return (await addDoc(c, memorized)) as DocumentReference<Memorized>;
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'MemorizedService',
        method: 'addMemorized',
        message: 'Failed to add memorized expense',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateMemorized(
    memorizedRef: DocumentReference<Memorized>,
    changes: Partial<Memorized>
  ): Promise<void> {
    try {
      await updateDoc(memorizedRef, changes);
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'MemorizedService',
        method: 'updateMemorized',
        message: 'Failed to update memorized expense',
        memorizedId: memorizedRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async deleteMemorized(
    memorizedRef: DocumentReference<Memorized>
  ): Promise<void> {
    try {
      await deleteDoc(memorizedRef);
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'MemorizedService',
        method: 'deleteMemorized',
        message: 'Failed to delete memorized expense',
        memorizedId: memorizedRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
