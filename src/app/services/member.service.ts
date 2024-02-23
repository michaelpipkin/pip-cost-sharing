import { Injectable } from '@angular/core';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { from, map, Observable } from 'rxjs';
import {
  AngularFirestore,
  QuerySnapshot,
} from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  constructor(private db: AngularFirestore) {}

  getMember(groupId: string, memberId: string): Observable<Member> {
    return this.db
      .doc<Member>(`groups/${groupId}/members/${memberId}`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((member: Member) => {
          return new Member({
            ...member,
          });
        })
      );
  }

  getAllGroupMembers(groupId: string): Observable<Member[]> {
    return this.db
      .collection<Member>(`groups/${groupId}/members`)
      .valueChanges({ idField: 'id' })
      .pipe(
        map((members: Member[]) => {
          return <Member[]>members.map((member: Member) => {
            return new Member({
              ...member,
            });
          });
        })
      );
  }

  addMemberToGroup(groupId: string, member: Partial<Member>): Observable<any> {
    return from(this.db.collection(`groups/${groupId}/members`).add(member));
  }

  updateMember(
    groupId: string,
    memberId: string,
    changes: Partial<Member>
  ): Observable<any> {
    return from(
      this.db.doc(`/groups/${groupId}/members/${memberId}`).update(changes)
    );
  }

  deleteMemberFromGroup(groupId: string, memberId: string): Observable<any> {
    return this.db
      .collectionGroup<Split>('splits', (ref) =>
        ref.where('groupId', '==', groupId).where('memberId', '==', memberId)
      )
      .get()
      .pipe(
        map((snap: QuerySnapshot<Split>) => {
          if (snap.size > 0) {
            return null;
          } else {
            return from(
              this.db.doc(`/groups/${groupId}/members/${memberId}`).delete()
            );
          }
        })
      );
  }
}
