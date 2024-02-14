import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Group } from '@models/group';
import { from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GroupsService {
  constructor(private db: AngularFirestore) {}

  getGroupsForUser(userId: string): Observable<Group[]> {
    return this.db
      .collection<Group>('groups', (ref) =>
        ref.where('memberIds', 'array-contains', userId).orderBy('name')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((groups: Group[]) => {
          return <Group[]>groups.map((group) => {
            return new Group({
              ...group,
            });
          });
        })
      );
  }

  addGroup(group: Partial<Group>): Observable<any> {
    return from(this.db.collection('groups').add(group));
  }

  updateGroup(groupId: string, changes: Partial<Group>): Observable<any> {
    return from(this.db.doc(`groups/${groupId}`).update(changes));
  }

  deleteGroup(groupId: string): Observable<any> {
    return from(this.db.doc(`groups/${groupId}`).delete());
  }
}
