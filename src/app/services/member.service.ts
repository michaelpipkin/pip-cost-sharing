import { inject, Injectable } from '@angular/core';
import { Member } from '@models/member';
import { User } from '@models/user';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AnalyticsService } from '@services/analytics.service';
import { IMemberService } from './member.service.interface';
import { SortingService } from './sorting.service';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  DocumentReference,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class MemberService implements IMemberService {
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly fs = inject(getFirestore);
  protected readonly sorter = inject(SortingService);
  protected readonly analytics = inject(AnalyticsService);

  async getMemberByUserRef(
    groupId: string,
    userRef: DocumentReference<User>
  ): Promise<void> {
    try {
      const q = query(
        collection(this.fs, `groups/${groupId}/members`),
        where('userRef', '==', userRef),
        limit(1)
      );
      const docSnap = await getDocs(q);

      if (!docSnap.empty) {
        const memberDoc = docSnap.docs[0];
        this.memberStore.setCurrentMember(
          new Member({
            id: memberDoc.id,
            ...memberDoc.data(),
            ref: memberDoc.ref as DocumentReference<Member>,
          })
        );
      } else {
        this.memberStore.clearCurrentMember();
      }
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'getMemberByUserRef',
        message: 'Failed to get member by user ref',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  getGroupMembers(groupId: string): void {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      orderBy('displayName')
    );

    onSnapshot(
      q,
      (querySnap) => {
        try {
          const groupMembers: Member[] = querySnap.docs.map(
            (doc) =>
              new Member({
                id: doc.id,
                ...doc.data(),
                ref: doc.ref as DocumentReference<Member>,
              })
          );
          this.memberStore.setGroupMembers(groupMembers);
        } catch (error) {
          this.analytics.logEvent('error', {
            service: 'MemberService',
            method: 'getGroupMembers',
            message: 'Failed to process group members snapshot',
            groupId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      (error) => {
        this.analytics.logEvent('error', {
          service: 'MemberService',
          method: 'getGroupMembers',
          message: 'Failed to listen to group members',
          groupId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    );
  }

  async addMemberToGroup(
    groupId: string,
    member: Partial<Member>
  ): Promise<DocumentReference<Member>> {
    try {
      const membersQuery = query(
        collection(this.fs, `groups/${groupId}/members`),
        where('email', '==', member.email)
      );
      const membersSnapshot = await getDocs(membersQuery);

      if (!membersSnapshot.empty) {
        throw new Error(
          'A member with this email address already exists in the group.'
        );
      }

      const userQuery = query(
        collection(this.fs, 'users'),
        where('email', '==', member.email)
      );
      const userSnapshot = await getDocs(userQuery);
      if (!userSnapshot.empty) {
        member.userRef = userSnapshot.docs[0].ref as DocumentReference<User>;
      }

      return (await addDoc(
        collection(this.fs, `groups/${groupId}/members`),
        member
      )) as DocumentReference<Member>;
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'addMemberToGroup',
        message: 'Failed to add member to group',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateMember(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>
  ): Promise<void> {
    try {
      await updateDoc(memberRef, changes);
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'updateMember',
        message: 'Failed to update member',
        memberId: memberRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateMemberWithUserMatching(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>,
    currentUserRef: DocumentReference<User> | null,
    currentEmail: string
  ): Promise<void> {
    try {
      // Only search for user if member is not already linked and email is changing
      if (!currentUserRef && changes.email && changes.email !== currentEmail) {
        const userQuery = query(
          collection(this.fs, 'users'),
          where('email', '==', changes.email)
        );
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          changes.userRef = userSnapshot.docs[0].ref as DocumentReference<User>;
        }
      }

      await updateDoc(memberRef, changes);
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'updateMemberWithUserMatching',
        message: 'Failed to update member with user matching',
        memberId: memberRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<void> {
    try {
      const splits = await getDocs(
        collection(this.fs, `groups/${groupId}/splits`)
      );
      const memberSplit = splits.docs.find(
        (doc) =>
          doc.data().owedByMemberRef.eq(memberRef) ||
          doc.data().paidByMemberRef.eq(memberRef)
      );

      if (!!memberSplit) {
        throw new Error(
          'This member has existing splits and cannot be deleted.'
        );
      }

      await deleteDoc(memberRef);
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'removeMemberFromGroup',
        message: 'Failed to remove member from group',
        groupId,
        memberId: memberRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async leaveGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<void> {
    try {
      const c = collection(this.fs, `groups/${groupId}/members`);
      const q = query(c, where('groupAdmin', '==', true));
      const adminSnap = await getDocs(q);
      if (
        adminSnap.docs.length === 1 &&
        adminSnap.docs[0].id === memberRef.id
      ) {
        throw new Error(
          'You are the only group admin. Please assign another member as admin before leaving the group.'
        );
      }

      const splits = await getDocs(
        collection(this.fs, `groups/${groupId}/splits`)
      );
      const memberSplit = splits.docs.find(
        (doc) =>
          doc.data().owedByMemberRef.eq(memberRef) ||
          doc.data().paidByMemberRef.eq(memberRef)
      );

      if (!!memberSplit) {
        await updateDoc(memberRef, { active: false });
      } else {
        await deleteDoc(memberRef);
      }
      await updateDoc(this.userStore.user()!.ref!, { defaultGroupRef: null });
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'leaveGroup',
        message: 'Failed to leave group',
        groupId,
        memberId: memberRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateAllMemberEmails(
    userRef: DocumentReference<User>,
    newEmail: string
  ): Promise<number> {
    try {
      const membersQuery = query(
        collectionGroup(this.fs, 'members'),
        where('userRef', '==', userRef)
      );
      const membersSnapshot = await getDocs(membersQuery);

      for (const memberDoc of membersSnapshot.docs) {
        await updateDoc(memberDoc.ref, { email: newEmail });
      }

      this.analytics.logEvent('member_emails_updated', {
        membersUpdated: membersSnapshot.size,
      });

      return membersSnapshot.size;
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'MemberService',
        method: 'updateAllMemberEmails',
        message: 'Failed to update member emails',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
