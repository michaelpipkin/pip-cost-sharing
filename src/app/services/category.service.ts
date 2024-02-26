import { Injectable } from '@angular/core';
import { updateDoc } from '@angular/fire/firestore';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { concatMap, from, map, Observable, of } from 'rxjs';
import {
  AngularFirestore,
  QuerySnapshot,
} from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  constructor(private db: AngularFirestore) {}

  getCategoriesForGroup(groupId: string): Observable<Category[]> {
    return this.db
      .collection<Category>(`groups/${groupId}/categories`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((categories: Category[]) => {
          return <Category[]>categories.map((category) => {
            return new Category({
              ...category,
            });
          });
        })
      );
  }

  addCategory(groupId: string, category: Partial<Category>): Observable<any> {
    return this.db
      .collection(`groups/${groupId}/categories`, (ref) =>
        ref.where('name', '==', category.name)
      )
      .get()
      .pipe(
        concatMap((querySnap) => {
          if (querySnap.size > 0) {
            return of(new Error('This category already exists.'));
          } else {
            return from(
              this.db.collection(`groups/${groupId}/categories`).add(category)
            );
          }
        })
      );
  }

  updateCategory(
    groupId: string,
    categoryId: string,
    changes: Partial<Category>
  ): Observable<any> {
    const docRef = this.db.doc(
      `groups/${groupId}/categories/${categoryId}`
    ).ref;
    return of(updateDoc(docRef, changes));
  }

  deleteCategory(groupId: string, categoryId: string): Observable<any> {
    return this.db
      .collectionGroup<Expense>('expenses', (ref) =>
        ref
          .where('groupId', '==', groupId)
          .where('categoryId', '==', categoryId)
      )
      .get()
      .pipe(
        map((snap: QuerySnapshot<Expense>) => {
          if (snap.size > 0) {
            return new Error(
              'This category is assigned to expenses and cannot be deleted.'
            );
          } else {
            return from(
              this.db
                .doc(`/groups/${groupId}/categories/${categoryId}`)
                .delete()
            );
          }
        })
      );
  }
}
