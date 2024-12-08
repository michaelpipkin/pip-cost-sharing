import { computed, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  collectionGroup,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryService } from './category.service';
import { ExpenseService } from './expense.service';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemorizedService } from './memorized.service';
import { SplitService } from './split.service';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  fs = inject(Firestore);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expensesService = inject(ExpenseService);
  splitsService = inject(SplitService);
  memorizedService = inject(MemorizedService);
  historyService = inject(HistoryService);
  router = inject(Router);
  loading = inject(LoadingService);

  allUserGroups = signal<Group[]>([]);
  currentGroup = signal<Group>(null);
  adminGroupIds = signal<string[]>([]);

  activeUserGroups = computed<Group[]>(() => {
    return this.allUserGroups().filter((g) => g.active);
  });

  async getUserGroups(user: User, autoNav: boolean = false): Promise<void> {
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
          await this.getGroup(groups[0].id, user.id).then(() => {
            if (autoNav) {
              autoNav = false;
              this.router.navigateByUrl('/expenses');
            }
          });
        } else if (user.defaultGroupId !== '') {
          await this.getGroup(user.defaultGroupId, user.id).then(() => {
            if (autoNav) {
              autoNav = false;
              this.router.navigateByUrl('/expenses');
            }
          });
        } else {
          autoNav = false;
          this.router.navigateByUrl('/groups');
        }
      });
    });
  }

  async getGroup(groupId: string, userId: string): Promise<void> {
    this.loading.loadingOn();
    const docSnap = await getDoc(doc(this.fs, `groups/${groupId}`));
    this.currentGroup.set(
      new Group({
        id: docSnap.id,
        ...docSnap.data(),
      })
    );
    this.categoryService.getGroupCategories(groupId);
    this.memberService.getGroupMembers(groupId);
    this.memberService.getMemberByUserId(groupId, userId);
    this.expensesService.getExpensesForGroup(groupId);
    this.memorizedService.getMemorizedExpensesForGroup(groupId);
    this.splitsService.getUnpaidSplitsForGroup(groupId);
    this.historyService.getHistoryForGroup(groupId);
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

  logout() {
    this.currentGroup.set(null);
    this.allUserGroups.set([]);
    this.adminGroupIds.set([]);
  }
}
