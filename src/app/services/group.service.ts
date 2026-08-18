import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
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
  deleteDoc,
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
import { DEMO_GROUP_ID } from './demo-mode.service';
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
  protected readonly platformId = inject(PLATFORM_ID);

  #unsubscribeMembers?: () => void;
  #unsubscribeGroups?: () => void;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const currentGroup = localStorage.getItem('currentGroup');
      if (currentGroup !== null) {
        const group = new Group({ ...JSON.parse(currentGroup) });
        // A leftover demo group (e.g. from a demo session that didn't clean
        // up localStorage) should never be rehydrated as a real group.
        if (group.id === DEMO_GROUP_ID) {
          localStorage.removeItem('currentGroup');
        } else {
          // prettier-ignore
          group.ref = doc( // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
            this.fs,
            `groups/${group.id}`
          ) as DocumentReference<Group>;
          this.groupStore.setCurrentGroup(group);
        }
      }
    }
  }

  async getUserGroups(user: User): Promise<void> {
    // Skip group loading if user isn't validated (email not confirmed for non-Google users)
    // Auth guards will handle redirecting to account page if needed
    if (!this.userStore.isValidUser()) {
      // Don't redirect if on account-action page - let verification complete first
      const currentUrl = this.router.url;
      if (
        !currentUrl.includes('/auth/account-action') &&
        !currentUrl.includes('/auth/register')
      ) {
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
        async (memberQuerySnap) => {
          try {
            const userGroups: {
              groupId: string;
              active: boolean;
              groupAdmin: boolean;
              leftGroup: boolean;
              memberRef: DocumentReference<Member>;
            }[] = memberQuerySnap.docs.map((d) => ({
              groupId: d.ref.parent.parent!.id,
              active: d.data().active,
              groupAdmin: d.data().groupAdmin,
              leftGroup: !!d.data().leftGroup,
              memberRef: d.ref as DocumentReference<Member>, // NOSONAR
            }));

            if (userGroups.length === 0) {
              this.groupStore.setAllUserGroups([]);
              // Any invited-member records for this email get linked on the
              // Groups page's own load (see GroupsComponent), not retried
              // here - that fires later in the session, past the cold-boot
              // window most likely to race App Check's first token fetch.
              this.router.navigateByUrl(ROUTE_PATHS.ADMIN_GROUPS);
              return;
            }

            const groupQuery = query(
              collection(this.fs, 'groups'),
              where('memberUids', 'array-contains', user.id),
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
    userGroups: {
      groupId: string;
      active: boolean;
      groupAdmin: boolean;
      leftGroup: boolean;
      memberRef: DocumentReference<Member>;
    }[]
  ): Promise<void> {
    const groups: Group[] = groupQuerySnap.docs.map((doc) => {
      const userGroup = userGroups.find((g) => g.groupId === doc.id);
      return new Group({
        id: doc.id,
        ...doc.data()!,
        userActiveInGroup: userGroup?.active,
        userLeftGroup: userGroup?.leftGroup,
        userIsAdmin: userGroup?.groupAdmin,
        userMemberRef: userGroup?.memberRef,
        ref: doc.ref as DocumentReference<Group>, // NOSONAR - Type assertion is necessary here to satisfy Firestore query constraints
      });
    });

    this.groupStore.setAllUserGroups(groups);

    const user = this.userStore.user();
    const userRef = user?.ref;
    if (!userRef) return;

    const defaultGroupRef = await this.resolveDefaultGroupRef(
      user?.defaultGroupRef ?? null,
      groups,
      userRef
    );

    if (!this.groupStore.skipAutoSelect()) {
      await this.autoSelectGroup(groups, defaultGroupRef, userRef);
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

  // Self-heal: a defaultGroupRef pointing at a group the user no longer
  // belongs to (e.g. deleted out-of-band) would otherwise crash auto-select.
  private async resolveDefaultGroupRef(
    defaultGroupRef: DocumentReference<Group> | null,
    groups: Group[],
    userRef: DocumentReference<User>
  ): Promise<DocumentReference<Group> | null> {
    if (
      defaultGroupRef &&
      !groups.some((g) => g.ref?.eq(defaultGroupRef))
    ) {
      await setDoc(userRef, { defaultGroupRef: null }, { merge: true });
      this.userStore.updateUser({ defaultGroupRef: null });
      return null;
    }
    return defaultGroupRef;
  }

  private async autoSelectGroup(
    groups: Group[],
    defaultGroupRef: DocumentReference<Group> | null,
    userRef: DocumentReference<User>
  ): Promise<void> {
    // Both `active` (the group itself) and `userActiveInGroup` (this user's
    // own membership) must hold - a departed member who left voluntarily
    // (active:false on their own member doc, but still userRef-linked so
    // the group otherwise "matches") must never be auto-selected back in.
    const activeGroups = groups.filter((g) => g.active && g.userActiveInGroup);
    const currentGroup = this.groupStore.currentGroup();
    const freshCurrentGroup = currentGroup?.ref
      ? groups.find((g) => g.id === currentGroup.id)
      : undefined;

    if (freshCurrentGroup?.ref && freshCurrentGroup.userActiveInGroup) {
      await this.getGroup(freshCurrentGroup.ref, userRef);
    } else if (defaultGroupRef) {
      await this.getGroup(defaultGroupRef, userRef);
    } else if (activeGroups.length === 1 && activeGroups[0]?.ref) {
      await this.getGroup(activeGroups[0].ref, userRef);
    } else {
      this.groupStore.clearCurrentGroup();
      localStorage.removeItem('currentGroup');
    }
  }

  async getGroup(
    groupRef: DocumentReference<Group>,
    userRef: DocumentReference<User>
  ): Promise<void> {
    try {
      const docSnap = await getDoc(groupRef);

      if (!docSnap.exists()) {
        // Group was deleted out-of-band; clear selection and any stale default.
        this.groupStore.clearCurrentGroup();
        localStorage.removeItem('currentGroup');
        if (this.userStore.user()?.defaultGroupRef?.eq(groupRef)) {
          await setDoc(userRef, { defaultGroupRef: null }, { merge: true });
          this.userStore.updateUser({ defaultGroupRef: null });
        }
        this.analytics.logError(
          'Group Service',
          'getGroup',
          'Cleared stale default group reference',
          `Group with ID ${groupRef.id} not found`
        );
        return;
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
    const groupRef = doc(collection(this.fs, 'groups'));

    // Set all three membership arrays directly so the creator has
    // rule-checked read/write/admin access immediately, without waiting
    // ~1s for the syncGroupMemberUids trigger.
    //
    // The group doc is created in its own write, awaited before the member
    // and category docs are created, rather than one atomic batch. Their
    // create rules need isActiveMember(groupId), which get()s this group
    // doc - and a sibling document created in the *same* batch/transaction
    // is not visible to another document's rule evaluation via get() (that
    // get() sees pre-commit state and denies). Splitting into two
    // sequential steps is what lets the second write's rule check see a
    // group that genuinely exists.
    const creatorUid = member.userRef!.id;
    const groupWithMemberUids = {
      ...group,
      memberUids: [creatorUid],
      activeMemberUids: [creatorUid],
      adminUids: [creatorUid],
    };
    await setDoc(groupRef, groupWithMemberUids);

    try {
      const batch = writeBatch(this.fs);

      const memberRef = doc(
        collection(this.fs, `groups/${groupRef.id}/members`)
      );
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
    } catch (error) {
      // Best-effort cleanup: don't leave an orphaned group with no members
      // or default category if the second step fails.
      await deleteDoc(groupRef).catch(() => {});
      throw error;
    }

    if (this.groupStore.currentGroup() === null) {
      this.groupStore.setCurrentGroup(
        new Group({
          ...groupWithMemberUids,
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
