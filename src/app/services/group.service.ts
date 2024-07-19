import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
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
  fs = inject(Firestore);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expensesService = inject(ExpenseService);
  splitsService = inject(SplitService);
  loading = inject(LoadingService);
  router = inject(Router);

  allUserGroups = signal<Group[]>([]);
  activeUserGroups = computed(() =>
    this.allUserGroups().filter((g) => g.active)
  );
  private adminGroupIds = signal<string[]>([]);
  adminUserGroups = computed(() =>
    this.allUserGroups().filter((g) => this.adminGroupIds().includes(g.id))
  );
  currentGroup = signal<Group>(null);

  async getUserGroups(user: User, autoNav: boolean = false): Promise<void> {
    this.loading.loadingOn();
    const memberQuery = query(
      collectionGroup(this.fs, 'members'),
      where('userId', '==', user.id)
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
      onSnapshot(groupQuery, async (groupQuerySnap) => {
        const userGroupIds = userGroups.map((m) => m.groupId);
        this.adminGroupIds.set(
          userGroups.filter((f) => f.groupAdmin).map((m) => m.groupId)
        );
        const groups: Group[] = [
          ...groupQuerySnap.docs.map(
            (d) => new Group({ id: d.id, ...d.data() })
          ),
        ].filter((g) => userGroupIds.includes(g.id));
        this.allUserGroups.set(groups);
        if (groups.length === 1 && groups[0].active) {
          await this.getGroupById(groups[0].id, user.id).then(() => {
            if (autoNav) {
              this.router.navigateByUrl('/expenses');
            }
          });
        } else if (user.defaultGroupId !== '') {
          await this.getGroupById(user.defaultGroupId, user.id).then(() => {
            if (autoNav) {
              this.router.navigateByUrl('/expenses');
            }
          });
        } else {
          this.router.navigateByUrl('/groups');
        }
      });
    });
  }

  async getGroupById(groupId: string, userId: string): Promise<void> {
    this.loading.loadingOn();
    const docSnap = await getDoc(doc(this.fs, `groups/${groupId}`));
    const group = new Group({
      id: docSnap.id,
      ...docSnap.data(),
    });
    this.currentGroup.set(group);
    this.categoryService.getGroupCategories(groupId);
    this.memberService.getGroupMembers(groupId);
    this.memberService.getMemberByUserId(groupId, userId);
    this.expensesService.getExpensesWithSplitsForGroup(groupId);
    this.expensesService.getExpensesWithSplitsForGroup(groupId, true);
    this.splitsService.getUnpaidSplitsForGroup(groupId);
    this.loading.loadingOff();
  }

  async addGroup(group: Partial<Group>, member: Partial<Member>): Promise<any> {
    const batch = writeBatch(this.fs);
    const groupRef = doc(collection(this.fs, 'groups'));
    batch.set(groupRef, group);
    const memberRef = doc(collection(this.fs, `groups/${groupRef.id}/members`));
    batch.set(memberRef, member);
    const categoryRef = doc(
      collection(this.fs, `groups/${groupRef.id}/categories`)
    );
    const category: Partial<Category> = {
      name: 'Default',
      active: true,
    };
    batch.set(categoryRef, category);
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
      if (this.currentGroup().id === groupId) {
        this.currentGroup.set(null);
      }
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
