import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Split } from '@models/split';
import { from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  constructor(private db: AngularFirestore) {}

  getSplitsForExpense(groupId: string, expenseId: string): Observable<Split[]> {
    return this.db
      .collection<Split>(`groups/${groupId}/expense/${expenseId}/splits`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((splits: Split[]) => {
          return <Split[]>splits.map((split) => {
            return new Split({
              ...split,
            });
          });
        })
      );
  }

  getSplit(
    groupId: string,
    expenseId: string,
    splitId: string
  ): Observable<Split> {
    return this.db
      .doc<Split>(`groups/${groupId}/expenses/${expenseId}/splits/${splitId}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((split: Split) => {
          return new Split({
            ...split,
          });
        })
      );
  }

  addSplit(
    groupId: string,
    expenseId: string,
    split: Partial<Split>
  ): Observable<any> {
    return from(
      this.db
        .collection(`groups/${groupId}/expenses/${expenseId}/splits`)
        .add(split)
    );
  }

  updateSplit(
    groupId: string,
    expenseId: string,
    splitId: string,
    changes: Partial<Split>
  ): Observable<any> {
    return from(
      this.db
        .doc(`groups/${groupId}/expenses/${expenseId}/splits/${splitId}`)
        .update(changes)
    );
  }

  deleteSplit(
    groupId: string,
    expenseId: string,
    splitId: string
  ): Observable<any> {
    return from(
      this.db
        .doc(`groups/${groupId}/expenses/${expenseId}/splits/${splitId}`)
        .delete()
    );
  }
}
