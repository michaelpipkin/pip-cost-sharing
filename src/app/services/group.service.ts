import { inject, Injectable, signal } from '@angular/core';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { CategoryService } from './category.service';
import { ExpenseService } from './expense.service';
import { MemberService } from './member.service';
import { SplitService } from './split.service';
import {
  doc,
  Firestore,
  getDoc,
  collectionGroup,
  query,
  where,
  getDocs,
  collection,
  writeBatch,
  onSnapshot,
  orderBy,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  allUserGroups = signal<Group[]>([]);
  activeUserGroups = signal<Group[]>([]);
  adminUserGroups = signal<Group[]>([]);
  currentGroup = signal<Group>(null);

  fs = inject(Firestore);
  categoryService = inject(CategoryService);
  memberService = inject(MemberService);
  expensesService = inject(ExpenseService);
  splitService = inject(SplitService);

  async getUserGroups(userId: string): Promise<void> {
    const memberQuery = query(
      collectionGroup(this.fs, 'members'),
      where('userId', '==', userId)
    );
    onSnapshot(memberQuery, (memberQuerySnap) => {
      const userGroups: { groupId: string; groupAdmin: boolean }[] = [
        ...memberQuerySnap.docs.map((d) => {
          return {
            groupId: d.ref.parent.parent.id,
            groupAdmin: d.data().groupAdmin,
          };
        }),
      ];
      const groupQuery = query(collection(this.fs, 'groups'), orderBy('name'));
      onSnapshot(groupQuery, (groupQuerySnap) => {
        const userGroupIds = userGroups.map((m) => m.groupId);
        const adminGroupIds = userGroups
          .filter((f) => f.groupAdmin)
          .map((m) => m.groupId);
        const groups: Group[] = [
          ...groupQuerySnap.docs.map(
            (d) => new Group({ id: d.id, ...d.data() })
          ),
        ].filter((g) => userGroupIds.includes(g.id));
        this.allUserGroups.set(groups);
        this.activeUserGroups.set(groups.filter((g) => g.active));
        this.adminUserGroups.set(
          groups.filter((g) => adminGroupIds.includes(g.id))
        );
      });
    });
  }

  async getGroupById(id: string): Promise<void> {
    const docSnap = await getDoc(doc(this.fs, `groups/${id}`));
    const group = new Group({
      id: docSnap.id,
      ...docSnap.data(),
    });
    this.currentGroup.set(group);
    await this.categoryService.getGroupCategories(group.id);
    await this.memberService.getGroupMembers(group.id);
    await this.expensesService.getExpensesWithSplitsForGroup(group.id);
    await this.expensesService.getExpensesWithSplitsForGroup(group.id, true);
    await this.splitService.getUnpaidSplitsForGroup(group.id);
  }

  async addGroup(group: Partial<Group>, member: Partial<Member>): Promise<any> {
    const batch = writeBatch(this.fs);
    const groupRef = doc(collection(this.fs, 'groups'));
    batch.set(groupRef, group);
    const memberRef = doc(collection(this.fs, `groups/${groupRef.id}/members`));
    batch.set(memberRef, member);
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateGroup(groupId: string, changes: Partial<Group>): Promise<any> {
    const batch = writeBatch(this.fs);
    const groupRef = doc(this.fs, `groups/${groupId}`);
    batch.update(groupRef, changes);
    if (!changes.active) {
      const usersRef = collection(this.fs, 'users');
      const usersQuery = query(
        usersRef,
        where('defaultGroupId', '==', groupId)
      );
      await getDocs(usersQuery).then((users) => {
        users.forEach((u) => {
          batch.update(u.ref, { defaultGroupId: '' });
        });
      });
    }
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }
}
