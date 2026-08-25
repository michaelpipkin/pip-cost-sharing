import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { FirebaseError } from 'firebase/app';
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
import { MemberLinkService } from '@services/member-link.service';
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
    initUser: vi.fn(),
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
  const mockMemberLinkService = {
    linkInvitedMembers: vi.fn().mockResolvedValue(0),
  };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };
  const mockRouter = { navigate: vi.fn(), url: '/' };
  const mockLoadingService = { loadingOn: vi.fn(), loadingOff: vi.fn() };

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
        { provide: MemberLinkService, useValue: mockMemberLinkService },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: LoadingService, useValue: mockLoadingService },
      ],
    });
    const svc = TestBed.inject(UserService);
    (svc as any).router = mockRouter;
    return svc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(firestoreModule, 'doc').mockReturnValue(mockDocRef as any);
    vi.spyOn(authModule, 'setPersistence').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => false,
    } as any);
    vi.spyOn(firestoreModule, 'setDoc').mockResolvedValue(undefined as any);
    // Default: the createUserProfileOnSignUp Cloud Function trigger has
    // already created the doc by the time waitForServerCreatedUser()
    // starts listening - the common case post-fix. Tests exercising the
    // fallback-to-client-creation path override this per-test.
    vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
      ((_ref: any, onNext: any) => {
        onNext(makeUserSnap(true, { email: 'alice@test.com' }));
        return vi.fn();
      }) as any
    );
    mockMemberLinkService.linkInvitedMembers.mockResolvedValue(0);
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

    it('should not attempt to link invited members at signup - GroupsComponent handles it on page load instead', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );

      await service.createUserIfNotExists('new-user', 'alice@test.com');

      expect(mockMemberLinkService.linkInvitedMembers).not.toHaveBeenCalled();
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

    it('should ask the server to link unlinked member records after updating email', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(2);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledWith(
        'new@test.com'
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'email_verified_members_linked',
        { email: 'new@test.com', membersLinked: 2 }
      );
    });

    it('should log the event with a zero count when nothing was unlinked', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(0);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'email_verified_members_linked',
        { email: 'new@test.com', membersLinked: 0 }
      );
    });

    it('should not log an analytics event when linking was skipped (no App Check token)', async () => {
      (mockAuth as any).currentUser = { uid: 'user-123' };
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(null);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith(
        'email_verified_members_linked',
        expect.anything()
      );
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

  describe('initializeAuth persistence failure', () => {
    it('still registers the auth state listener when setPersistence rejects', async () => {
      vi.spyOn(authModule, 'setPersistence').mockRejectedValueOnce(
        new Error('Database is closing/hidden')
      );

      await (service as any).initializeAuth();

      expect(mockAuth.onAuthStateChanged).toHaveBeenCalled();
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'User Service',
        'initializeAuth',
        'Failed to set auth persistence',
        'Database is closing/hidden'
      );
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

  describe('initializeAuth failure handling', () => {
    const firebaseUser = {
      uid: 'user-123',
      email: 'alice@test.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    };

    it('clears the loading overlay and explains an App Check rejection specifically', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
        new FirebaseError('permission-denied', 'Missing or insufficient permissions.')
      );
      const callback = await getAuthStateCallback(service);

      await callback(firebaseUser as any);

      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      expect(mockGroupService.getUserGroups).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message: expect.stringContaining("couldn't verify your device"),
          },
        }
      );
    });

    it('clears the loading overlay with a generic message for other failures', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
        new Error('network error')
      );
      const callback = await getAuthStateCallback(service);

      await callback(firebaseUser as any);

      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message: 'Something went wrong loading your account. Please try again.',
          },
        }
      );
    });

    it('does not show the App Check message for a permission-denied error from an unrelated cause', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
        new Error('permission-denied-ish but not a FirebaseError')
      );
      const callback = await getAuthStateCallback(service);

      await callback(firebaseUser as any);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message: 'Something went wrong loading your account. Please try again.',
          },
        }
      );
    });

    describe('transient Firestore error retry', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('retries an "unavailable" error and succeeds silently, without showing any message', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
          new FirebaseError('unavailable', 'The service is currently unavailable.')
        );
        const callback = await getAuthStateCallback(service);

        const resultPromise = callback(firebaseUser as any);
        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(firestoreModule.getDoc).toHaveBeenCalledTimes(2);
        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
        expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      });

      it('also retries a "deadline-exceeded" error', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
          new FirebaseError('deadline-exceeded', 'Deadline exceeded.')
        );
        const callback = await getAuthStateCallback(service);

        const resultPromise = callback(firebaseUser as any);
        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
        expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      });

      it('gives up after the max attempts and shows the generic message', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValue(
          new FirebaseError('unavailable', 'The service is currently unavailable.')
        );
        const callback = await getAuthStateCallback(service);

        const resultPromise = callback(firebaseUser as any);
        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(firestoreModule.getDoc).toHaveBeenCalledTimes(3);
        expect(mockLoadingService.loadingOff).toHaveBeenCalled();
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          expect.anything(),
          {
            data: {
              message: 'Something went wrong loading your account. Please try again.',
            },
          }
        );
      });

      it('does not retry a permission-denied error', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValue(
          new FirebaseError('permission-denied', 'Missing or insufficient permissions.')
        );
        const callback = await getAuthStateCallback(service);

        await callback(firebaseUser as any);

        expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('server-created user profile (new account sign-up)', () => {
    const firebaseUser = {
      uid: 'user-123',
      email: 'alice@test.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    };

    it('uses the doc createUserProfileOnSignUp already created, without writing anything client-side', async () => {
      // beforeEach's default getDoc mock (exists: false) plus its default
      // onSnapshot mock (fires synchronously with an existing doc) together
      // simulate the trigger having already completed by the time the
      // client checks.
      const callback = await getAuthStateCallback(service);

      await callback(firebaseUser as any);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockUserStore.initUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-123', email: 'alice@test.com' }),
        false,
        true
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();
    });

    it('falls back to client-side creation when the server trigger does not complete in time', async () => {
      vi.useFakeTimers();
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (() => vi.fn()) as any
      );

      const callback = await getAuthStateCallback(service);
      const resultPromise = callback(firebaseUser as any);
      await vi.advanceTimersByTimeAsync(8000);
      await resultPromise;

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({ email: 'alice@test.com' })
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('syncs the email field for an existing user without waiting on the server trigger', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );
      const onSnapshotSpy = vi.spyOn(firestoreModule, 'onSnapshot');

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser as any);

      expect(onSnapshotSpy).not.toHaveBeenCalled();
      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'alice@test.com' },
        { merge: true }
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();
    });
  });
});
