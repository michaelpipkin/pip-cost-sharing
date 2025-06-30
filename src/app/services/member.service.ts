import { inject, Injectable } from '@angular/core';
import { Member } from '@models/member';
import { User } from '@models/user';
import { MemberStore } from '@store/member.store';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
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

  async getMemberByUserRef(
    groupId: string,
    userRef: DocumentReference<User>
  ): Promise<void> {
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      where('userRef', '==', userRef),
      limit(1)
    );
    await getDocs(q).then((docSnap) => {
      if (!docSnap.empty) {
        const memberDoc = docSnap.docs[0];
        this.memberStore.setCurrentMember({
          id: memberDoc.id,
          ...memberDoc.data(),
          ref: memberDoc.ref,
        } as Member);
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
        ...querySnap.docs.map(
          (doc) =>
            new Member({
              id: doc.id,
              ...doc.data(),
              ref: doc.ref as DocumentReference<Member>,
            })
        ),
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
      where('userRef', '==', member.userRef)
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
      existingUser.userRef = member.userRef;
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
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>
  ): Promise<any> {
    return await updateDoc(memberRef, changes);
  }

  async removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<any> {
    const splits = await getDocs(
      collection(this.fs, `groups/${groupId}/splits`)
    );
    const memberSplit = splits.docs.find(
      (doc) =>
        doc.data().owedByMemberRef.eq(memberRef) ||
        doc.data().paidByMemberRef.eq(memberRef)
    );
    if (!!memberSplit) {
      return new Error(
        'This member has existing splits and cannot be deleted.'
      );
    }
    return deleteDoc(memberRef);
  }

  async migrateUserIdsToRefs(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);

    try {
      // Query all expense documents across all groups
      const membersCollection = collectionGroup(this.fs, 'members');
      const memberDocs = await getDocs(membersCollection);

      for (const memberDoc of memberDocs.docs) {
        const memberData = memberDoc.data();

        // Skip if already migrated (no memberId or memberRef already exists)
        if (!memberData.userId || memberData.userRef) {
          continue;
        }

        // Create the user document reference
        const userRef = doc(this.fs, `users/${memberData.userId}`);

        // Update the document: add userRef and remove userId
        batch.update(memberDoc.ref, {
          userRef: userRef,
          userId: deleteField(), // This removes the field
        });
      }

      return await batch
        .commit()
        .then(() => {
          console.log('Successfully migrated all member documents');
          return true;
        })
        .catch((err: Error) => {
          console.error('Error migrating member documents:', err);
          return new Error(err.message);
        });
    } catch (error) {
      console.error('Error during migration:', error);
      return new Error(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
