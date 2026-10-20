import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, UrlTree } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import * as firestoreModule from 'firebase/firestore';
import * as functionsModule from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryService } from './category.service';
import { ExpenseService } from './expense.service';
import { GroupService } from './group.service';
import { HistoryService } from './history.service';
import { MemberService } from './member.service';
import { MemorizedService } from './memorized.service';
import { SplitService } from './split.service';

const mockFs = {};
const mockFunctions = {};
const mockDocRef = { id: 'group-1', path: 'groups/group-1' };
const serializer = new DefaultUrlSerializer();

/** A group ref that supports the app's DocumentReference.eq() extension. */
function groupRef(id: string): any {
  return { id, path: `groups/${id}`, eq: (other: any) => other?.id === id };
}

/** A promise the test resolves by hand, to interleave async steps. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function groupDocSnap(id: string, name = `Group ${id}`): any {
  return {
    exists: () => true,
    id,
    data: () => ({ name, active: true }),
    ref: groupRef(id),
  };
}

function makeSnap(docs: any[] = []) {
  return {
    size: docs.length,
    empty: docs.length === 0,
    docs,
    forEach: (callback: (doc: any) => void) => docs.forEach(callback),
  };
}

describe('GroupService', () => {
  let service: GroupService;
  let mockBatch: any;

  const currentGroupSignal = signal<any>(null);
  const skipAutoSelectSignal = signal(false);
  const allUserGroupsSignal = signal<any[]>([]);
  const isValidUserComputed = signal(true);
  const userSignal = signal<any>(null);
  const mockGroupStore = {
    currentGroup: currentGroupSignal,
    allUserGroups: allUserGroupsSignal,
    skipAutoSelect: skipAutoSelectSignal,
    setCurrentGroup: vi.fn((group: any) => currentGroupSignal.set(group)),
    clearCurrentGroup: vi.fn(() => currentGroupSignal.set(null)),
    setAllUserGroups: vi.fn(),
    clearAllUserGroups: vi.fn(),
    setLoadedState: vi.fn(),
    removeGroup: vi.fn(),
    resetSkipAutoSelect: vi.fn(),
  };
  const mockUserStore = {
    user: userSignal,
    isValidUser: isValidUserComputed,
    updateUser: vi.fn(),
  };
  const mockCategoryService = { getGroupCategories: vi.fn(), stopListening: vi.fn() };
  const mockMemberService = {
    getGroupMembers: vi.fn(),
    getMemberByUserRef: vi.fn().mockResolvedValue(undefined),
    stopListening: vi.fn(),
  };
  const mockSplitService = { getUnpaidSplitsForGroup: vi.fn(), stopListening: vi.fn() };
  const mockMemorizedService = { getMemorizedExpensesForGroup: vi.fn(), stopListening: vi.fn() };
  const mockHistoryService = { getHistoryForGroup: vi.fn(), stopListening: vi.fn() };
  const mockLoading = { loadingOff: vi.fn() };
  const mockRouter = {
    url: '/',
    navigated: true,
    currentNavigation: signal<any>(null),
    serializeUrl: (tree: UrlTree) => serializer.serialize(tree),
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };
  const mockExpenseService = { doesGroupHaveExpenses: vi.fn().mockResolvedValue(false) };

  function createService(): GroupService {
    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: UserStore, useValue: mockUserStore },
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: SplitService, useValue: mockSplitService },
        { provide: MemorizedService, useValue: mockMemorizedService },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: LoadingService, useValue: mockLoading },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    const svc = TestBed.inject(GroupService);
    (svc as any).router = mockRouter;
    return svc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(firestoreModule, 'collection').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'collectionGroup').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'doc').mockReturnValue(mockDocRef as any);
    vi.spyOn(firestoreModule, 'query').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'orderBy').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => false,
    } as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap([]) as any);
    vi.spyOn(firestoreModule, 'setDoc').mockResolvedValue(undefined as any);
    vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValue(undefined as any);

    localStorage.clear();
    currentGroupSignal.set(null);
    skipAutoSelectSignal.set(false);
    allUserGroupsSignal.set([]);
    isValidUserComputed.set(true);
    userSignal.set(null);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('constructor - restoring saved group from localStorage', () => {
    it('should set current group from localStorage on initialization', () => {
      localStorage.setItem(
        'currentGroup',
        JSON.stringify({ id: 'group-1', name: 'Test Group' })
      );

      service = createService();

      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalledOnce();
    });

    it('should not set current group when localStorage is empty', () => {
      service = createService();

      expect(mockGroupStore.setCurrentGroup).not.toHaveBeenCalled();
    });

    it('should discard a stale demo group instead of rehydrating it', () => {
      localStorage.setItem(
        'currentGroup',
        JSON.stringify({ id: 'demo-group-123', name: 'Demo Household' })
      );

      service = createService();

      expect(mockGroupStore.setCurrentGroup).not.toHaveBeenCalled();
      expect(localStorage.getItem('currentGroup')).toBeNull();
    });
  });

  describe('addGroup', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should create the group doc first, then member and default category in a batch', async () => {
      const result = await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice', userRef: { id: 'user-1' } as any }
      );

      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1); // group doc, awaited on its own
      expect(mockBatch.set).toHaveBeenCalledTimes(2); // member + default category
      expect(result).toBe(mockDocRef);
    });

    it('should set memberUids, activeMemberUids, and adminUids to the creator on the group doc', async () => {
      await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice', userRef: { id: 'user-1' } as any }
      );

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'New Group',
          memberUids: ['user-1'],
          activeMemberUids: ['user-1'],
          adminUids: ['user-1'],
        })
      );
    });

    it('should always create a category named "Default"', async () => {
      await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice', userRef: { id: 'user-1' } as any }
      );

      const categorySetCall = mockBatch.set.mock.calls.find(
        (call: any[]) => call[1]?.name === 'Default'
      );
      expect(categorySetCall).toBeDefined();
      expect(categorySetCall![1]).toMatchObject({
        name: 'Default',
        active: true,
      });
    });

    it('should delete the group doc if creating the member/category batch fails', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'));

      await expect(
        service.addGroup(
          { name: 'New Group' },
          { displayName: 'Alice', userRef: { id: 'user-1' } as any }
        )
      ).rejects.toThrow('permission-denied');

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
  });

  describe('updateGroup', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should update the group document', async () => {
      const groupRef = { id: 'group-1' } as any;
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.updateGroup(groupRef, { name: 'New Name' });

      expect(mockBatch.update).toHaveBeenCalledWith(groupRef, {
        name: 'New Name',
      });
    });

    it('should clear defaultGroupRef for all users when deactivating', async () => {
      const groupRef = { id: 'group-1' } as any;
      const userDoc = { ref: { id: 'user-1' } };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([userDoc]) as any
      );

      await service.updateGroup(groupRef, { active: false });

      expect(mockBatch.update).toHaveBeenCalledWith(userDoc.ref, {
        defaultGroupRef: null,
      });
    });

    it('should clear current group from store when deactivating the active group', async () => {
      const groupRef = { id: 'group-1' } as any;
      currentGroupSignal.set({ id: 'group-1' });
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.updateGroup(groupRef, { active: false });

      expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalledWith(true);
    });

    it('should not clear current group when deactivating a different group', async () => {
      const groupRef = { id: 'group-2' } as any;
      currentGroupSignal.set({ id: 'group-1' });
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.updateGroup(groupRef, { active: false });

      expect(mockGroupStore.clearCurrentGroup).not.toHaveBeenCalled();
    });
  });

  describe('getUserGroups', () => {
    beforeEach(() => {
      service = createService();
    });

    it('scopes the groups query to the current user via memberUids', async () => {
      let membersCallback: ((snap: any) => void) | undefined;
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (_query: any, onNext: any) => {
          membersCallback ??= onNext;
          return vi.fn();
        }
      );

      const user = { id: 'user-1', ref: { id: 'user-1' } } as any;
      await service.getUserGroups(user);
      membersCallback!(
        makeSnap([
          {
            ref: { parent: { parent: { id: 'group-1' } } },
            data: () => ({ active: true, groupAdmin: false }),
          },
        ])
      );

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'memberUids',
        'array-contains',
        'user-1'
      );
    });

    it('redirects to admin groups without querying groups when the user has none', async () => {
      let membersCallback: ((snap: any) => void) | undefined;
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (_query: any, onNext: any) => {
          membersCallback ??= onNext;
          return vi.fn();
        }
      );

      const user = { id: 'user-1', ref: { id: 'user-1' } } as any;
      await service.getUserGroups(user);
      membersCallback!(makeSnap([]));

      expect(mockGroupStore.setAllUserGroups).toHaveBeenCalledWith([]);
      expect(mockRouter.navigateByUrl).toHaveBeenCalled();
    });

    describe('auto-select and userActiveInGroup', () => {
      function captureSnapshotCallbacks(): ((snap: any) => void)[] {
        const callbacks: ((snap: any) => void)[] = [];
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          (_query: any, onNext: any) => {
            callbacks.push(onNext);
            return vi.fn();
          }
        );
        return callbacks;
      }

      const user = {
        id: 'user-1',
        ref: { id: 'user-1' },
        defaultGroupRef: null,
      } as any;

      beforeEach(() => {
        // handleGroupsSnapshot reads userStore.user() directly (not the
        // `user` param passed to getUserGroups) to resolve userRef/
        // defaultGroupRef - without this it returns early before ever
        // reaching auto-select.
        userSignal.set(user);
      });

      it('does not auto-select the only "active" group when the user left it voluntarily', async () => {
        const callbacks = captureSnapshotCallbacks();

        await service.getUserGroups(user);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: false, groupAdmin: false, leftGroup: true }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: { id: 'group-1' },
            },
          ])
        );

        expect(mockGroupStore.setCurrentGroup).not.toHaveBeenCalled();
        expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalled();
      });

      it('still auto-selects the only active group when the user is an active member', async () => {
        const callbacks = captureSnapshotCallbacks();
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          id: 'group-1',
          data: () => ({ name: 'Test Group', active: true }),
          ref: { id: 'group-1' },
        } as any);

        await service.getUserGroups(user);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: true, groupAdmin: false, leftGroup: false }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: { id: 'group-1' },
            },
          ])
        );

        expect(mockGroupStore.setCurrentGroup).toHaveBeenCalled();
      });

      it('does not re-select the cached currentGroup if the user is no longer active in it', async () => {
        currentGroupSignal.set({ id: 'group-1', ref: { id: 'group-1' } });
        const callbacks = captureSnapshotCallbacks();

        await service.getUserGroups(user);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: false, groupAdmin: false, leftGroup: true }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: { id: 'group-1' },
            },
          ])
        );

        expect(mockGroupStore.setCurrentGroup).not.toHaveBeenCalled();
        expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalled();
      });

      it('self-heals and does not re-select a stale defaultGroupRef pointing at a group the user left', async () => {
        // Regression test: defaultGroupRef stayed pointing at group-1 (still
        // present in `groups` since memberUids keeps a left member linked
        // for the rejoin list), but the user is no longer active in it.
        // resolveDefaultGroupRef must null it out rather than treating
        // "still present" as "still valid" - otherwise autoSelectGroup's
        // `else if (defaultGroupRef)` branch silently re-selects a group the
        // user just left.
        const groupRef = { id: 'group-1', eq: (o: any) => o?.id === 'group-1' };
        const leftUser = { ...user, defaultGroupRef: groupRef };
        userSignal.set(leftUser);
        const callbacks = captureSnapshotCallbacks();

        await service.getUserGroups(leftUser);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: false, groupAdmin: false, leftGroup: true }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: groupRef,
            },
          ])
        );

        expect(firestoreModule.setDoc).toHaveBeenCalledWith(
          leftUser.ref,
          { defaultGroupRef: null },
          { merge: true }
        );
        expect(mockUserStore.updateUser).toHaveBeenCalledWith({
          defaultGroupRef: null,
        });
        expect(mockGroupStore.setCurrentGroup).not.toHaveBeenCalled();
      });

      it('clears per-group listeners and stores when no group ends up selected', async () => {
        // Pre-populate each store as if a group had been active before this
        // - the assertions below prove clearCurrentGroupData() actually
        // reset them, rather than them merely starting out empty.
        TestBed.inject(CategoryStore).setGroupCategories([{ id: 'c1' } as any]);
        TestBed.inject(ExpenseStore).setGroupHasExpenses(true);
        TestBed.inject(MemberStore).setGroupMembers([{ id: 'm1' } as any]);
        TestBed.inject(MemorizedStore).setMemorizedExpenses([{ id: 'z1' } as any]);
        TestBed.inject(HistoryStore).setHistory([{ id: 'h1' } as any]);
        TestBed.inject(SplitStore).setSplits([{ id: 's1' } as any]);

        const callbacks = captureSnapshotCallbacks();

        await service.getUserGroups(user);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: false, groupAdmin: false, leftGroup: true }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: { id: 'group-1' },
            },
          ])
        );

        // This is what closes the access loophole: leaving a group with
        // nothing else to fall back to must tear down that group's
        // listeners/stores, not leave its previously-fetched
        // expenses/categories/members/etc. sitting in the signals.
        expect(mockCategoryService.stopListening).toHaveBeenCalled();
        expect(mockMemberService.stopListening).toHaveBeenCalled();
        expect(mockMemorizedService.stopListening).toHaveBeenCalled();
        expect(mockSplitService.stopListening).toHaveBeenCalled();
        expect(mockHistoryService.stopListening).toHaveBeenCalled();
        expect(TestBed.inject(CategoryStore).groupCategories()).toEqual([]);
        expect(TestBed.inject(ExpenseStore).groupHasExpenses()).toBe(false);
        expect(TestBed.inject(MemberStore).groupMembers()).toEqual([]);
        expect(TestBed.inject(MemorizedStore).memorizedExpenses()).toEqual([]);
        expect(TestBed.inject(HistoryStore).groupHistory()).toEqual([]);
        expect(TestBed.inject(SplitStore).unpaidSplits()).toEqual([]);
      });
    });

    describe('post-load redirect to Expenses', () => {
      const user = {
        id: 'user-1',
        ref: { id: 'user-1' },
        defaultGroupRef: null,
      } as any;

      /**
       * The router as it looks while the groups snapshot arrives: `url` is
       * the committed URL, and `pendingUrl` (if any) is where the in-flight
       * navigation is going. Real Router during a cold load of a deep link:
       * url '/', navigated false, currentNavigation() targeting the link.
       */
      function useRouter(url: string, pendingUrl: string | null): void {
        const pending =
          pendingUrl === null
            ? null
            : {
                id: 1,
                initialUrl: serializer.parse(pendingUrl),
                extractedUrl: serializer.parse(pendingUrl),
                trigger: 'imperative',
                extras: {},
                previousNavigation: null,
              };
        (service as any).router = {
          ...mockRouter,
          url,
          navigated: pending === null,
          currentNavigation: signal(pending),
          serializeUrl: (tree: UrlTree) => serializer.serialize(tree),
        };
      }

      /** Delivers one active group, which auto-select then selects. */
      async function deliverOneActiveGroup(): Promise<void> {
        const callbacks: ((snap: any) => void)[] = [];
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          (_query: any, onNext: any) => {
            callbacks.push(onNext);
            return vi.fn();
          }
        );
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          id: 'group-1',
          data: () => ({ name: 'Test Group', active: true }),
          ref: { id: 'group-1' },
        } as any);

        await service.getUserGroups(user);
        await callbacks[0]!(
          makeSnap([
            {
              ref: { parent: { parent: { id: 'group-1' } } },
              data: () => ({ active: true, groupAdmin: false, leftGroup: false }),
            },
          ])
        );
        await callbacks[1]!(
          makeSnap([
            {
              id: 'group-1',
              data: () => ({ name: 'Test Group', active: true, archived: false }),
              ref: { id: 'group-1' },
            },
          ])
        );
      }

      beforeEach(() => {
        userSignal.set(user);
      });

      it('redirects to Expenses when the app landed on the home page', async () => {
        useRouter('/', null);

        await deliverOneActiveGroup();

        expect(mockGroupStore.setCurrentGroup).toHaveBeenCalled();
        expect(mockRouter.navigateByUrl).toHaveBeenCalledWith(
          ROUTE_PATHS.EXPENSES_ROOT
        );
      });

      it('does not redirect once a deep link has been activated', async () => {
        useRouter('/analysis/summary', null);

        await deliverOneActiveGroup();

        expect(mockGroupStore.setCurrentGroup).toHaveBeenCalled();
        expect(mockRouter.navigateByUrl).not.toHaveBeenCalledWith(
          ROUTE_PATHS.EXPENSES_ROOT
        );
      });

      // router.url stays '/' until the initial navigation commits (after lazy
      // loadChildren, the async authGuard and loadComponent). When the groups
      // load first, the redirect must judge by where the in-flight navigation
      // is going, or a bookmark/refresh of an authenticated page (e.g.
      // /expenses/add, /analysis/summary) lands on /expenses (found by e2e
      // expenses.spec, Plan 2 Task 5). The stub mirrors the real router at
      // that moment: url '/', navigated false, currentNavigation() targeting
      // the deep link.
      it('does not redirect a deep link whose initial navigation is still pending', async () => {
        useRouter('/', '/analysis/summary');

        await deliverOneActiveGroup();

        expect(mockGroupStore.setCurrentGroup).toHaveBeenCalled();
        expect(mockRouter.navigateByUrl).not.toHaveBeenCalledWith(
          ROUTE_PATHS.EXPENSES_ROOT
        );
      });

      it('still redirects when the pending navigation is going to the home page', async () => {
        useRouter('/', '/home');

        await deliverOneActiveGroup();

        expect(mockRouter.navigateByUrl).toHaveBeenCalledWith(
          ROUTE_PATHS.EXPENSES_ROOT
        );
      });

      it('lets an unverified user finish a pending email-action link', async () => {
        useRouter('/', '/auth/account-action?mode=verifyEmail&oobCode=abc');
        isValidUserComputed.set(false);

        await service.getUserGroups(user);

        expect((service as any).router.navigate).not.toHaveBeenCalled();
      });
    });

    describe('zero groups', () => {
      let membersCallback: ((snap: any) => void) | undefined;

      beforeEach(() => {
        membersCallback = undefined;
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          (_query: any, onNext: any) => {
            membersCallback ??= onNext;
            return vi.fn();
          }
        );
      });

      it('redirects to Groups - invited-member linking is GroupsComponent\'s job on its own page load, not retried here', async () => {
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockRouter.navigateByUrl).toHaveBeenCalledWith(
          expect.stringContaining('groups')
        );
      });
    });
  });

  describe('group selection', () => {
    const userRef = { id: 'user-1' } as any;
    const user = { id: 'user-1', ref: userRef, defaultGroupRef: null } as any;
    let callbacks: ((snap: any) => Promise<void> | void)[];

    beforeEach(() => {
      service = createService();
      userSignal.set(user);
      callbacks = [];
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (_query: any, onNext: any) => {
          callbacks.push(onNext);
          return vi.fn();
        }
      );
    });

    /** Registers the listeners and delivers the user's active memberships. */
    async function listenAsMemberOf(...groupIds: string[]): Promise<void> {
      await service.getUserGroups(user);
      await callbacks[0]!(
        makeSnap(
          groupIds.map((id) => ({
            ref: { parent: { parent: { id } } },
            data: () => ({ active: true, groupAdmin: false, leftGroup: false }),
          }))
        )
      );
    }

    /** A groups-listener snapshot of active groups (the groups listener is the last one registered). */
    function deliverGroups(...groupIds: string[]): Promise<void> | void {
      return callbacks.at(-1)!(
        makeSnap(
          groupIds.map((id) => ({
            id,
            data: () => ({ name: `Group ${id}`, active: true, archived: false }),
            ref: groupRef(id),
          }))
        )
      );
    }

    it('does not reload, rewrite the default or restart listeners when a snapshot re-delivers the selected group', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(
        groupDocSnap('group-1')
      );
      await listenAsMemberOf('group-1');
      await deliverGroups('group-1');
      expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
      mockCategoryService.stopListening.mockClear();

      // e.g. the group was renamed, or another member joined it
      await deliverGroups('group-1');

      expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
      expect(mockCategoryService.getGroupCategories).toHaveBeenCalledTimes(1);
      expect(mockMemberService.getGroupMembers).toHaveBeenCalledTimes(1);
      expect(mockHistoryService.getHistoryForGroup).toHaveBeenCalledTimes(1);
      expect(mockCategoryService.stopListening).not.toHaveBeenCalled();
      // The fresh group data is still published, and the user's own member
      // record re-read (a change to it is one thing that fires this snapshot).
      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalledTimes(2);
      expect(mockMemberService.getMemberByUserRef).toHaveBeenCalledTimes(2);
    });

    it('fully loads a group restored from localStorage the first time a snapshot delivers it', async () => {
      currentGroupSignal.set({ id: 'group-1', ref: groupRef('group-1') });
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(
        groupDocSnap('group-1')
      );

      await listenAsMemberOf('group-1');
      await deliverGroups('group-1');

      expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
      expect(mockCategoryService.getGroupCategories).toHaveBeenCalledWith(
        'group-1'
      );
    });

    it('skips the defaultGroupRef write when it already points at the group', async () => {
      userSignal.set({ ...user, defaultGroupRef: groupRef('group-1') });
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(
        groupDocSnap('group-1')
      );

      await service.getGroup(groupRef('group-1'), userRef);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalled();
    });

    it('keeps a group the user picked while the default group was still loading', async () => {
      userSignal.set({ ...user, defaultGroupRef: groupRef('group-a') });
      const loads: Record<string, ReturnType<typeof deferred<any>>> = {
        'group-a': deferred(),
        'group-b': deferred(),
      };
      vi.spyOn(firestoreModule, 'getDoc').mockImplementation(
        (ref: any) => loads[ref.id]!.promise
      );

      await listenAsMemberOf('group-a', 'group-b');
      const autoSelect = deliverGroups('group-a', 'group-b');
      await vi.waitFor(() =>
        expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1)
      );

      const pick = service.getGroup(groupRef('group-b'), userRef);
      loads['group-b']!.resolve(groupDocSnap('group-b'));
      await pick;
      loads['group-a']!.resolve(groupDocSnap('group-a'));
      await autoSelect;

      expect(currentGroupSignal()?.id).toBe('group-b');
      expect(mockCategoryService.getGroupCategories).not.toHaveBeenCalledWith(
        'group-a'
      );
      expect(firestoreModule.setDoc).not.toHaveBeenCalledWith(
        userRef,
        { defaultGroupRef: expect.objectContaining({ id: 'group-a' }) },
        { merge: true }
      );
    });

    it("does not start a competing load when a snapshot arrives while the user's pick is loading", async () => {
      currentGroupSignal.set({ id: 'group-a', ref: groupRef('group-a') });
      const load = deferred<any>();
      vi.spyOn(firestoreModule, 'getDoc').mockReturnValue(load.promise);

      const pick = service.getGroup(groupRef('group-b'), userRef);
      await listenAsMemberOf('group-a', 'group-b');
      await deliverGroups('group-a', 'group-b');
      load.resolve(groupDocSnap('group-b'));
      await pick;

      expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
      expect(currentGroupSignal()?.id).toBe('group-b');
    });

    it("empties the previous group's data before showing a different group", async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockImplementation(async (ref: any) =>
        groupDocSnap(ref.id)
      );
      await service.getGroup(groupRef('group-a'), userRef);
      const categoryStore = TestBed.inject(CategoryStore);
      const memberStore = TestBed.inject(MemberStore);
      categoryStore.setGroupCategories([{ id: 'a-category' } as any]);
      memberStore.setGroupMembers([{ id: 'a-member' } as any]);
      memberStore.setCurrentMember({ id: 'a-me' } as any);
      mockCategoryService.stopListening.mockClear();

      let shownWith: any;
      mockGroupStore.setCurrentGroup.mockImplementationOnce((group: any) => {
        shownWith = {
          categories: categoryStore.groupCategories(),
          members: memberStore.groupMembers(),
          currentMember: memberStore.currentMember(),
          membersLoaded: memberStore.loaded(),
        };
        currentGroupSignal.set(group);
      });
      await service.getGroup(groupRef('group-b'), userRef);

      expect(shownWith).toEqual({
        categories: [],
        members: [],
        currentMember: null,
        membersLoaded: false,
      });
      expect(mockCategoryService.stopListening).toHaveBeenCalled();
      expect(mockCategoryService.getGroupCategories).toHaveBeenLastCalledWith(
        'group-b'
      );
    });

    it('keeps the loaded data when the same group is selected again', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(
        groupDocSnap('group-a')
      );
      await service.getGroup(groupRef('group-a'), userRef);
      TestBed.inject(CategoryStore).setGroupCategories([
        { id: 'a-category' } as any,
      ]);
      mockCategoryService.stopListening.mockClear();

      await service.getGroup(groupRef('group-a'), userRef);

      expect(TestBed.inject(CategoryStore).groupCategories()).toEqual([
        { id: 'a-category' },
      ]);
      expect(mockCategoryService.stopListening).not.toHaveBeenCalled();
    });
  });

  describe('deleteGroup', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should call the deleteGroup cloud function', async () => {
      const mockDeleteFn = vi
        .fn()
        .mockResolvedValue({ data: { success: true } });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        mockDeleteFn as any
      );

      await service.deleteGroup('group-1');

      expect(functionsModule.httpsCallable).toHaveBeenCalledWith(
        mockFunctions,
        'deleteGroup'
      );
      expect(mockDeleteFn).toHaveBeenCalledWith({ groupId: 'group-1' });
    });

    it('should throw when cloud function returns success: false', async () => {
      const mockDeleteFn = vi.fn().mockResolvedValue({
        data: { success: false, message: 'Permission denied' },
      });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        mockDeleteFn as any
      );

      await expect(service.deleteGroup('group-1')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should clear current group from store when deleting the active group', async () => {
      currentGroupSignal.set({ id: 'group-1' });
      const mockDeleteFn = vi
        .fn()
        .mockResolvedValue({ data: { success: true } });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        mockDeleteFn as any
      );

      await service.deleteGroup('group-1');

      expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalledWith(true);
    });

    it('should remove the group from the store', async () => {
      const mockDeleteFn = vi
        .fn()
        .mockResolvedValue({ data: { success: true } });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        mockDeleteFn as any
      );

      await service.deleteGroup('group-1');

      expect(mockGroupStore.removeGroup).toHaveBeenCalledWith('group-1');
    });
  });

  describe('getGroup', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should resolve gracefully when the group document does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => false,
      } as any);
      userSignal.set({ ref: { id: 'user-1' }, defaultGroupRef: null });

      await expect(
        service.getGroup({ id: 'ghost-group' } as any, { id: 'user-1' } as any)
      ).resolves.toBeUndefined();

      expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalledOnce();
      expect(localStorage.getItem('currentGroup')).toBeNull();
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Group Service',
        'getGroup',
        'Cleared stale default group reference',
        'Group with ID ghost-group not found'
      );
    });

    it('should null stale defaultGroupRef when the missing group was the user default', async () => {
      const ghostGroupRef = {
        id: 'ghost-group',
        eq: (other: any) => other?.id === 'ghost-group',
      } as any;
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => false,
      } as any);
      userSignal.set({ ref: { id: 'user-1' }, defaultGroupRef: ghostGroupRef });

      await service.getGroup(ghostGroupRef, { id: 'user-1' } as any);

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        { id: 'user-1' },
        { defaultGroupRef: null },
        { merge: true }
      );
      expect(mockUserStore.updateUser).toHaveBeenCalledWith({
        defaultGroupRef: null,
      });
    });

    it('should set current group in store when document exists', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'group-1',
        data: () => ({ name: 'My Group', active: true }),
        ref: mockDocRef,
      } as any);

      await service.getGroup({ id: 'group-1' } as any, {} as any);

      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalledOnce();
    });

    it('should save group to localStorage', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'group-1',
        data: () => ({ name: 'My Group', active: true }),
        ref: mockDocRef,
      } as any);

      await service.getGroup({ id: 'group-1' } as any, {} as any);

      expect(localStorage.getItem('currentGroup')).not.toBeNull();
    });

    it('should initialize all group-related services', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'group-1',
        data: () => ({ name: 'My Group', active: true }),
        ref: mockDocRef,
      } as any);

      await service.getGroup({ id: 'group-1' } as any, {} as any);

      expect(mockCategoryService.getGroupCategories).toHaveBeenCalled();
      expect(mockMemberService.getGroupMembers).toHaveBeenCalled();
      expect(mockSplitService.getUnpaidSplitsForGroup).toHaveBeenCalled();
      expect(
        mockMemorizedService.getMemorizedExpensesForGroup
      ).toHaveBeenCalled();
      expect(mockHistoryService.getHistoryForGroup).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should remove currentGroup from localStorage', () => {
      localStorage.setItem('currentGroup', '{}');

      service.logout();

      expect(localStorage.getItem('currentGroup')).toBeNull();
    });

    it('should clear all user groups from store', () => {
      service.logout();

      expect(mockGroupStore.clearAllUserGroups).toHaveBeenCalled();
    });

    it('should set loaded state to false', () => {
      service.logout();

      expect(mockGroupStore.setLoadedState).toHaveBeenCalledWith(false);
    });
  });
});
