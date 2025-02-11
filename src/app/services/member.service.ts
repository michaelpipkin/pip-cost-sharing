import { inject, Injectable } from '@angular/core';
import { Member } from '@models/member';
import { MemberStore } from '@store/member.store';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { IMemberService } from './member.service.interface';
import { SortingService } from './sorting.service';

@Injectable({
  providedIn: 'root',
})
export class MemberService implements IMemberService {
  protected readonly memberStore = inject(MemberStore);
  protected readonly fs = inject(getFirestore);
  protected readonly sorter = inject(SortingService);

  async getMemberByUserId(groupId: string, userId: string): Promise<void> {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('userId', '==', userId),
      limit(1)
    );
    await getDocs(q).then((docSnap) => {
      if (!docSnap.empty) {
        const memberDoc = docSnap.docs[0];
        this.memberStore.setCurrentMember(
          new Member({ id: memberDoc.id, ...memberDoc.data() })
        );
      } else {
        this.memberStore.clearCurrentMember();
      }
    });
  }

  getGroupMembers(groupId: string): void {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      orderBy('displayName')
    );
    onSnapshot(q, (querySnap) => {
      const groupMembers: Member[] = [
        ...querySnap.docs.map((d) => new Member({ id: d.id, ...d.data() })),
      ];
      this.memberStore.setGroupMembers(groupMembers);
    });
  }

  async addMemberToGroup(
    groupId: string,
    member: Partial<Member>
  ): Promise<any> {
    const groupSnap = await getDoc(doc(this.fs, `groups/${groupId}`));
    if (!groupSnap.exists()) {
      return new Error('Group code not found!');
    }
    const userIdQuery = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('userId', '==', member.userId)
    );
    const idSnapshot = await getDocs(userIdQuery);
    if (!idSnapshot.empty) {
      return new Error('You are already a member of that group!');
    }
    const emailQuery = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('email', '==', member.email)
    );
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      const userRef = emailSnapshot.docs[0].ref;
      const existingUser = emailSnapshot.docs[0].data();
      existingUser.userId = member.userId;
      existingUser.displayName = member.displayName;
      existingUser.active = true;
      return await updateDoc(userRef, existingUser);
    } else {
      return await addDoc(
        collection(this.fs, `groups/${groupId}/members`),
        member
      );
    }
  }

  async addManualMemberToGroup(
    groupId: string,
    member: Partial<Member>
  ): Promise<any> {
    const membersQuery = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('email', '==', member.email)
    );
    const membersSnapshot = await getDocs(membersQuery);
    if (!membersSnapshot.empty) {
      return new Error(
        'A member with this email address already exists in the group.'
      );
    }
    return await addDoc(
      collection(this.fs, `groups/${groupId}/members`),
      member
    );
  }

  async updateMember(
    groupId: string,
    memberId: string,
    changes: Partial<Member>
  ): Promise<any> {
    const docRef = doc(this.fs, `/groups/${groupId}/members/${memberId}`);
    return await updateDoc(docRef, changes);
  }

  async removeMemberFromGroup(groupId: string, memberId: string): Promise<any> {
    const splits = await getDocs(
      collection(this.fs, `groups/${groupId}/splits`)
    );
    const memberSplit = splits.docs.find(
      (doc) =>
        doc.data().owedByMemberId == memberId ||
        doc.data().paidByMemberId == memberId
    );
    if (!!memberSplit) {
      return new Error(
        'This member has existing splits and cannot be deleted.'
      );
    }
    return deleteDoc(doc(this.fs, `groups/${groupId}/members/${memberId}`));
  }
}
