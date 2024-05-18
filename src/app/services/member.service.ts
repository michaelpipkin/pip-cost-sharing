import { inject, Injectable, signal } from '@angular/core';
import { Member } from '@models/member';
import { SortingService } from './sorting.service';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  currentGroupMember = signal<Member>(null);
  allGroupMembers = signal<Member[]>([]);
  activeGroupMembers = signal<Member[]>([]);
  filteredMembers = signal<Member[]>([]);

  fs = inject(Firestore);
  sorter = inject(SortingService);

  async getMemberByUserId(groupId: string, userId: string): Promise<void> {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('userId', '==', userId),
      limit(1)
    );
    await getDocs(q).then((docSnap) => {
      if (!docSnap.empty) {
        const memberDoc = docSnap.docs[0];
        this.currentGroupMember.set(
          new Member({ id: memberDoc.id, ...memberDoc.data() })
        );
      }
    });
  }

  async getGroupMembers(groupId: string): Promise<void> {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      orderBy('displayName')
    );
    onSnapshot(q, (querySnap) => {
      const groupMembers: Member[] = [
        ...querySnap.docs.map((d) => new Member({ id: d.id, ...d.data() })),
      ];
      this.allGroupMembers.set(groupMembers);
      this.activeGroupMembers.set(groupMembers.filter((m) => m.active));
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
    const membersQuery = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('userId', '==', member.userId)
    );
    const membersSnapshot = await getDocs(membersQuery);
    if (!membersSnapshot.empty) {
      return new Error('You are already a member of that group!');
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
