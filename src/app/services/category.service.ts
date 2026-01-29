import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import {
  addDoc,
  collection,
  deleteDoc,
  documentId,
  DocumentReference,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ICategoryService } from './category.service.interface';
import { SortingService } from './sorting.service';

@Injectable({
  providedIn: 'root',
})
export class CategoryService implements ICategoryService {
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly fs = inject(getFirestore);
  protected readonly sorter = inject(SortingService);
  private readonly analytics = inject(AnalyticsService);

  getGroupCategories(groupId: string): void {
    const c = collection(this.fs, `groups/${groupId}/categories`);
    const q = query(c, orderBy('name'));

    onSnapshot(
      q,
      (querySnap) => {
        try {
          const categories = querySnap.docs.map(
            (doc) =>
              new Category({
                id: doc.id,
                ...doc.data(),
                ref: doc.ref as DocumentReference<Category>,
              })
          );
          this.categoryStore.setGroupCategories(categories);
        } catch (error) {
          this.analytics.logEvent('error', {
            service: 'CategoryService',
            method: 'getGroupCategories',
            message: 'Failed to process categories snapshot',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      (error) => {
        this.analytics.logEvent('error', {
          service: 'CategoryService',
          method: 'getGroupCategories',
          message: 'Failed to listen to categories',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    );
  }

  async addCategory(
    groupId: string,
    category: Partial<Category>
  ): Promise<DocumentReference<Category>> {
    try {
      const c = collection(this.fs, `groups/${groupId}/categories`);
      const q = query(c, where('name', '==', category.name));
      const snap = await getDocs(q);

      if (snap.size > 0) {
        throw new Error('This category already exists.');
      }
      return (await addDoc(c, category)) as DocumentReference<Category>;
    } catch (error) {
      throw error;
    }
  }

  async updateCategory(
    categoryRef: DocumentReference<Category>,
    changes: Partial<Category>
  ): Promise<void> {
    try {
      const q = query(
        categoryRef.parent,
        where('name', '==', changes.name),
        where(documentId(), '!=', categoryRef.id)
      );
      const snap = await getDocs(q);

      if (snap.size > 0) {
        throw new Error('This category already exists.');
      }
      await updateDoc(categoryRef, changes);
    } catch (error) {
      throw error;
    }
  }

  async deleteCategory(
    categoryRef: DocumentReference<Category>
  ): Promise<void> {
    try {
      const groupId = categoryRef.parent.parent?.id;
      if (!groupId) {
        throw new Error(
          'Invalid category reference - cannot determine group ID.'
        );
      }

      const c = collection(this.fs, `groups/${groupId}/expenses`);
      const q = query(c, where('categoryRef', '==', categoryRef));
      const snap = await getDocs(q);

      if (snap.size > 0) {
        throw new Error(
          'This category is assigned to expenses and cannot be deleted.'
        );
      }
      await deleteDoc(categoryRef);
    } catch (error) {
      throw error;
    }
  }
}
