import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
import { CategoryStore } from '@store/category.store';
import { ICategoryService } from './category.service.interface';
import { SortingService } from './sorting.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
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

@Injectable({
  providedIn: 'root',
})
export class CategoryService implements ICategoryService {
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly fs = inject(getFirestore);
  protected readonly sorter = inject(SortingService);
  protected readonly analytics = inject(getAnalytics);

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
          logEvent(this.analytics, 'error', {
            service: 'CategoryService',
            method: 'getGroupCategories',
            message: 'Failed to process categories snapshot',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      (error) => {
        logEvent(this.analytics, 'error', {
          service: 'CategoryService',
          method: 'getGroupCategories',
          message: 'Failed to listen to categories',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    );
  }

  async getCategoryMap(groupId: string): Promise<Map<string, string>> {
    try {
      const categoriesQuery = query(
        collection(this.fs, `groups/${groupId}/categories`)
      );
      const categoriesSnap = await getDocs(categoriesQuery);

      const categoryMap = new Map<string, string>();
      categoriesSnap.docs.forEach((doc) => {
        categoryMap.set(doc.id, doc.data().name);
      });

      return categoryMap;
    } catch (error) {
      throw error;
    }
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
