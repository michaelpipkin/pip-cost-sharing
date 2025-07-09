import { inject, Injectable } from '@angular/core';
import { Memorized } from '@models/memorized';
import { MemorizedStore } from '@store/memorized.store';
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

  getMemorizedExpensesForGroup(groupId: string): void {
    const memorizedCollection = collection(
      this.fs,
      `groups/${groupId}/memorized`
    );
    onSnapshot(memorizedCollection, (snapshot) => {
      const memorized = [
        ...snapshot.docs.map(
          (doc) =>
            new Memorized({
              id: doc.id,
              ...doc.data(),
              ref: doc.ref as DocumentReference<Memorized>,
            })
        ),
      ];
      this.memorizedStore.setMemorizedExpenses(memorized);
    });
  }

  async getMemorized(groupId: string, memorizedId: string): Promise<Memorized> {
    const d = doc(this.fs, `groups/${groupId}/memorized/${memorizedId}`);
    const memorizedDoc = await getDoc(d);
    if (!memorizedDoc.exists()) {
      throw new Error('Memorized expense not found');
    }
    return new Memorized({
      id: memorizedDoc.id,
      ...memorizedDoc.data(),
      ref: memorizedDoc.ref as DocumentReference<Memorized>,
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
    memorizedRef: DocumentReference<Memorized>,
    changes: Partial<Memorized>
  ): Promise<any> {
    return await updateDoc(memorizedRef, changes);
  }

  async deleteMemorized(
    memorizedRef: DocumentReference<Memorized>
  ): Promise<any> {
    return await deleteDoc(memorizedRef);
  }

  // Migration method to update categoryId and paidByMemberId to refs

  // async migrateCategoryIdsToRefs(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);

  //   try {
  //     // Query all memorized documents across all groups
  //     const memorizedCollection = collectionGroup(this.fs, 'memorized');
  //     const memorizedDocs = await getDocs(memorizedCollection);

  //     for (const memorizedDoc of memorizedDocs.docs) {
  //       const memorizedData = memorizedDoc.data();

  //       // Extract groupId from the document path
  //       // Path: groups/{groupId}/memorized/{memorizedId}
  //       const pathSegments = memorizedDoc.ref.path.split('/');
  //       const groupId = pathSegments[1];

  //       const updates: any = {};

  //       // Migrate categoryId to categoryRef (main document level)
  //       if (memorizedData.categoryId && !memorizedData.categoryRef) {
  //         const categoryRef = doc(
  //           this.fs,
  //           `groups/${groupId}/categories/${memorizedData.categoryId}`
  //         );
  //         updates.categoryRef = categoryRef;
  //         updates.categoryId = deleteField();
  //       }

  //       // Migrate paidByMemberId to paidByMemberRef (main document level)
  //       if (memorizedData.paidByMemberId && !memorizedData.paidByMemberRef) {
  //         const paidByMemberRef = doc(
  //           this.fs,
  //           `groups/${groupId}/members/${memorizedData.paidByMemberId}`
  //         );
  //         updates.paidByMemberRef = paidByMemberRef;
  //         updates.paidByMemberId = deleteField();
  //       }

  //       // Always check and migrate splits array if it exists
  //       if (memorizedData.splits && Array.isArray(memorizedData.splits)) {
  //         let splitsNeedUpdate = false;

  //         const updatedSplits = memorizedData.splits.map((split: any) => {
  //           const updatedSplit = { ...split };
  //           let splitChanged = false;

  //           // Remove categoryId if it exists
  //           if (split.categoryId) {
  //             delete updatedSplit.categoryId;
  //             splitChanged = true;
  //           }

  //           // Migrate owedByMemberId to owedByMemberRef
  //           if (split.owedByMemberId && !split.owedByMemberRef) {
  //             updatedSplit.owedByMemberRef = doc(
  //               this.fs,
  //               `groups/${groupId}/members/${split.owedByMemberId}`
  //             );
  //             delete updatedSplit.owedByMemberId;
  //             splitChanged = true;
  //           }

  //           // Migrate paidByMemberId to paidByMemberRef
  //           if (split.paidByMemberId && !split.paidByMemberRef) {
  //             updatedSplit.paidByMemberRef = doc(
  //               this.fs,
  //               `groups/${groupId}/members/${split.paidByMemberId}`
  //             );
  //             delete updatedSplit.paidByMemberId;
  //             splitChanged = true;
  //           }

  //           if (splitChanged) {
  //             splitsNeedUpdate = true;
  //           }

  //           return updatedSplit;
  //         });

  //         // Only update splits if any split needed changes
  //         if (splitsNeedUpdate) {
  //           updates.splits = updatedSplits;
  //         }
  //       }

  //       // Only update if there are changes to make
  //       if (Object.keys(updates).length > 0) {
  //         batch.update(memorizedDoc.ref, updates);
  //       }
  //     }

  //     return await batch
  //       .commit()
  //       .then(() => {
  //         console.log('Successfully migrated all memorized documents');
  //         return true;
  //       })
  //       .catch((err: Error) => {
  //         console.error('Error migrating memorized documents:', err);
  //         return new Error(err.message);
  //       });
  //   } catch (error) {
  //     console.error('Error during migration:', error);
  //     return new Error(
  //       error instanceof Error ? error.message : 'Unknown error occurred'
  //     );
  //   }
  // }
}
