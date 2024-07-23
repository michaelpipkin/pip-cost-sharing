import { computed, inject, Injectable, signal } from '@angular/core';
import { Category } from '@models/category';
import { LoadingService } from '@shared/loading/loading.service';
import { SortingService } from './sorting.service';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  Firestore,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  fs = inject(Firestore);
  sorter = inject(SortingService);
  loading = inject(LoadingService);

  groupCategories = signal<Category[]>([]);

  activeGroupCategores = computed<Category[]>(() => {
    return this.groupCategories().filter((c) => c.active);
  });

  getGroupCategories(groupId: string): void {
    const q = query(
      collection(this.fs, `groups/${groupId}/categories`),
      orderBy('name')
    );
    onSnapshot(q, (querySnap) => {
      const categories = [
        ...querySnap.docs.map((d) => new Category({ id: d.id, ...d.data() })),
      ];
      this.groupCategories.set(categories);
    });
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
    groupId: string,
    categoryId: string,
    changes: Partial<Category>
  ): Promise<any> {
    const c = collection(this.fs, `groups/${groupId}/categories`);
    const q = query(
      c,
      where('name', '==', changes.name),
      where(documentId(), '!=', categoryId)
    );
    return await getDocs(q).then(async (snap) => {
      if (snap.size > 0) {
        return new Error('This category already exists.');
      }
      return await updateDoc(
        doc(this.fs, `groups/${groupId}/categories/${categoryId}`),
        changes
      );
    });
  }

  async deleteCategory(groupId: string, categoryId: string): Promise<any> {
    const c = collection(this.fs, `groups/${groupId}/expenses`);
    const q = query(c, where('categoryId', '==', categoryId));
    return await getDocs(q).then(async (snap) => {
      if (snap.size > 0) {
        return new Error(
          'This category is assigned to expenses and cannot be deleted.'
        );
      }
      return await deleteDoc(
        doc(this.fs, `/groups/${groupId}/categories/${categoryId}`)
      );
    });
  }
}
