import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
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

  getGroupCategories(groupId: string): void {
    const c = collection(this.fs, `groups/${groupId}/categories`);
    const q = query(c, orderBy('name'));
    onSnapshot(q, (querySnap) => {
      const categories = [
        ...querySnap.docs.map(
          (doc) =>
            new Category({
              id: doc.id,
              ...doc.data(),
              ref: doc.ref as DocumentReference<Category>,
            })
        ),
      ];
      this.categoryStore.setGroupCategories(categories);
    });
  }

  async getCategoryMap(groupId: string): Promise<Map<string, string>> {
    const categoriesQuery = query(
      collection(this.fs, `groups/${groupId}/categories`)
    );
    const categoriesSnap = await getDocs(categoriesQuery);

    const categoryMap = new Map<string, string>();
    categoriesSnap.docs.forEach((doc) => {
      categoryMap.set(doc.id, doc.data().name);
    });

    return categoryMap;
  }

  async addCategory(
    groupId: string,
    category: Partial<Category>
  ): Promise<any> {
    const c = collection(this.fs, `groups/${groupId}/categories`);
    const q = query(c, where('name', '==', category.name));
    return await getDocs(q).then(async (snap) => {
      if (snap.size > 0) {
        return new Error('This category already exists.');
      }
      return await addDoc(c, category);
    });
  }

  async updateCategory(
    categoryRef: DocumentReference<Category>,
    changes: Partial<Category>
  ): Promise<any> {
    const q = query(
      categoryRef.parent,
      where('name', '==', changes.name),
      where(documentId(), '!=', categoryRef.id)
    );
    return await getDocs(q).then(async (snap) => {
      if (snap.size > 0) {
        return new Error('This category already exists.');
      }
      return await updateDoc(categoryRef, changes);
    });
  }

  async deleteCategory(categoryRef: DocumentReference<Category>): Promise<any> {
    const groupId = categoryRef.parent.parent?.id;
    const c = collection(this.fs, `groups/${groupId}/expenses`);
    const q = query(c, where('categoryRef', '==', categoryRef));
    return await getDocs(q).then(async (snap) => {
      if (snap.size > 0) {
        return new Error(
          'This category is assigned to expenses and cannot be deleted.'
        );
      }
      return await deleteDoc(categoryRef);
    });
  }
}
