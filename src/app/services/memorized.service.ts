import { inject, Injectable } from '@angular/core';
import { Memorized } from '@models/memorized';
import { MemorizedStore } from '@store/memorized.store';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  updateDoc,
  writeBatch,
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
    return {
      id: memorizedDoc.id,
      ...memorizedDoc.data(),
      ref: memorizedDoc.ref,
    } as Memorized;
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

  async migrateCategoryIdsToRefs(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);

    try {
      // Query all memorized documents across all groups
      const memorizedCollection = collectionGroup(this.fs, 'memorized');
      const memorizedDocs = await getDocs(memorizedCollection);

      for (const memorizedDoc of memorizedDocs.docs) {
        const memorizedData = memorizedDoc.data();

        // Extract groupId from the document path
        // Path: groups/{groupId}/memorized/{memorizedId}
        const pathSegments = memorizedDoc.ref.path.split('/');
        const groupId = pathSegments[1];

        // Skip if already migrated category
        if (memorizedData.categoryId || !memorizedData.categoryRef) {
          // Create the category document reference
          const categoryRef = doc(
            this.fs,
            `groups/${groupId}/categories/${memorizedData.categoryId}`
          );

          // Clean up the splits array by removing categoryId from each split
          const cleanedSplits =
            memorizedData.splits?.map((split: any) => {
              const { categoryId, ...cleanSplit } = split;
              return cleanSplit;
            }) || [];

          // Update the document: add categoryRef, remove categoryId, and update splits
          batch.update(memorizedDoc.ref, {
            categoryRef: categoryRef,
            categoryId: deleteField(), // This removes the field
            splits: cleanedSplits, // Replace the splits array with cleaned version
          });
        }

        // Skip if already migrated paidByMember
        if (memorizedData.paidByMemberId || !memorizedData.paidByMemberRef) {
          // Create the paidByMember document reference
          const paidByMemberRef = doc(
            this.fs,
            `groups/${groupId}/members/${memorizedData.paidByMemberId}`
          );

          // Update the document: add categoryRef and remove categoryId
          batch.update(memorizedDoc.ref, {
            paidByMemberRef: paidByMemberRef,
            paidByMemberId: deleteField(), // This removes the field
          });
        }
      }

      return await batch
        .commit()
        .then(() => {
          console.log('Successfully migrated all memorized documents');
          return true;
        })
        .catch((err: Error) => {
          console.error('Error migrating memorized documents:', err);
          return new Error(err.message);
        });
    } catch (error) {
      console.error('Error during migration:', error);
      return new Error(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
