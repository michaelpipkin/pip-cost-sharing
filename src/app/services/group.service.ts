import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { CategoryService } from './category.service';
import { ExpenseService } from './expense.service';
import { IGroupService } from './group.service.interface';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemorizedService } from './memorized.service';
import { SplitService } from './split.service';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class GroupService implements IGroupService {
  protected readonly fs = inject(getFirestore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberService = inject(MemberService);
  protected readonly categoryService = inject(CategoryService);
  protected readonly expensesService = inject(ExpenseService);
  protected readonly splitsService = inject(SplitService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly historyService = inject(HistoryService);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);

  constructor() {
    const currentGroup = localStorage.getItem('currentGroup');
    if (currentGroup !== null) {
      this.groupStore.setCurrentGroup(
        new Group({ ...JSON.parse(currentGroup) })
      );
    }
  }

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
        this.groupStore.setAdminGroupIds(
          userGroups.filter((f) => f.groupAdmin).map((m) => m.groupId)
        );
        const groups: Group[] = [
          ...groupQuerySnap.docs.map(
            (d) => new Group({ id: d.id, ...d.data() })
          ),
        ].filter((g) => userGroupIds.includes(g.id));
        this.groupStore.setAllUserGroups(groups);
        if (!!this.groupStore.currentGroup()) {
          await this.getGroup(this.groupStore.currentGroup().id, user.id);
          if (autoNav && this.router.url === '/') {
            this.router.navigateByUrl('/expenses');
          }
        } else {
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
        }
      });
    });
  }

  async getGroup(groupId: string, userId: string): Promise<void> {
    const docSnap = await getDoc(doc(this.fs, `groups/${groupId}`));
    const group = new Group({ id: docSnap.id, ...docSnap.data() });
    this.groupStore.setCurrentGroup(group);
    localStorage.setItem('currentGroup', JSON.stringify(group));
    this.categoryService.getGroupCategories(groupId);
    this.memberService.getGroupMembers(groupId);
    this.memberService.getMemberByUserId(groupId, userId);
    this.expensesService.getExpensesForGroup(groupId);
    this.memorizedService.getMemorizedExpensesForGroup(groupId);
    this.splitsService.getUnpaidSplitsForGroup(groupId);
    this.historyService.getHistoryForGroup(groupId);
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
      if (this.groupStore.currentGroup().id === groupId) {
        this.groupStore.clearCurrentGroup();
        localStorage.removeItem('currentGroup');
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

  logout(): void {
    this.groupStore.clearCurrentGroup();
    localStorage.removeItem('currentGroup');
    this.groupStore.clearAllUserGroups();
    this.groupStore.clearAdminGroupIds();
  }
}
