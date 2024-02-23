import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { concatMap, from, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  constructor(private db: AngularFirestore) {}

  getGroupById(id: string): Observable<Group> {
    return this.db
      .doc<Group>(`/groups/${id}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((group: Group) => {
          return new Group({
            ...group,
          });
        })
      );
  }

  getGroupsForUser(userId: string): Observable<Group[]> {
    return this.db
      .collectionGroup('members', (ref) => ref.where('userId', '==', userId))
      .get()
      .pipe(
        concatMap((res) => {
          const groupIds = <string[]>res.docs.map((snapshot) => {
            return snapshot.ref.parent.id;
          });
          return this.db
            .collection<Group>('groups', (ref) =>
              ref.where('id', 'in', groupIds).orderBy('name')
            )
            .valueChanges({ idField: 'id' })
            .pipe(
              map((groups: Group[]) => {
                return <Group[]>groups.map((group: Group) => {
                  return new Group({
                    ...group,
                  });
                });
              })
            );
        })
      );
  }

  addGroup(group: Partial<Group>, member: Partial<Member>): Observable<any> {
    const batch = this.db.firestore.batch();
    group.id = this.db.createId();
    member.id = this.db.createId();
    const groupRef = this.db.doc(`/groups/${group.id}`).ref;
    batch.set(groupRef, group);
    const memberRef = this.db.doc(
      `/groups/${group.id}/members/${member.id}`
    ).ref;
    batch.set(memberRef, member);
    return from(batch.commit());
  }

  updateGroup(groupId: string, changes: Partial<Group>): Observable<any> {
    return from(this.db.doc(`groups/${groupId}`).update(changes));
  }

  deleteGroup(groupId: string): Observable<any> {
    return from(this.db.doc(`groups/${groupId}`).delete());
  }
}
