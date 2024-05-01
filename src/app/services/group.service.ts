import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { updateDoc } from '@angular/fire/firestore';
import { Group } from '@models/group';
import { Member } from '@models/member';
import {
  BehaviorSubject,
  concatMap,
  from,
  map,
  Observable,
  of
  } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private groupSubject = new BehaviorSubject<Group>(null);
  selectedGroup$: Observable<Group> = this.groupSubject.asObservable();

  constructor(private db: AngularFirestore) {}

  getGroupById(id: string): Observable<Group> {
    return this.db
      .doc<Group>(`/groups/${id}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((res: Group) => {
          const group = new Group({
            ...res,
          });
          this.groupSubject.next(group);
          return group;
        })
      );
  }

  getCurrentGroup = (): Group => this.groupSubject.getValue();

  getGroupsForUser(userId: string): Observable<Group[]> {
    return this.db
      .collectionGroup<Member>('members', (ref) =>
        ref.where('userId', '==', userId)
      )
      .get()
      .pipe(
        concatMap((res) => {
          if (res.size === 0) {
            return of(null);
          }
          const groupIds = <string[]>res.docs.map((snapshot) => {
            return snapshot.ref.parent.parent.id;
          });
          return this.db
            .collection<Group>('groups', (ref) =>
              ref.where('active', '==', true).orderBy('name')
            )
            .valueChanges({ idField: 'id' })
            .pipe(
              map((groups: Group[]) => {
                const memberGroups = <Group[]>groups
                  .filter((group: Group) => {
                    return groupIds.includes(group.id);
                  })
                  .map((group: Group) => {
                    return new Group({
                      ...group,
                    });
                  });
                if (memberGroups.length === 1) {
                  this.groupSubject.next(memberGroups[0]);
                }
                return memberGroups;
              })
            );
        })
      );
  }

  getAdminGroupsForUser(userId: string): Observable<Group[]> {
    return this.db
      .collectionGroup<Member>('members', (ref) =>
        ref.where('userId', '==', userId).where('groupAdmin', '==', true)
      )
      .get()
      .pipe(
        concatMap((res) => {
          if (res.size === 0) {
            return of(null);
          }
          const groupIds = <string[]>res.docs.map((snapshot) => {
            return snapshot.ref.parent.parent.id;
          });
          return this.db
            .collection<Group>('groups', (ref) => ref.orderBy('name'))
            .valueChanges({ idField: 'id' })
            .pipe(
              map((groups: Group[]) => {
                return <Group[]>groups
                  .filter((group: Group) => {
                    return groupIds.includes(group.id);
                  })
                  .map((group: Group) => {
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
    const groupId = this.db.createId();
    const memberId = this.db.createId();
    const groupRef = this.db.doc(`/groups/${groupId}`).ref;
    batch.set(groupRef, group);
    const memberRef = this.db.doc(`/groups/${groupId}/members/${memberId}`).ref;
    batch.set(memberRef, member);
    return from(batch.commit());
  }

  updateGroup(groupId: string, changes: Partial<Group>): Observable<any> {
    const docRef = this.db.doc(`groups/${groupId}`).ref;
    return of(updateDoc(docRef, changes));
  }
}
