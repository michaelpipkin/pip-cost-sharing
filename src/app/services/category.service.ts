import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ICategoryService } from './category.service.interface';
import { SortingService } from './sorting.service';
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
  protected readonly analytics = inject(AnalyticsService);

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
          this.analytics.logError(
            'Category Service',
            'getGroupCategories',
            'Failed to process categories snapshot',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      },
      (error) => {
        this.analytics.logError(
          'Category Service',
          'getGroupCategories',
          'Failed to listen to categories',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    );
  }

  async addCategory(
    groupId: string,
    category: Partial<Category>
  ): Promise<DocumentReference<Category>> {
    const c = collection(this.fs, `groups/${groupId}/categories`);
    const q = query(c, where('name', '==', category.name));
    const snap = await getDocs(q);

    if (snap.size > 0) {
      throw new Error('This category already exists.');
    }
    return (await addDoc(c, category)) as DocumentReference<Category>;
  }

  async updateCategory(
    categoryRef: DocumentReference<Category>,
    changes: Partial<Category>
  ): Promise<void> {
    const q1 = query(
      categoryRef.parent,
      where('name', '==', changes.name),
      where(documentId(), '!=', categoryRef.id)
    );
    const snap1 = await getDocs(q1);

    if (snap1.size > 0) {
      throw new Error('This category already exists.');
    }

    if (changes.active === false) {
      const q2 = query(categoryRef.parent, where('active', '==', true));
      const snap2 = await getDocs(q2);
      if (snap2.size === 1) {
        throw new Error('Each group must have at least one active category.');
      }
    }

    await updateDoc(categoryRef, changes);
  }

  async deleteCategory(
    categoryRef: DocumentReference<Category>
  ): Promise<void> {
    const groupId = categoryRef.parent.parent?.id;
    if (!groupId) {
      throw new Error(
        'Invalid category reference - cannot determine group ID.'
      );
    }

    const categoryCollection = collection(
      this.fs,
      `groups/${groupId}/categories`
    );
    const categorySnap = await getDocs(categoryCollection);
    if (categorySnap.size === 1) {
      throw new Error('Each group must have at least one category.');
    }

    const expenseCollection = collection(this.fs, `groups/${groupId}/expenses`);
    const expenseQuery = query(
      expenseCollection,
      where('categoryRef', '==', categoryRef)
    );
    const expenseSnap = await getDocs(expenseQuery);

    if (expenseSnap.size > 0) {
      throw new Error(
        'This category is assigned to expenses and cannot be deleted.'
      );
    }
    await deleteDoc(categoryRef);
  }
}
