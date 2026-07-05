import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';
import * as functionsModule from 'firebase/functions';
import { UserService } from './user.service';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemorizedStore } from '@store/memorized.store';
import { HistoryStore } from '@store/history.store';
import { SplitStore } from '@store/split.store';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from './group.service';
import { DemoModeService } from './demo-mode.service';

const mockFs = {};
const mockFunctions = {};
const mockAuth = {
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
};
const mockDocRef = { id: 'user-123' };

function makeUserSnap(exists: boolean, data?: any) {
  return {
    exists: () => exists,
    id: 'user-123',
    data: () => data ?? {},
    ref: mockDocRef,
  };
}

function makeSnap(docs: any[]) {
  return { size: docs.length, empty: docs.length === 0, docs };
}

async function getAuthStateCallback(
  service: UserService
): Promise<(user: any) => Promise<void>> {
  await (service as any).initializeAuth();
  return (mockAuth.onAuthStateChanged as any).mock.calls[0][0];
}

describe('UserService', () => {
  let service: UserService;

  const userSignal = signal<any>(null);
  const isDemoModeSignal = signal<boolean>(false);
  const mockUserStore = {
    user: userSignal,
    isLoggedIn: () => !!userSignal(),
    isDemoMode: isDemoModeSignal,
    setUser: vi.fn(),
    clearUser: vi.fn(),
    updateUser: vi.fn(),
    setIsDemoMode: vi.fn(),
    setIsGoogleUser: vi.fn(),
    setIsEmailConfirmed: vi.fn(),
  };
  const mockSnackBar = { openFromComponent: vi.fn() };
  const mockGroupStore = {
    clearAllUserGroups: vi.fn(),
    currentGroup: signal<any>(null),
    allUserGroups: signal<any[]>([]),
  };
  const mockMemberStore = {
    clearGroupMembers: vi.fn(),
    groupMembers: signal<any[]>([]),
  };
  const mockCategoryStore = {
    clearGroupCategories: vi.fn(),
    groupCategories: signal<any[]>([]),
  };
  const mockExpenseStore = {
    clearGroupExpenses: vi.fn(),
    groupExpenses: signal<any[]>([]),
  };
  const mockMemorizedStore = {
    clearMemorizedExpenses: vi.fn(),
    memorizedExpenses: signal<any[]>([]),
  };
  const mockHistoryStore = {
    clearHistory: vi.fn(),
    groupHistory: signal<any[]>([]),
  };
  const mockSplitStore = {
    clearSplits: vi.fn(),
    unpaidSplits: signal<any[]>([]),
  };
  const mockGroupService = {
    getUserGroups: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  };
  const mockDemoModeService = { initializeDemoData: vi.fn() };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };
  const mockRouter = { navigate: vi.fn(), url: '/' };

  function createService(): UserService {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: authModule.getAuth, useValue: mockAuth },
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
        { provide: Router, useValue: mockRouter },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MemorizedStore, useValue: mockMemorizedStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: SplitStore, useValue: mockSplitStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: DemoModeService, useValue: mockDemoModeService },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    const svc = TestBed.inject(UserService);
    (svc as any).router = mockRouter;
    return svc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(firestoreModule, 'doc').mockReturnValue(mockDocRef as any);
    vi.spyOn(firestoreModule, 'query').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'collectionGroup').mockReturnValue({} as any);
    vi.spyOn(authModule, 'setPersistence').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => false,
    } as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap([]) as any);
    vi.spyOn(firestoreModule, 'setDoc').mockResolvedValue(undefined as any);
    vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined as any);
    mockAuth.onAuthStateChanged.mockImplementation(() => {});
    (mockAuth as any).currentUser = null;
    userSignal.set(null);
    isDemoModeSignal.set(false);
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserDetails', () => {
    it('should return a User when the document exists', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'alice@test.com' }) as any
      );

      const user = await service.getUserDetails('user-123');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('user-123');
    });

    it('should return null when the document does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );

      const user = await service.getUserDetails('user-123');

      expect(user).toBeNull();
    });

    it('should rethrow errors', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
        new Error('Firestore error')
      );

      await expect(service.getUserDetails('user-123')).rejects.toThrow(
        'Firestore error'
      );
    });
  });

  describe('createUserIfNotExists', () => {
    it('should return existing user when one already exists', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'alice@test.com' }) as any
      );

      const user = await service.createUserIfNotExists(
        'user-123',
        'alice@test.com'
      );

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(user.email).toBe('alice@test.com');
    });

    it('should update email if existing user has a different email', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );

      await service.createUserIfNotExists('user-123', 'new@test.com');

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'new@test.com' },
        { merge: true }
      );
    });

    it('should create a new user document with default data when user does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.createUserIfNotExists('new-user', 'new@test.com');

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          email: 'new@test.com',
          defaultGroupRef: null,
          receiptPolicy: false,
          venmoId: '',
          paypalId: '',
          cashAppId: '',
          zelleId: '',
        })
      );
    });

    it('should link unlinked member records to the new user', async () => {
      const memberRef1 = { id: 'm1' };
      const memberRef2 = { id: 'm2' };
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([{ ref: memberRef1 }, { ref: memberRef2 }]) as any
      );

      await service.createUserIfNotExists('new-user', 'alice@test.com');

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(2);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(memberRef1, {
        userRef: mockDocRef,
      });
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(memberRef2, {
        userRef: mockDocRef,
      });
    });

    it('should not link members when none exist with the email', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.createUserIfNotExists('new-user', 'alice@test.com');

      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentMethods', () => {
    const memberRef = { id: 'member-1' } as any;

    it('should return empty object when member document does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => false,
      } as any);

      const result = await service.getPaymentMethods(memberRef);

      expect(result).toEqual({});
    });

    it('should return empty object when member has no userRef', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ userRef: null }),
      } as any);

      const result = await service.getPaymentMethods(memberRef);

      expect(result).toEqual({});
    });

    it('should return payment methods from user document', async () => {
      const userRef = { id: 'user-1' };
      vi.spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ userRef }),
        } as any)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            venmoId: '@alice',
            paypalId: 'alice@pp.com',
            cashAppId: '',
            zelleId: '',
          }),
        } as any);

      const result = (await service.getPaymentMethods(memberRef)) as any;

      expect(result.venmoId).toBe('@alice');
      expect(result.paypalId).toBe('alice@pp.com');
    });

    it('should return empty object when user document does not exist', async () => {
      const userRef = { id: 'user-1' };
      vi.spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ userRef }),
        } as any)
        .mockResolvedValueOnce({ exists: () => false } as any);

      const result = await service.getPaymentMethods(memberRef);

      expect(result).toEqual({});
    });
  });

  describe('updateUser', () => {
    it('should update user document using auth uid even when userStore.user() is null', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };

      await service.updateUser({ email: 'updated@test.com' });

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'updated@test.com' },
        { merge: true }
      );
      expect(mockUserStore.updateUser).toHaveBeenCalledWith({
        email: 'updated@test.com',
      });
    });

    it('should throw and log error when no authenticated user', async () => {
      (mockAuth as any).currentUser = null;

      await expect(
        service.updateUser({ email: 'updated@test.com' })
      ).rejects.toThrow('Your session has expired. Please sign in again.');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'User Service',
        'updateUser',
        'Failed to update user',
        'Your session has expired. Please sign in again.'
      );
    });

    it('should clear the store, show a snackbar, and redirect to login when no authenticated user', async () => {
      (mockAuth as any).currentUser = null;

      await expect(
        service.updateUser({ email: 'updated@test.com' })
      ).rejects.toThrow();

      expect(mockGroupService.logout).toHaveBeenCalled();
      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('updateUserEmailAndLinkMembers', () => {
    it('should update email using auth uid when userStore.user() is null (regression: email verification race)', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'new@test.com' },
        { merge: true }
      );
      expect(mockUserStore.updateUser).toHaveBeenCalledWith({
        email: 'new@test.com',
      });
    });

    it('should link unlinked member records after updating email', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };
      const memberRef1 = { id: 'm1' };
      const memberRef2 = { id: 'm2' };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([{ ref: memberRef1 }, { ref: memberRef2 }]) as any
      );

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(2);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(memberRef1, {
        userRef: mockDocRef,
      });
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(memberRef2, {
        userRef: mockDocRef,
      });
    });

    it('should throw when no authenticated user', async () => {
      (mockAuth as any).currentUser = null;

      await expect(
        service.updateUserEmailAndLinkMembers('new@test.com')
      ).rejects.toThrow('Your session has expired. Please sign in again.');
    });
  });

  describe('logout', () => {
    it('should sign out and clear user store', async () => {
      await service.logout();

      expect(mockAuth.signOut).toHaveBeenCalled();
      expect(mockUserStore.clearUser).toHaveBeenCalled();
    });

    it('should navigate to home by default', async () => {
      await service.logout();

      expect(mockRouter.navigate).toHaveBeenCalled();
    });

    it('should not navigate when redirect is false', async () => {
      await service.logout(false);

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should call groupService.logout', async () => {
      await service.logout();

      expect(mockGroupService.logout).toHaveBeenCalled();
    });
  });

  describe('involuntary session loss', () => {
    it('clears the store, shows a snackbar, and redirects to login when the session is lost while logged in', async () => {
      userSignal.set({ id: 'user-123' });
      const callback = await getAuthStateCallback(service);

      await callback(null);

      expect(mockGroupService.logout).toHaveBeenCalled();
      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('does not treat an intentional logout() as a session loss', async () => {
      userSignal.set({ id: 'user-123' });
      const callback = await getAuthStateCallback(service);

      await service.logout();
      mockGroupService.logout.mockClear();
      mockUserStore.clearUser.mockClear();
      mockRouter.navigate.mockClear();
      userSignal.set(null);

      await callback(null);

      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/auth/login']);
    });

    it('does not trigger session-expired handling in demo mode', async () => {
      userSignal.set({ id: 'user-123' });
      isDemoModeSignal.set(true);
      const callback = await getAuthStateCallback(service);

      await callback(null);

      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/auth/login']);
    });

    it('does not fire on initial load when no user was ever logged in', async () => {
      userSignal.set(null);
      const callback = await getAuthStateCallback(service);

      await callback(null);

      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/auth/login']);
    });
  });
});
