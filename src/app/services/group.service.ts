import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import {
  collection,
  collectionGroup,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CategoryService } from './category.service';
import { ExpenseService } from './expense.service';
import { IGroupService } from './group.service.interface';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemorizedService } from './memorized.service';
import { SplitService } from './split.service';

@Injectable({
  providedIn: 'root',
})
export class GroupService implements IGroupService {
  protected readonly fs = inject(getFirestore);
  protected readonly functions = inject(getFunctions);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberService = inject(MemberService);
  protected readonly categoryService = inject(CategoryService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly splitsService = inject(SplitService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly historyService = inject(HistoryService);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);

  #unsubscribeMembers?: () => void;
  #unsubscribeGroups?: () => void;

  constructor() {
    const currentGroup = localStorage.getItem('currentGroup');
    if (currentGroup !== null) {
      const group = new Group({ ...JSON.parse(currentGroup) });
      // prettier-ignore
      group.ref = doc( // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
        this.fs,
        `groups/${group.id}`
      ) as DocumentReference<Group>;
      this.groupStore.setCurrentGroup(group);
    }
  }

  async getUserGroups(user: User): Promise<void> {
    // Skip group loading if user isn't validated (email not confirmed for non-Google users)
    // Auth guards will handle redirecting to account page if needed
    if (!this.userStore.isValidUser()) {
      // Don't redirect if on account-action page - let verification complete first
      const currentUrl = this.router.url;
      if (!currentUrl.includes('/auth/account-action')) {
        this.router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]);
      }
      this.loading.loadingOff();
      return;
    }

    try {
      const memberQuery = query(
        collectionGroup(this.fs, 'members'),
        where('userRef', '==', user.ref)
      );

      this.#unsubscribeMembers?.();
      this.#unsubscribeMembers = onSnapshot(
        memberQuery,
        (memberQuerySnap) => {
          try {
            const userGroups: {
              groupId: string;
              active: boolean;
              groupAdmin: boolean;
            }[] = memberQuerySnap.docs.map((d) => ({
              groupId: d.ref.parent.parent!.id,
              active: d.data().active,
              groupAdmin: d.data().groupAdmin,
            }));

            if (userGroups.length === 0) {
              this.groupStore.setAllUserGroups([]);
              this.router.navigateByUrl(ROUTE_PATHS.ADMIN_GROUPS);
              return;
            }

            const groupQuery = query(
              collection(this.fs, 'groups'),
              orderBy('name')
            );
            this.#unsubscribeGroups?.();
            this.#unsubscribeGroups = onSnapshot(
              groupQuery,
              async (groupQuerySnap) => {
                try {
                  await this.handleGroupsSnapshot(groupQuerySnap, userGroups);
                } catch (error) {
                  this.analytics.logError(
                    'Group Service',
                    'getUserGroups',
                    'Failed to process groups snapshot',
                    error instanceof Error ? error.message : 'Unknown error'
                  );
                }
              },
              (error) => {
                this.analytics.logSnapshotError(
                  'Group Service',
                  'getUserGroups',
                  'Failed to listen to groups',
                  error instanceof Error ? error.message : 'Unknown error'
                );
              }
            );
          } catch (error) {
            this.analytics.logError(
              'Group Service',
              'getUserGroups',
              'Failed to process members snapshot',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        },
        (error) => {
          this.analytics.logSnapshotError(
            'Group Service',
            'getUserGroups',
            'Failed to listen to members',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      );
    } catch (error) {
      this.analytics.logError(
        'Group Service',
        'getUserGroups',
        'Failed to initialize user groups query',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  private async handleGroupsSnapshot(
    groupQuerySnap: QuerySnapshot,
    userGroups: { groupId: string; active: boolean; groupAdmin: boolean }[]
  ): Promise<void> {
    const userGroupIds = new Set(userGroups.map((m) => m.groupId));

    const groups: Group[] = groupQuerySnap.docs
      .map((doc) => {
        const userGroup = userGroups.find((g) => g.groupId === doc.id);
        return new Group({
          id: doc.id,
          ...doc.data(),
          userActiveInGroup: userGroup?.active,
          userIsAdmin: userGroup?.groupAdmin,
          ref: doc.ref as DocumentReference<Group>, // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
        });
      })
      .filter((g) => userGroupIds.has(g.id));

    this.groupStore.setAllUserGroups(groups);

    const user = this.userStore.user();
    const userRef = user?.ref;
    if (!userRef) return;

    const activeGroups = groups.filter((g) => g.active);
    const currentGroup = this.groupStore.currentGroup();

    if (!this.groupStore.skipAutoSelect()) {
      if (currentGroup?.ref && groups.some((g) => g.id === currentGroup.id)) {
        await this.getGroup(currentGroup.ref, userRef);
      } else if (user?.defaultGroupRef) {
        await this.getGroup(user.defaultGroupRef, userRef);
      } else if (activeGroups.length === 1 && activeGroups[0]?.ref) {
        await this.getGroup(activeGroups[0].ref, userRef);
      } else {
        this.groupStore.clearCurrentGroup();
        localStorage.removeItem('currentGroup');
      }
    }

    // Handle auto-navigation for bookmarked/direct home page visits
    // Login/register pages are handled by loggedInGuard
    const currentUrl = this.router.url;
    const isRedirectPage =
      currentUrl === '/home' ||
      currentUrl === '/' ||
      currentUrl === '/auth/login' ||
      currentUrl === '/auth/account';

    if (isRedirectPage) {
      // Validated users go to expenses, unvalidated users go to account
      if (this.userStore.isValidUser()) {
        this.router.navigateByUrl(ROUTE_PATHS.EXPENSES_ROOT);
      } else {
        this.router.navigateByUrl(ROUTE_PATHS.AUTH_ACCOUNT);
      }
    }
  }

  async getGroup(
    groupRef: DocumentReference<Group>,
    userRef: DocumentReference<User>
  ): Promise<void> {
    try {
      const docSnap = await getDoc(groupRef);

      if (!docSnap.exists()) {
        throw new Error(`Group with ID ${groupRef.id} not found`);
      }

      const group = new Group({
        ...docSnap.data(),
        id: docSnap.id,
        ref: docSnap.ref as DocumentReference<Group>, // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
      });

      this.groupStore.setCurrentGroup(group);
      this.groupStore.resetSkipAutoSelect();
      localStorage.setItem('currentGroup', JSON.stringify(group));

      await setDoc(
        userRef,
        {
          defaultGroupRef: groupRef,
        },
        { merge: true }
      );
      this.userStore.updateUser({ defaultGroupRef: groupRef });

      // Initialize group-related data
      this.categoryService.getGroupCategories(groupRef.id);
      this.memberService.getGroupMembers(groupRef.id);
      this.memberService.getMemberByUserRef(groupRef.id, userRef);
      this.expenseService.doesGroupHaveExpenses(groupRef.id);
      this.memorizedService.getMemorizedExpensesForGroup(groupRef.id);
      this.splitsService.getUnpaidSplitsForGroup(groupRef.id);
      this.historyService.getHistoryForGroup(groupRef.id);
    } catch (error) {
      this.analytics.logError(
        'Group Service',
        'getGroup',
        'Failed to get group',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async addGroup(
    group: Partial<Group>,
    member: Partial<Member>
  ): Promise<DocumentReference<Group>> {
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

    await batch.commit();
    if (this.groupStore.currentGroup() === null) {
      this.groupStore.setCurrentGroup(
        new Group({
          ...group,
          id: groupRef.id,
          ref: groupRef as DocumentReference<Group>, // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
        })
      );
    }
    return groupRef as DocumentReference<Group>; // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
  }

  async updateGroup(
    groupRef: DocumentReference<Group>,
    changes: Partial<Group>
  ): Promise<void> {
    const batch = writeBatch(this.fs);
    batch.update(groupRef, changes);

    // If deactivating or archiving the group, clear it as default for all users
    if (!changes.active || changes.archived) {
      const usersRef = collection(this.fs, 'users');
      const usersQuery = query(
        usersRef,
        where('defaultGroupRef', '==', groupRef)
      );
      const users = await getDocs(usersQuery);
      users.forEach((u) => {
        batch.update(u.ref, { defaultGroupRef: null });
      });

      // Clear current group if it's the one being deactivated or archived
      if (this.groupStore.currentGroup()?.id === groupRef.id) {
        this.groupStore.clearCurrentGroup(true);
        this.userStore.updateUser({ defaultGroupRef: null });
        localStorage.removeItem('currentGroup');
      }
    }

    await batch.commit();
  }

  async deleteGroup(groupId: string): Promise<void> {
    const deleteGroupFn = httpsCallable<
      { groupId: string },
      { success: boolean; message: string }
    >(this.functions, 'deleteGroup');

    const result = await deleteGroupFn({ groupId });

    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to delete group');
    }

    // Clear current group if it was the deleted one
    if (this.groupStore.currentGroup()?.id === groupId) {
      this.groupStore.clearCurrentGroup(true);
      this.userStore.updateUser({ defaultGroupRef: null });
      localStorage.removeItem('currentGroup');
    }

    // Remove from the store
    this.groupStore.removeGroup(groupId);
  }

  stopListening(): void {
    this.#unsubscribeGroups?.();
    this.#unsubscribeGroups = undefined;
    this.#unsubscribeMembers?.();
    this.#unsubscribeMembers = undefined;
  }

  logout(): void {
    this.stopListening();
    this.memberService.stopListening();
    this.categoryService.stopListening();
    this.memorizedService.stopListening();
    this.splitsService.stopListening();
    this.historyService.stopListening();
    localStorage.removeItem('currentGroup');
    this.groupStore.clearAllUserGroups();
    this.groupStore.setLoadedState(false);
  }
}
