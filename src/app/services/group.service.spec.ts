import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { MemberLinkService } from '@services/member-link.service';
import { GroupStore } from '@store/group.store';
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
    setCurrentGroup: vi.fn(),
    clearCurrentGroup: vi.fn(),
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
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };
  const mockExpenseService = { doesGroupHaveExpenses: vi.fn().mockResolvedValue(false) };
  const mockMemberLinkService = {
    linkInvitedMembers: vi.fn().mockResolvedValue(0),
  };

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
        { provide: MemberLinkService, useValue: mockMemberLinkService },
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

    mockMemberLinkService.linkInvitedMembers.mockResolvedValue(0);

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

    it('should create group, member, and default category in a batch', async () => {
      const result = await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice', userRef: { id: 'user-1' } as any }
      );

      expect(mockBatch.set).toHaveBeenCalledTimes(3); // group + member + default category
      expect(result).toBe(mockDocRef);
    });

    it('should set memberUids to the creator on the group doc', async () => {
      await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice', userRef: { id: 'user-1' } as any }
      );

      const groupSetCall = mockBatch.set.mock.calls.find(
        (call: any[]) => call[1]?.name === 'New Group'
      );
      expect(groupSetCall![1]).toMatchObject({ memberUids: ['user-1'] });
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
    });

    describe('zero-groups self-heal (App Check token race recovery)', () => {
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

      it('retries linking invited members before redirecting', async () => {
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledWith(
          'alice@test.com'
        );
      });

      it('does not redirect when the retry links a member', async () => {
        mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(1);
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
      });

      it('redirects when the retry finds nothing to link', async () => {
        mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(0);
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockRouter.navigateByUrl).toHaveBeenCalled();
      });

      it('redirects when the retry is skipped (no App Check token)', async () => {
        mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(null);
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockRouter.navigateByUrl).toHaveBeenCalled();
      });

      it('only retries once even if the listener fires repeatedly with zero groups', async () => {
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));
        await membersCallback!(makeSnap([]));
        await membersCallback!(makeSnap([]));

        expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledTimes(
          1
        );
      });

      it('skips the retry when the user has no email', async () => {
        const user = { id: 'user-1', ref: { id: 'user-1' } } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockMemberLinkService.linkInvitedMembers).not.toHaveBeenCalled();
        expect(mockRouter.navigateByUrl).toHaveBeenCalled();
      });

      it('allows a fresh retry after logout resets the attempt flag', async () => {
        const user = {
          id: 'user-1',
          ref: { id: 'user-1' },
          email: 'alice@test.com',
        } as any;

        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));
        service.logout();

        membersCallback = undefined;
        await service.getUserGroups(user);
        await membersCallback!(makeSnap([]));

        expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledTimes(
          2
        );
      });
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
