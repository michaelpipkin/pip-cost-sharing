import { Injectable } from '@angular/core';
import { Category } from '@models/category';
import { from, map, Observable } from 'rxjs';
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
    return from(
      this.db.collection(`groups/${groupId}/categories`).add(category)
    );
  }

  updateCategory(
    groupId: string,
    categoryId: string,
    changes: Partial<Category>
  ): Observable<any> {
    return from(
      this.db.doc(`groups/${groupId}/categories/${categoryId}`).update(changes)
    );
  }

  deleteCategory(groupId: string, categoryId: string): Observable<any> {
    return this.db
      .collectionGroup<Category>('splits', (ref) =>
        ref
          .where('groupId', '==', groupId)
          .where('categoryId', '==', categoryId)
      )
      .get()
      .pipe(
        map((snap: QuerySnapshot<Category>) => {
          if (snap.size > 0) {
            return null;
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
