import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import * as firestoreModule from 'firebase/firestore';
import * as functionsModule from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryService } from './category.service';
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
  const mockCategoryService = { getGroupCategories: vi.fn() };
  const mockMemberService = {
    getGroupMembers: vi.fn(),
    getMemberByUserRef: vi.fn().mockResolvedValue(undefined),
  };
  const mockSplitService = { getUnpaidSplitsForGroup: vi.fn() };
  const mockMemorizedService = { getMemorizedExpensesForGroup: vi.fn() };
  const mockHistoryService = { getHistoryForGroup: vi.fn() };
  const mockLoading = { loadingOff: vi.fn() };
  const mockRouter = {
    url: '/',
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

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
  });

  describe('addGroup', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should create group, member, and default category in a batch', async () => {
      const result = await service.addGroup(
        { name: 'New Group' },
        { displayName: 'Alice' }
      );

      expect(mockBatch.set).toHaveBeenCalledTimes(3); // group + member + default category
      expect(result).toBe(mockDocRef);
    });

    it('should always create a category named "Default"', async () => {
      await service.addGroup({ name: 'New Group' }, { displayName: 'Alice' });

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
      const mockDeleteFn = vi
        .fn()
        .mockResolvedValue({
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

    it('should throw when the group document does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => false,
      } as any);

      await expect(
        service.getGroup({ id: 'ghost-group' } as any, {} as any)
      ).rejects.toThrow('Group with ID ghost-group not found');
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
