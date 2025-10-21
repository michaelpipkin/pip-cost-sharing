import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { CategoryService } from './category.service';
import { IGroupService } from './group.service.interface';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemorizedService } from './memorized.service';
import { SplitService } from './split.service';
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
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class GroupService implements IGroupService {
  protected readonly fs = inject(getFirestore);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberService = inject(MemberService);
  protected readonly categoryService = inject(CategoryService);
  protected readonly splitsService = inject(SplitService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly historyService = inject(HistoryService);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(getAnalytics);

  constructor() {
    const currentGroup = localStorage.getItem('currentGroup');
    if (currentGroup !== null) {
      const group = new Group({ ...JSON.parse(currentGroup) });
      group.ref = doc(
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
      this.router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]);
      this.loading.loadingOff();
      return;
    }

    try {
      const memberQuery = query(
        collectionGroup(this.fs, 'members'),
        where('userRef', '==', user.ref)
      );

      onSnapshot(
        memberQuery,
        (memberQuerySnap) => {
          try {
            const userGroups: { groupId: string; groupAdmin: boolean }[] =
              memberQuerySnap.docs.map((d) => ({
                groupId: d.ref.parent.parent.id,
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
            onSnapshot(
              groupQuery,
              async (groupQuerySnap) => {
                try {
                  const userGroupIds = userGroups.map((m) => m.groupId);
                  this.groupStore.setAdminGroupIds(
                    userGroups.filter((f) => f.groupAdmin).map((m) => m.groupId)
                  );

                  const groups: Group[] = groupQuerySnap.docs
                    .map(
                      (doc) =>
                        new Group({
                          id: doc.id,
                          ...doc.data(),
                          ref: doc.ref as DocumentReference<Group>,
                        })
                    )
                    .filter((g) => userGroupIds.includes(g.id));

                  this.groupStore.setAllUserGroups(groups);
                  user = this.userStore.user();
                  const activeGroups = groups.filter((g) => g.active);
                  if (
                    !!this.groupStore.currentGroup() &&
                    groups.includes(this.groupStore.currentGroup())
                  ) {
                    await this.getGroup(
                      this.groupStore.currentGroup().ref,
                      user.ref
                    );
                  } else {
                    if (
                      !!user.defaultGroupRef &&
                      user.defaultGroupRef !== null
                    ) {
                      await this.getGroup(user.defaultGroupRef, user.ref);
                    } else if (activeGroups.length === 1) {
                      await this.getGroup(activeGroups[0].ref, user.ref);
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
                } catch (error) {
                  logEvent(this.analytics, 'error', {
                    service: 'GroupService',
                    method: 'getUserGroups',
                    message: 'Failed to process groups snapshot',
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              },
              (error) => {
                logEvent(this.analytics, 'error', {
                  service: 'GroupService',
                  method: 'getUserGroups',
                  message: 'Failed to listen to groups',
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                });
              }
            );
          } catch (error) {
            logEvent(this.analytics, 'error', {
              service: 'GroupService',
              method: 'getUserGroups',
              message: 'Failed to process members snapshot',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },
        (error) => {
          logEvent(this.analytics, 'error', {
            service: 'GroupService',
            method: 'getUserGroups',
            message: 'Failed to listen to members',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      );
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'GroupService',
        method: 'getUserGroups',
        message: 'Failed to initialize user groups query',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
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
        id: docSnap.id,
        ...docSnap.data(),
        ref: docSnap.ref as DocumentReference<Group>,
      });

      this.groupStore.setCurrentGroup(group);
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
      this.memorizedService.getMemorizedExpensesForGroup(groupRef.id);
      this.splitsService.getUnpaidSplitsForGroup(groupRef.id);
      this.historyService.getHistoryForGroup(groupRef.id);
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'GroupService',
        method: 'getGroup',
        message: 'Failed to get group',
        groupId: groupRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async addGroup(
    group: Partial<Group>,
    member: Partial<Member>
  ): Promise<DocumentReference<Group>> {
    try {
      const batch = writeBatch(this.fs);
      const groupRef = doc(collection(this.fs, 'groups'));

      batch.set(groupRef, group);

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
      return groupRef as DocumentReference<Group>;
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'GroupService',
        method: 'addGroup',
        message: 'Failed to add group',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateGroup(
    groupRef: DocumentReference<Group>,
    changes: Partial<Group>
  ): Promise<void> {
    try {
      const batch = writeBatch(this.fs);
      batch.update(groupRef, changes);

      // If deactivating the group, clear it as default for all users
      if (!changes.active) {
        const usersRef = collection(this.fs, 'users');
        const usersQuery = query(
          usersRef,
          where('defaultGroupRef', '==', groupRef)
        );
        const users = await getDocs(usersQuery);
        users.forEach((u) => {
          batch.update(u.ref, { defaultGroupRef: null });
        });

        // Clear current group if it's the one being deactivated
        if (this.groupStore.currentGroup().id === groupRef.id) {
          this.groupStore.clearCurrentGroup();
          this.userStore.updateUser({ defaultGroupRef: null });
          localStorage.removeItem('currentGroup');
        }
      }

      await batch.commit();
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'GroupService',
        method: 'updateGroup',
        message: 'Failed to update group',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  logout(): void {
    localStorage.removeItem('currentGroup');
    this.groupStore.clearAllUserGroups();
    this.groupStore.clearAdminGroupIds();
    this.groupStore.setLoadedState(false);
  }

  /**
   * Batch update all expenses and splits in a group to normalize dates to UTC midnight.
   * This is a one-time migration to fix timezone issues with existing data.
   *
   * @param groupId - The ID of the group to update
   * @returns Promise<{success: boolean, expensesUpdated: number, splitsUpdated: number, errors: string[]}>
   */
  // async normalizeGroupDatesToUTC(groupId: string): Promise<{
  //   success: boolean;
  //   expensesUpdated: number;
  //   splitsUpdated: number;
  //   errors: string[];
  // }> {
  //   const result = {
  //     success: false,
  //     expensesUpdated: 0,
  //     splitsUpdated: 0,
  //     errors: [] as string[]
  //   };

  //   try {
  //     logEvent(this.analytics, 'date_normalization_started', { groupId });

  //     // Get all expenses for the group
  //     const expensesQuery = query(collection(this.fs, `groups/${groupId}/expenses`));
  //     const expensesSnapshot = await getDocs(expensesQuery);

  //     // Get all splits for the group
  //     const splitsQuery = query(collection(this.fs, `groups/${groupId}/splits`));
  //     const splitsSnapshot = await getDocs(splitsQuery);

  //     console.log(`Found ${expensesSnapshot.docs.length} expenses and ${splitsSnapshot.docs.length} splits to normalize`);

  //     // Process in batches (Firestore limit is 500 operations per batch)
  //     const BATCH_SIZE = 400; // Leave some buffer
  //     let totalBatches = 0;

  //     // Process expenses
  //     for (let i = 0; i < expensesSnapshot.docs.length; i += BATCH_SIZE) {
  //       const batch = writeBatch(this.fs);
  //       const expenseBatch = expensesSnapshot.docs.slice(i, i + BATCH_SIZE);

  //       expenseBatch.forEach(expenseDoc => {
  //         const data = expenseDoc.data();
  //         if (data.date && !DateUtils.isUTCMidnight(data.date)) {
  //           const normalizedDate = DateUtils.toUTCTimestamp(data.date.toDate());
  //           batch.update(expenseDoc.ref, { date: normalizedDate });
  //           result.expensesUpdated++;
  //         }
  //       });

  //       if (expenseBatch.length > 0) {
  //         await batch.commit();
  //         totalBatches++;
  //         console.log(`Completed expense batch ${totalBatches} (${expenseBatch.length} expenses)`);
  //       }
  //     }

  //     // Process splits
  //     for (let i = 0; i < splitsSnapshot.docs.length; i += BATCH_SIZE) {
  //       const batch = writeBatch(this.fs);
  //       const splitBatch = splitsSnapshot.docs.slice(i, i + BATCH_SIZE);

  //       splitBatch.forEach(splitDoc => {
  //         const data = splitDoc.data();
  //         if (data.date && !DateUtils.isUTCMidnight(data.date)) {
  //           const normalizedDate = DateUtils.toUTCTimestamp(data.date.toDate());
  //           batch.update(splitDoc.ref, { date: normalizedDate });
  //           result.splitsUpdated++;
  //         }
  //       });

  //       if (splitBatch.length > 0) {
  //         await batch.commit();
  //         totalBatches++;
  //         console.log(`Completed split batch ${totalBatches} (${splitBatch.length} splits)`);
  //       }
  //     }

  //     result.success = true;

  //     logEvent(this.analytics, 'date_normalization_completed', {
  //       groupId,
  //       expensesUpdated: result.expensesUpdated,
  //       splitsUpdated: result.splitsUpdated,
  //       totalBatches
  //     });

  //     console.log(`✅ Date normalization completed for group ${groupId}:`);
  //     console.log(`   - ${result.expensesUpdated} expenses updated`);
  //     console.log(`   - ${result.splitsUpdated} splits updated`);
  //     console.log(`   - ${totalBatches} batches processed`);

  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //     result.errors.push(errorMessage);

  //     logEvent(this.analytics, 'error', {
  //       service: 'GroupService',
  //       method: 'normalizeGroupDatesToUTC',
  //       message: 'Failed to normalize group dates to UTC',
  //       groupId,
  //       error: errorMessage
  //     });

  //     console.error(`❌ Date normalization failed for group ${groupId}:`, error);
  //   }

  //   return result;
  // }

  /**
   * Normalize dates for all groups the user has access to.
   * Use with caution - this will update all group data.
   */
  // async normalizeAllGroupDatesToUTC(): Promise<{
  //   success: boolean;
  //   groupsProcessed: number;
  //   totalExpensesUpdated: number;
  //   totalSplitsUpdated: number;
  //   errors: string[];
  // }> {
  //   const result = {
  //     success: false,
  //     groupsProcessed: 0,
  //     totalExpensesUpdated: 0,
  //     totalSplitsUpdated: 0,
  //     errors: [] as string[]
  //   };

  //   try {
  //     const userGroups = this.groupStore.allUserGroups();
  //     console.log(`Starting date normalization for ${userGroups.length} groups...`);

  //     for (const group of userGroups) {
  //       console.log(`\nProcessing group: ${group.name} (${group.id})`);

  //       const groupResult = await this.normalizeGroupDatesToUTC(group.id);

  //       result.groupsProcessed++;
  //       result.totalExpensesUpdated += groupResult.expensesUpdated;
  //       result.totalSplitsUpdated += groupResult.splitsUpdated;

  //       if (!groupResult.success) {
  //         result.errors.push(`Group ${group.name}: ${groupResult.errors.join(', ')}`);
  //       }
  //     }

  //     result.success = result.errors.length === 0;

  //     console.log(`\n🎉 All groups processed!`);
  //     console.log(`   - ${result.groupsProcessed} groups processed`);
  //     console.log(`   - ${result.totalExpensesUpdated} total expenses updated`);
  //     console.log(`   - ${result.totalSplitsUpdated} total splits updated`);

  //     if (result.errors.length > 0) {
  //       console.log(`   - ${result.errors.length} errors occurred`);
  //     }

  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //     result.errors.push(errorMessage);
  //     console.error('❌ Failed to normalize all group dates:', error);
  //   }

  //   return result;
  // }
}
