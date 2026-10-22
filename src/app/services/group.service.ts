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
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { RETURN_URL_PARAM, safeReturnUrl } from '@utils/return-url.util';
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
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly splitStore = inject(SplitStore);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly platformId = inject(PLATFORM_ID);

  #unsubscribeMembers?: () => void;
  #unsubscribeGroups?: () => void;

  // Group selection state (see getGroup and autoSelectGroup):
  //  - #selectionSeq: bumped by every getGroup() call. A call whose number is
  //    no longer the latest was superseded (the user picked another group, or
  //    the selection was cleared) and must not touch the stores.
  //  - #pendingGroupId: the group a getGroup() call is still loading.
  //  - #loadedGroupId: the group whose data listeners are running.
  #selectionSeq = 0;
  #pendingGroupId: string | null = null;
  #loadedGroupId: string | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const currentGroup = localStorage.getItem('currentGroup');
      if (currentGroup !== null) {
        const group = new Group({ ...JSON.parse(currentGroup) });
        // Legacy demo-mode cleanup: a leftover demo group (from a demo
        // session that didn't clean up localStorage) should never be
        // rehydrated as a real group. Demo mode was removed in Sept 2026; this
        // guard can be deleted once old browser sessions have aged out.
        if (group.id === 'demo-group-123') {
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
      const currentUrl = this.#effectiveUrl();
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
              this.clearCurrentGroup();
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
    // Login/register pages are handled by loggedInGuard. /auth/account is
    // deliberately not a redirect page: on narrow screens it is the Account
    // menu itself, and a validated user there must not be bounced to
    // Expenses whenever a groups snapshot lands (unvalidated users never get
    // here - getUserGroups returns early for them).
    // The login page may carry a returnUrl (the page the authGuard sent the
    // visitor away from), so only its path decides whether this is a redirect
    // page; a validated sign-in then returns to that page.
    const currentUrl = this.#effectiveUrl();
    const currentPath = currentUrl.split(/[?#]/)[0];
    const isLoginPage = currentPath === ROUTE_PATHS.AUTH_LOGIN;
    const isRedirectPage =
      isLoginPage || currentUrl === '/home' || currentUrl === '/';

    if (isRedirectPage) {
      // Validated users go to expenses (or back to where they were headed),
      // unvalidated users go to account
      if (this.userStore.isValidUser()) {
        const returnTree = isLoginPage
          ? safeReturnUrl(
              this.router,
              this.router.parseUrl(currentUrl).queryParams[RETURN_URL_PARAM]
            )
          : null;
        if (returnTree) {
          this.router.navigateByUrl(returnTree);
        } else {
          this.router.navigateByUrl(ROUTE_PATHS.EXPENSES_ROOT);
        }
      } else {
        this.router.navigateByUrl(ROUTE_PATHS.AUTH_ACCOUNT);
      }
    }
  }

  // Where the user is: router.url, or - while a navigation is in flight -
  // where they are going. On a cold load router.url stays '/' until the first
  // navigation commits (after lazy routes and the async auth guard), so a
  // deep link would otherwise look like a visit to the home page.
  #effectiveUrl(): string {
    const pending = this.router.currentNavigation();
    return pending
      ? this.router.serializeUrl(pending.finalUrl ?? pending.extractedUrl)
      : this.router.url;
  }

  // Self-heal: a defaultGroupRef pointing at a group the user no longer
  // belongs to (e.g. deleted out-of-band) would otherwise crash auto-select.
  // Also self-heals a group the user voluntarily LEFT - it's still present
  // in `groups` (memberUids keeps a left member linked for the rejoin list)
  // but userActiveInGroup is false, and a stale defaultGroupRef must not
  // silently re-select it in autoSelectGroup's `else if (defaultGroupRef)`
  // branch. This can otherwise race the member-doc write's own listener
  // firing before this user's local defaultGroupRef gets cleared elsewhere.
  private async resolveDefaultGroupRef(
    defaultGroupRef: DocumentReference<Group> | null,
    groups: Group[],
    userRef: DocumentReference<User>
  ): Promise<DocumentReference<Group> | null> {
    const matchingGroup = defaultGroupRef
      ? groups.find((g) => g.ref?.eq(defaultGroupRef))
      : undefined;

    if (defaultGroupRef && !matchingGroup?.userActiveInGroup) {
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

    // A group still loading (e.g. one the user just picked) decides the
    // selection; starting another load here would race it and could undo the
    // user's choice. Unless the user has lost access to it in the meantime.
    const pendingGroup = groups.find((g) => g.id === this.#pendingGroupId);
    if (pendingGroup?.userActiveInGroup) return;

    const currentGroup = this.groupStore.currentGroup();
    const freshCurrentGroup = currentGroup?.ref
      ? groups.find((g) => g.id === currentGroup.id)
      : undefined;

    if (freshCurrentGroup?.ref && freshCurrentGroup.userActiveInGroup) {
      if (freshCurrentGroup.id === this.#loadedGroupId) {
        this.#refreshCurrentGroup(freshCurrentGroup, userRef);
      } else {
        // e.g. restored from localStorage on app load: nothing loaded yet
        await this.getGroup(freshCurrentGroup.ref, userRef);
      }
    } else if (defaultGroupRef) {
      await this.getGroup(defaultGroupRef, userRef);
    } else if (activeGroups.length === 1 && activeGroups[0]?.ref) {
      await this.getGroup(activeGroups[0].ref, userRef);
    } else {
      // No group to fall back to (e.g. just left this one with nothing else
      // active). Without stopping the listeners and emptying the stores,
      // whatever the previous group's expenses/categories/members/etc. were
      // stay visible in these signals indefinitely (a real access loophole
      // once rules deny fresh reads for a left group - the UI just keeps
      // showing data fetched before leaving).
      this.clearCurrentGroup();
    }
  }

  // A snapshot re-delivered the group that is already loaded (e.g. it was
  // renamed, or someone joined it). Publish its fresh data and re-read the
  // user's own member record - a change to that also fires the snapshot -
  // without re-fetching the group, rewriting the user's default or
  // restarting every data listener.
  #refreshCurrentGroup(group: Group, userRef: DocumentReference<User>): void {
    const current = new Group({ ...group });
    // Membership flags describe the user, not the group; getGroup() doesn't
    // put them on the current group either.
    delete current.userActiveInGroup;
    delete current.userLeftGroup;
    delete current.userIsAdmin;
    delete current.userMemberRef;
    this.groupStore.setCurrentGroup(current);
    localStorage.setItem('currentGroup', JSON.stringify(current));
    this.memberService.getMemberByUserRef(group.id, userRef);
  }

  /**
   * Leaves the app with no current group: cancels any group still loading,
   * stops every per-group data listener and empties the per-group stores, so
   * nothing keeps reading (or showing) a group that is no longer selected.
   * Selecting a group later starts fresh listeners.
   *
   * @param skipAutoSelect true stops the next groups snapshot from
   *   immediately auto-selecting a replacement (deactivate, archive, delete).
   */
  clearCurrentGroup(skipAutoSelect = false): void {
    this.#cancelPendingSelection();
    this.groupStore.clearCurrentGroup(skipAutoSelect);
    localStorage.removeItem('currentGroup');
    this.clearCurrentGroupData();
  }

  // Makes any in-flight getGroup() call stale, so it can't select its group
  // after the selection was cleared.
  #cancelPendingSelection(): void {
    this.#selectionSeq++;
    this.#pendingGroupId = null;
  }

  private clearCurrentGroupData(): void {
    this.#loadedGroupId = null;
    this.memberService.stopListening();
    this.categoryService.stopListening();
    this.memorizedService.stopListening();
    this.splitsService.stopListening();
    this.historyService.stopListening();
    this.categoryStore.clearGroupCategories();
    this.memberStore.clearGroupMembers();
    this.expenseStore.clearGroupExpenses();
    this.memorizedStore.clearMemorizedExpenses();
    this.historyStore.clearHistory();
    this.splitStore.clearSplits();
  }

  async getGroup(
    groupRef: DocumentReference<Group>,
    userRef: DocumentReference<User>
  ): Promise<void> {
    const seq = ++this.#selectionSeq;
    const isSuperseded = () => seq !== this.#selectionSeq;
    this.#pendingGroupId = groupRef.id;
    try {
      const docSnap = await getDoc(groupRef);
      // Another selection started (or the selection was cleared) while this
      // one was loading: the newer one wins.
      if (isSuperseded()) return;

      if (!docSnap.exists()) {
        // Group was deleted out-of-band; clear selection and any stale default.
        this.clearCurrentGroup();
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

      // Switching groups: empty the previous group's data first, so no page
      // shows the new group alongside the old group's members, categories
      // and so on while the new group's data loads.
      if (this.#loadedGroupId !== group.id) {
        this.clearCurrentGroupData();
      }
      this.groupStore.setCurrentGroup(group);
      this.groupStore.resetSkipAutoSelect();
      localStorage.setItem('currentGroup', JSON.stringify(group));

      // Initialize group-related data
      this.#loadedGroupId = group.id;
      this.#pendingGroupId = null;
      this.categoryService.getGroupCategories(groupRef.id);
      this.memberService.getGroupMembers(groupRef.id);
      this.memberService.getMemberByUserRef(groupRef.id, userRef);
      this.expenseService.doesGroupHaveExpenses(groupRef.id);
      this.memorizedService.getMemorizedExpensesForGroup(groupRef.id);
      this.splitsService.getUnpaidSplitsForGroup(groupRef.id);
      this.historyService.getHistoryForGroup(groupRef.id);

      // Remember the selection for the next visit - only when it changed.
      // Each write also fires the syncUserEmailLower trigger.
      if (!this.userStore.user()?.defaultGroupRef?.eq(groupRef)) {
        await setDoc(userRef, { defaultGroupRef: groupRef }, { merge: true });
        this.userStore.updateUser({ defaultGroupRef: groupRef });
      }
    } catch (error) {
      this.analytics.logError(
        'Group Service',
        'getGroup',
        'Failed to get group',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    } finally {
      if (!isSuperseded()) this.#pendingGroupId = null;
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
      // The rules forbid deleting a group, so the group doc written above
      // cannot be cleaned up from here. An orphaned group (its creator the
      // only uid in its arrays) is possible but practically unreachable: the
      // creator's own member row passes the rules for any normal profile.
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

    // Only an explicit deactivate or archive counts. A change that leaves
    // `active` out (a rename, or unarchiving - which deliberately keeps the
    // group inactive until an admin reactivates it) is an ordinary update.
    const deactivating = changes.active === false || changes.archived === true;

    // If deactivating or archiving the group, clear it as default for all users
    if (deactivating) {
      const usersRef = collection(this.fs, 'users');
      const usersQuery = query(
        usersRef,
        where('defaultGroupRef', '==', groupRef)
      );
      const users = await getDocs(usersQuery);
      users.forEach((u) => {
        batch.update(u.ref, { defaultGroupRef: null });
      });
    }

    await batch.commit();

    // Unselect it if it's the current group - only once the change is saved
    if (deactivating && this.groupStore.currentGroup()?.id === groupRef.id) {
      this.clearCurrentGroup(true);
      this.userStore.updateUser({ defaultGroupRef: null });
    }
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
      this.clearCurrentGroup(true);
      this.userStore.updateUser({ defaultGroupRef: null });
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
    this.#cancelPendingSelection();
    this.clearCurrentGroupData();
    localStorage.removeItem('currentGroup');
    this.groupStore.clearAllUserGroups();
    this.groupStore.setLoadedState(false);
  }
}
