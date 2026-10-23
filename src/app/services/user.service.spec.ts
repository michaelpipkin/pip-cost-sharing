import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { FirebaseError } from 'firebase/app';
import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';
import * as appCheckModule from 'firebase/app-check';
import * as functionsModule from 'firebase/functions';
import { initAppCheck, resetAppCheckForTesting } from '../app-check';
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
  const mockUserStore = {
    user: userSignal,
    isLoggedIn: () => !!userSignal(),
    clearUser: vi.fn(),
    updateUser: vi.fn(),
    initUser: vi.fn(),
    setIsGoogleUser: vi.fn(),
    setIsEmailConfirmed: vi.fn(),
    setGroupEmailPrompt: vi.fn(),
  };
  const mockSnackBar = { openFromComponent: vi.fn() };
  const mockDialog = { open: vi.fn() };
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
  const mockMemberLinkService = {
    linkInvitedMembers: vi.fn().mockResolvedValue(0),
  };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
    logAppCheckStatus: vi.fn().mockResolvedValue(undefined),
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
        { provide: MatDialog, useValue: mockDialog },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MemorizedStore, useValue: mockMemorizedStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: SplitStore, useValue: mockSplitStore },
        { provide: GroupService, useValue: mockGroupService },
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
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // A test that fails while it has fake timers on must not leave them for the
    // next spec (all unit specs share one jsdom context).
    vi.useRealTimers();
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
    it('should return existing user when one already exists, writing nothing', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'alice@test.com' }) as any
      );

      const user = await service.createUserIfNotExists('user-123');

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(user.email).toBe('alice@test.com');
    });

    it("should create a new user document with default data and an empty email (the caller stores a verified address)", async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );

      await service.createUserIfNotExists('new-user');

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(mockDocRef, {
        email: '',
        defaultGroupRef: null,
        receiptPolicy: false,
        emailOptOut: false,
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      });
    });

    it('should not attempt to link invited members at signup - GroupsComponent handles it on page load instead', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(false) as any
      );

      await service.createUserIfNotExists('new-user');

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
    const getIdToken = vi.fn();

    beforeEach(() => {
      getIdToken.mockResolvedValue('fresh-token');
      (mockAuth as any).currentUser = { uid: 'user-123', getIdToken };
    });

    it('should update email using auth uid when userStore.user() is null (regression: email verification race)', async () => {

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
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(2);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledWith();
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'email_verified_members_linked',
        { email: 'new@test.com', membersLinked: 2 }
      );
    });

    it('should log the event with a zero count when nothing was unlinked', async () => {
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(0);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'email_verified_members_linked',
        { email: 'new@test.com', membersLinked: 0 }
      );
    });

    it('should not log an analytics event when linking was skipped (no App Check token)', async () => {
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(null);

      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith(
        'email_verified_members_linked',
        expect.anything()
      );
    });

    it('should refresh the ID token before writing the email or linking, so both see the verified address', async () => {
      await service.updateUserEmailAndLinkMembers('new@test.com');

      expect(getIdToken).toHaveBeenCalledWith(true);
      const refreshed = getIdToken.mock.invocationCallOrder[0]!;
      expect(refreshed).toBeLessThan(
        vi.mocked(firestoreModule.setDoc).mock.invocationCallOrder[0]!
      );
      expect(refreshed).toBeLessThan(
        mockMemberLinkService.linkInvitedMembers.mock.invocationCallOrder[0]!
      );
    });

    it('skips the profile write for an address that is not one valid address (the rules would refuse it), still linking', async () => {
      await service.updateUserEmailAndLinkMembers('alice@my_domain.com');

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockUserStore.updateUser).not.toHaveBeenCalled();
      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledWith();
    });

    // I1: the old address comes from users/{uid} on the server, not from the
    // in-memory store, which the cold-loaded action page can reach before the
    // session start has filled it.
    describe('group email update offer (signed-in link path)', () => {
      const profileHas = (email: string | null) =>
        vi
          .spyOn(firestoreModule, 'getDoc')
          .mockResolvedValue(
            (email === null
              ? { exists: () => false }
              : makeUserSnap(true, { email })) as any
          );

      it('records the old and new address when the profile email changes, even with the store still empty', async () => {
        userSignal.set(null);
        profileHas('old@test.com');

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(1);
        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledWith({
          uid: 'user-123',
          oldEmail: 'old@test.com',
          newEmail: 'new@test.com',
        });
      });

      it('reads the old address before writing the new one', async () => {
        profileHas('old@test.com');

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(
          vi.mocked(firestoreModule.getDoc).mock.invocationCallOrder[0]!
        ).toBeLessThan(
          vi.mocked(firestoreModule.setDoc).mock.invocationCallOrder[0]!
        );
      });

      it('ignores a stale store: the stored profile decides', async () => {
        userSignal.set({ id: 'user-123', email: 'new@test.com' });
        profileHas('old@test.com');

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(1);
      });

      it.each([
        ['a blank old email', ''],
        ['an unchanged email', 'new@test.com'],
        ['a case-only change', 'New@Test.com'],
      ])('does not offer for %s', async (_label, oldEmail) => {
        profileHas(oldEmail);

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('does not offer when there is no stored profile yet', async () => {
        profileHas(null);

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('still writes the profile and links when the old address cannot be read', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValue(
          new Error('offline')
        );

        await service.updateUserEmailAndLinkMembers('new@test.com');

        expect(firestoreModule.setDoc).toHaveBeenCalled();
        expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalled();
        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('does not offer for an address the profile will not store', async () => {
        profileHas('old@test.com');

        await service.updateUserEmailAndLinkMembers('alice@my_domain.com');

        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('ignores a repeat of the same change, but offers a different one', async () => {
        profileHas('old@test.com');
        await service.updateUserEmailAndLinkMembers('new@test.com');
        await service.updateUserEmailAndLinkMembers('new@test.com');
        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(1);

        profileHas('new@test.com');
        await service.updateUserEmailAndLinkMembers('newer@test.com');
        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(2);
        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenLastCalledWith({
          uid: 'user-123',
          oldEmail: 'new@test.com',
          newEmail: 'newer@test.com',
        });
      });
    });

    it('should throw when no authenticated user', async () => {
      (mockAuth as any).currentUser = null;

      await expect(
        service.updateUserEmailAndLinkMembers('new@test.com')
      ).rejects.toThrow('Your session has expired. Please sign in again.');
    });
  });

  describe('group emails (server-built callables)', () => {
    const groupId = 'g-trip';
    const patRef = { id: 'm-pat' } as any;
    const owenRef = { id: 'm-owen' } as any;
    const ivoRef = { id: 'm-ivo' } as any;

    /** The server's daily group-mail refusal (functions/src/mail-allowance.ts). */
    const limitRefusal = () =>
      Object.assign(
        new Error(
          "This would go over today's limit for group emails. Try again tomorrow. [429]"
        ),
        { code: 'functions/resource-exhausted' }
      );
    const transfersOf = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        owedByMemberRef: { id: `m-${i}` } as any,
        owedToMemberRef: owenRef,
        amount: i + 1,
      }));

    function mockCallable(data: unknown) {
      const callable = vi.fn().mockResolvedValue({ data });
      const httpsCallableSpy = vi
        .spyOn(functionsModule, 'httpsCallable')
        .mockReturnValue(callable as any);
      return { callable, httpsCallableSpy };
    }

    describe('sendPaymentRequestEmail', () => {
      it('sends only the group id, member ids and the numeric amount to sendPaymentRequests', async () => {
        const { callable, httpsCallableSpy } = mockCallable({
          results: ['sent'],
        });

        await service.sendPaymentRequestEmail(groupId, patRef, owenRef, 12.5);

        expect(httpsCallableSpy).toHaveBeenCalledWith(
          mockFunctions,
          'sendPaymentRequests'
        );
        expect(callable).toHaveBeenCalledWith({
          groupId,
          requests: [
            { owedByMemberId: 'm-pat', owedToMemberId: 'm-owen', amount: 12.5 },
          ],
        });
      });

      it.each(['sent', 'not_registered', 'opted_out'] as const)(
        'returns the server result %s',
        async (result) => {
          mockCallable({ results: [result] });

          await expect(
            service.sendPaymentRequestEmail(groupId, patRef, owenRef, 5)
          ).resolves.toBe(result);
        }
      );

      it('rejects when the callable fails, so Summary shows its error', async () => {
        const callable = vi.fn().mockRejectedValue(new Error('denied'));
        vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
          callable as any
        );

        await expect(
          service.sendPaymentRequestEmail(groupId, patRef, owenRef, 5)
        ).rejects.toThrow('denied');
      });
    });

    describe('sendGroupPaymentRequestEmails', () => {
      it('sends every transfer in one sendPaymentRequests call and counts the results', async () => {
        const { callable, httpsCallableSpy } = mockCallable({
          results: ['sent', 'not_registered', 'sent', 'opted_out'],
        });

        const result = await service.sendGroupPaymentRequestEmails(groupId, [
          { owedByMemberRef: patRef, owedToMemberRef: owenRef, amount: 1 },
          { owedByMemberRef: ivoRef, owedToMemberRef: owenRef, amount: 2 },
          { owedByMemberRef: owenRef, owedToMemberRef: patRef, amount: 3 },
          { owedByMemberRef: ivoRef, owedToMemberRef: patRef, amount: 4 },
        ]);

        expect(result).toEqual({ sent: 2, skipped: 2, limitReached: false });
        expect(httpsCallableSpy).toHaveBeenCalledWith(
          mockFunctions,
          'sendPaymentRequests'
        );
        expect(callable).toHaveBeenCalledWith({
          groupId,
          requests: [
            { owedByMemberId: 'm-pat', owedToMemberId: 'm-owen', amount: 1 },
            { owedByMemberId: 'm-ivo', owedToMemberId: 'm-owen', amount: 2 },
            { owedByMemberId: 'm-owen', owedToMemberId: 'm-pat', amount: 3 },
            { owedByMemberId: 'm-ivo', owedToMemberId: 'm-pat', amount: 4 },
          ],
        });
      });

      it('splits a settlement of more than 25 transfers into calls of at most 25 (the server cap), in order', async () => {
        const { callable } = mockCallable(undefined);
        callable
          .mockResolvedValueOnce({
            data: { results: Array.from({ length: 25 }, () => 'sent') },
          })
          .mockResolvedValueOnce({
            data: { results: ['sent', 'opted_out', 'sent'] },
          });
        const transfers = Array.from({ length: 28 }, (_, i) => ({
          owedByMemberRef: { id: `m-${i}` } as any,
          owedToMemberRef: owenRef,
          amount: i + 1,
        }));

        const result = await service.sendGroupPaymentRequestEmails(
          groupId,
          transfers
        );

        expect(result).toEqual({ sent: 27, skipped: 1, limitReached: false });
        expect(callable).toHaveBeenCalledTimes(2);
        const sentIds = callable.mock.calls.map(([data]: any[]) =>
          data.requests.map((r: any) => r.owedByMemberId)
        );
        expect(sentIds[0]).toHaveLength(25);
        expect(sentIds.flat()).toEqual(transfers.map((t) => t.owedByMemberRef.id));
      });

      it('makes no call for an empty settlement', async () => {
        const { httpsCallableSpy } = mockCallable({ results: [] });

        await expect(
          service.sendGroupPaymentRequestEmails(groupId, [])
        ).resolves.toEqual({ sent: 0, skipped: 0, limitReached: false });
        expect(httpsCallableSpy).not.toHaveBeenCalled();
      });

      // The batches go out one after another, so what was sent
      // before a daily-limit refusal is a known prefix the app can report.
      it('sends the batches one after another, not at once', async () => {
        const { callable } = mockCallable(undefined);
        let finishFirst!: (value: unknown) => void;
        callable
          .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
          .mockResolvedValueOnce({ data: { results: ['sent'] } });

        const pending = service.sendGroupPaymentRequestEmails(
          groupId,
          transfersOf(26)
        );
        await Promise.resolve();
        expect(callable).toHaveBeenCalledTimes(1);

        finishFirst({ data: { results: Array(25).fill('sent') } });
        await expect(pending).resolves.toEqual({
          sent: 26,
          skipped: 0,
          limitReached: false,
        });
        expect(callable).toHaveBeenCalledTimes(2);
      });

      it('reports what was sent when a later batch reaches the daily limit', async () => {
        const { callable } = mockCallable(undefined);
        callable
          .mockResolvedValueOnce({
            data: { results: [...Array(24).fill('sent'), 'opted_out'] },
          })
          .mockRejectedValueOnce(limitRefusal())
          .mockResolvedValueOnce({ data: { results: ['sent'] } });

        await expect(
          service.sendGroupPaymentRequestEmails(groupId, transfersOf(60))
        ).resolves.toEqual({ sent: 24, skipped: 1, limitReached: true });
        // Nothing after the refused batch is tried.
        expect(callable).toHaveBeenCalledTimes(2);
      });

      it('rejects when the first batch is refused, or a later one fails otherwise', async () => {
        const { callable } = mockCallable(undefined);
        callable.mockRejectedValueOnce(limitRefusal());
        await expect(
          service.sendGroupPaymentRequestEmails(groupId, transfersOf(30))
        ).rejects.toMatchObject({ code: 'functions/resource-exhausted' });

        callable
          .mockResolvedValueOnce({ data: { results: Array(25).fill('sent') } })
          .mockRejectedValueOnce(new Error('internal'));
        await expect(
          service.sendGroupPaymentRequestEmails(groupId, transfersOf(30))
        ).rejects.toThrow('internal');
      });
    });

    describe('sendMemberPaymentUnpayEmails', () => {
      it('sends the member ids, amount and split count to sendPaymentReversalEmails', async () => {
        const { callable, httpsCallableSpy } = mockCallable({ sent: 2 });

        await service.sendMemberPaymentUnpayEmails(
          groupId,
          ivoRef,
          owenRef,
          30,
          3
        );

        expect(httpsCallableSpy).toHaveBeenCalledWith(
          mockFunctions,
          'sendPaymentReversalEmails'
        );
        expect(callable).toHaveBeenCalledWith({
          groupId,
          paidByMemberId: 'm-ivo',
          paidToMemberId: 'm-owen',
          amount: 30,
          splitCount: 3,
        });
      });
    });

    describe('sendGroupSettleUnpayEmails', () => {
      it('sends the member ids and the local settle date as YYYY-MM-DD to sendSettleReversalEmails', async () => {
        const { callable, httpsCallableSpy } = mockCallable({ sent: 2 });

        await service.sendGroupSettleUnpayEmails(
          groupId,
          [ivoRef, owenRef],
          new Date(2026, 0, 5, 23, 30)
        );

        expect(httpsCallableSpy).toHaveBeenCalledWith(
          mockFunctions,
          'sendSettleReversalEmails'
        );
        expect(callable).toHaveBeenCalledWith({
          groupId,
          memberIds: ['m-ivo', 'm-owen'],
          settleDate: '2026-01-05',
        });
      });

      it('splits more than 25 members into calls of at most 25 (the server cap), adding up what was sent', async () => {
        const { callable } = mockCallable({ sent: 1 });
        const refs = Array.from({ length: 30 }, (_, i) => ({ id: `m-${i}` }) as any);

        await expect(
          service.sendGroupSettleUnpayEmails(groupId, refs, new Date(2026, 0, 5))
        ).resolves.toEqual({ sent: 2, limitReached: false });

        expect(callable).toHaveBeenCalledTimes(2);
        expect(callable).toHaveBeenNthCalledWith(1, {
          groupId,
          memberIds: refs.slice(0, 25).map((r) => r.id),
          settleDate: '2026-01-05',
        });
        expect(callable).toHaveBeenNthCalledWith(2, {
          groupId,
          memberIds: refs.slice(25).map((r) => r.id),
          settleDate: '2026-01-05',
        });
      });

      it('makes no call when there is no one to notify', async () => {
        const { httpsCallableSpy } = mockCallable({ sent: 0 });

        await expect(
          service.sendGroupSettleUnpayEmails(groupId, [], new Date())
        ).resolves.toEqual({ sent: 0, limitReached: false });

        expect(httpsCallableSpy).not.toHaveBeenCalled();
      });

      // One batch after another, reporting a known prefix.
      it('reports what was sent when a later batch reaches the daily limit', async () => {
        const { callable } = mockCallable(undefined);
        let finishFirst!: (value: unknown) => void;
        callable
          .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
          .mockRejectedValueOnce(limitRefusal());
        const refs = Array.from({ length: 60 }, (_, i) => ({ id: `m-${i}` }) as any);

        const pending = service.sendGroupSettleUnpayEmails(
          groupId,
          refs,
          new Date(2026, 0, 5)
        );
        await Promise.resolve();
        expect(callable).toHaveBeenCalledTimes(1);
        finishFirst({ data: { sent: 20 } });

        await expect(pending).resolves.toEqual({ sent: 20, limitReached: true });
        expect(callable).toHaveBeenCalledTimes(2);
      });

      it('rejects when the first batch is refused', async () => {
        const { callable } = mockCallable(undefined);
        callable.mockRejectedValueOnce(limitRefusal());

        await expect(
          service.sendGroupSettleUnpayEmails(
            groupId,
            [ivoRef, owenRef],
            new Date(2026, 0, 5)
          )
        ).rejects.toMatchObject({ code: 'functions/resource-exhausted' });
      });
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

    it('clears the session quietly when account-action expects the sign-out (email change), then reports the next loss again', async () => {
      userSignal.set({ id: 'user-123' });
      const callback = await getAuthStateCallback(service);

      service.expectSignOut(true);
      await callback(null);

      expect(mockGroupService.logout).toHaveBeenCalled();
      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/auth/login']);

      // The expectation is used up by that sign-out.
      await callback(null);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('does not report "session expired" from a write that finds the session gone while a sign-out is expected', async () => {
      (mockAuth as any).currentUser = null;
      service.expectSignOut(true);

      await expect(
        service.updateUserEmailAndLinkMembers('new@test.com')
      ).rejects.toThrow();

      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/auth/login']);
    });

    it('does not show the load-failure error when an expected email-change revocation hits the session start', async () => {
      // The page load's session sync refreshes the token after account-action
      // has reloaded the user onto the new address; production has revoked
      // the session by then.
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );
      const firebaseUser = {
        uid: 'user-123',
        email: 'new@test.com',
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
        getIdTokenResult: vi
          .fn()
          .mockRejectedValue(
            new FirebaseError('auth/user-token-expired', 'expired')
          ),
      };
      const callback = await getAuthStateCallback(service);

      service.expectSignOut(true);
      await callback(firebaseUser as any);

      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockAnalytics.logError).not.toHaveBeenCalledWith(
        'User Service',
        'initializeAuth',
        'Failed to initialize user',
        expect.anything()
      );

      // Without the expectation the same failure is reported as usual.
      service.expectSignOut(false);
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );
      await callback(firebaseUser as any);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('reports the loss again once the caller stops expecting a sign-out', async () => {
      userSignal.set({ id: 'user-123' });
      const callback = await getAuthStateCallback(service);

      service.expectSignOut(true);
      service.expectSignOut(false);
      await callback(null);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
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
      expect(mockDialog.open).toHaveBeenCalledWith(
        AppCheckErrorDialogComponent,
        { disableClose: false, maxWidth: '80vw' }
      );
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
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

      it('reports App Check status once per session, not once per retry', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
          new FirebaseError('unavailable', 'The service is currently unavailable.')
        );
        const callback = await getAuthStateCallback(service);

        const resultPromise = callback(firebaseUser as any);
        await vi.advanceTimersByTimeAsync(2000);
        await resultPromise;

        expect(mockAnalytics.logAppCheckStatus).toHaveBeenCalledTimes(1);
        expect(mockAnalytics.logAppCheckStatus).toHaveBeenCalledWith(
          expect.objectContaining({ ready: expect.any(Boolean) })
        );
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
    // The token the rules check: refreshed before any profile email write.
    const tokenClaims = (email: string, verified = true) =>
      vi.fn().mockResolvedValue({
        token: 't',
        claims: { email, email_verified: verified },
      });
    let firebaseUser: any;

    beforeEach(() => {
      firebaseUser = {
        uid: 'user-123',
        email: 'alice@test.com',
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
        getIdTokenResult: tokenClaims('alice@test.com'),
      };
    });

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

    it('falls back to creating the profile with an empty email, then stores the address from a refreshed token', async () => {
      // An orphaned registration verified elsewhere: the live user says
      // verified, but the cached ID token still says unverified, so writing
      // the address under it would be refused by the rules.
      vi.useFakeTimers();
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (() => vi.fn()) as any
      );
      firebaseUser.getIdToken = vi.fn().mockResolvedValue('cached-token');

      const callback = await getAuthStateCallback(service);
      const resultPromise = callback(firebaseUser as any);
      await vi.advanceTimersByTimeAsync(8000);
      await resultPromise;

      const setDoc = vi.mocked(firestoreModule.setDoc);
      expect(setDoc).toHaveBeenCalledTimes(2);
      expect(setDoc.mock.calls[0]![1]).toMatchObject({ email: '' });
      expect(setDoc.mock.calls[1]).toEqual([
        mockDocRef,
        { email: 'alice@test.com' },
        { merge: true },
      ]);
      // The address went in only after a forced refresh, never under the
      // cached token.
      expect(firebaseUser.getIdTokenResult).toHaveBeenCalledWith(true);
      expect(firebaseUser.getIdTokenResult.mock.invocationCallOrder[0]).toBeLessThan(
        setDoc.mock.invocationCallOrder[1]!
      );
      expect(firebaseUser.getIdToken).not.toHaveBeenCalled();
      expect(mockUserStore.initUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alice@test.com' }),
        false,
        true
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();
    });

    it("writes the refreshed token's address, never a stale one captured at sign-in", async () => {
      // account-action reloads the user onto a just-confirmed address while
      // the session starts: the captured address is the old one, the profile
      // already holds the new one, and the server's token says new.
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'new@test.com' }) as any
      );
      firebaseUser.email = 'old@test.com';
      firebaseUser.getIdTokenResult = tokenClaims('new@test.com');

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockUserStore.initUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com' }),
        false,
        true
      );
    });

    it('does not write when the refreshed token is not verified', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: '' }) as any
      );
      firebaseUser.getIdTokenResult = tokenClaims('alice@test.com', false);

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
    });

    it('does not refresh the token when the profile already matches', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'alice@test.com' }) as any
      );

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser);

      expect(firebaseUser.getIdTokenResult).not.toHaveBeenCalled();
      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
    });

    it('does not write an unverified sign-in address to an existing profile', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: '' }) as any
      );

      const callback = await getAuthStateCallback(service);
      await callback({ ...firebaseUser, emailVerified: false } as any);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockUserStore.initUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-123', email: '' }),
        false,
        false
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();
    });

    it('falls back to creating the profile with an empty email while the address is unverified', async () => {
      vi.useFakeTimers();
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
        (() => vi.fn()) as any
      );

      const callback = await getAuthStateCallback(service);
      const resultPromise = callback({
        ...firebaseUser,
        emailVerified: false,
      } as any);
      await vi.advanceTimersByTimeAsync(8000);
      await resultPromise;

      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({ email: '' })
      );
      expect(firebaseUser.getIdTokenResult).not.toHaveBeenCalled();
    });

    it('writes the address once a Google sign-in (verified) differs from the profile', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: '' }) as any
      );

      const callback = await getAuthStateCallback(service);
      await callback({
        ...firebaseUser,
        providerData: [{ providerId: 'google.com' }],
      } as any);

      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'alice@test.com' },
        { merge: true }
      );
    });

    it('syncs the email field for an existing user without waiting on the server trigger', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );
      const onSnapshotSpy = vi.spyOn(firestoreModule, 'onSnapshot');

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser as any);

      expect(onSnapshotSpy).not.toHaveBeenCalled();
      expect(firebaseUser.getIdTokenResult).toHaveBeenCalledWith(true);
      expect(firestoreModule.setDoc).toHaveBeenCalledWith(
        mockDocRef,
        { email: 'alice@test.com' },
        { merge: true }
      );
      expect(mockGroupService.getUserGroups).toHaveBeenCalled();
    });

    // B20: a changed profile email offers to update the group member emails.
    describe('group email update offer (sign-in path)', () => {
      it('records the old and new address when the profile email changes', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: 'old@test.com' }) as any
        );

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);

        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(1);
        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledWith({
          uid: 'user-123',
          oldEmail: 'old@test.com',
          newEmail: 'alice@test.com',
        });
      });

      it('does not offer when a blank profile email is filled in', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: '' }) as any
        );

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);

        expect(firestoreModule.setDoc).toHaveBeenCalled();
        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('does not offer when the profile email is unchanged', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: 'alice@test.com' }) as any
        );

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);

        expect(firestoreModule.setDoc).not.toHaveBeenCalled();
        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('does not offer for a change of letter case only', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: 'Alice@Test.com' }) as any
        );

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);

        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });

      it('offers once when the session start and the link path both record the same change', async () => {
        const stale = makeUserSnap(true, { email: 'old@test.com' }) as any;
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(stale);
        (mockAuth as any).currentUser = {
          uid: 'user-123',
          getIdToken: vi.fn().mockResolvedValue('t'),
        };

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);
        await service.updateUserEmailAndLinkMembers('alice@test.com');

        expect(mockUserStore.setGroupEmailPrompt).toHaveBeenCalledTimes(1);
      });

      it('does not offer when the profile write fails', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: 'old@test.com' }) as any
        );
        vi.spyOn(firestoreModule, 'setDoc').mockRejectedValue(new Error('x'));

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser as any);

        expect(mockUserStore.setGroupEmailPrompt).not.toHaveBeenCalled();
      });
    });

    // I1 (final review): firestore.rules accepts a profile email only when it
    // is one valid address (B12). A legacy account whose verified Auth
    // address fails that pattern (an underscore in the domain, no dotted
    // TLD, ...) would have the write refused on every sign-in, and the
    // refusal used to end the sign-in: the account was locked out.
    it.each([
      ['an underscore in the domain', 'alice@my_domain.com'],
      ['no dotted TLD', 'alice@localhost'],
      ['a non-ASCII local part', 'ålice@test.com'],
    ])(
      'signs in without writing a verified address that is not one valid address (%s)',
      async (_label, address) => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: '' }) as any
        );
        firebaseUser.email = address;
        firebaseUser.getIdTokenResult = tokenClaims(address);

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser);

        expect(firestoreModule.setDoc).not.toHaveBeenCalled();
        expect(mockUserStore.initUser).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-123', email: '' }),
          false,
          true
        );
        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
        expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      }
    );

    it.each([
      [
        'a rules refusal',
        new FirebaseError('permission-denied', 'Missing or insufficient permissions.'),
        'Missing or insufficient permissions.',
      ],
      ['a network failure', new Error('offline'), 'offline'],
      ['a non-Error', 'boom', 'Unknown error'],
    ])(
      'logs %s of the profile email write and still signs in with the stored email',
      async (_label, thrown, message) => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: 'old@test.com' }) as any
        );
        vi.spyOn(firestoreModule, 'setDoc').mockRejectedValue(thrown);

        const callback = await getAuthStateCallback(service);
        await callback(firebaseUser);

        expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'User Service',
          'syncProfileEmail',
          'Failed to store the verified email in the profile',
          message
        );
        expect(mockUserStore.initUser).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-123', email: 'old@test.com' }),
          false,
          true
        );
        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
        expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
        expect(mockAnalytics.logError).not.toHaveBeenCalledWith(
          'User Service',
          'initializeAuth',
          'Failed to initialize user',
          expect.anything()
        );
      }
    );

    it('logs a failed token refresh and still signs in, unless the session was revoked', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
        makeUserSnap(true, { email: 'old@test.com' }) as any
      );
      firebaseUser.getIdTokenResult = vi
        .fn()
        .mockRejectedValue(new Error('network'));

      const callback = await getAuthStateCallback(service);
      await callback(firebaseUser);

      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'User Service',
        'syncProfileEmail',
        'Failed to store the verified email in the profile',
        'network'
      );
      expect(mockUserStore.initUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'old@test.com' }),
        false,
        true
      );
      // A revoked session is not survivable: see the expected email-change
      // revocation test above, which still ends the session start.
    });
  });

  describe('coverage pass: diagnostics, failure logging and edge cases', () => {
    const unverifiedUser = () => ({
      uid: 'user-123',
      email: 'alice@test.com',
      emailVerified: false,
      providerData: [{ providerId: 'password' }],
    });
    const failure = (message: string) =>
      [
        ['an Error', new Error(message), message],
        ['a non-Error', message, 'Unknown error'],
      ] as const;

    afterEach(() => {
      resetAppCheckForTesting();
    });

    describe('App Check readiness at sign-in', () => {
      it('keeps loading the account and logs the rejection reason when no App Check token is confirmed', async () => {
        initAppCheck({} as any);
        vi.spyOn(appCheckModule, 'getToken').mockRejectedValue(
          new Error('low score')
        );
        const callback = await getAuthStateCallback(service);

        await callback(unverifiedUser() as any);

        expect(mockAnalytics.logAppCheckStatus).toHaveBeenCalledWith({
          ready: false,
          reason: 'error',
          detail: 'low score',
        });
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'User Service',
          'initializeAuth',
          'Proceeding without confirmed App Check token',
          'error: low score'
        );
        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
      });

      it('logs only the reason when the token is still in flight after the wait', async () => {
        initAppCheck({} as any);
        vi.spyOn(appCheckModule, 'getToken').mockReturnValue(
          new Promise(() => {}) as any
        );
        vi.useFakeTimers();
        try {
          const callback = await getAuthStateCallback(service);

          const done = callback(unverifiedUser() as any);
          await vi.advanceTimersByTimeAsync(10_000);
          await done;

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'initializeAuth',
            'Proceeding without confirmed App Check token',
            'timeout'
          );
          expect(mockGroupService.getUserGroups).toHaveBeenCalled();
        } finally {
          vi.useRealTimers();
        }
      });

      it('logs nothing about App Check when the token is ready', async () => {
        initAppCheck({} as any);
        vi.spyOn(appCheckModule, 'getToken').mockResolvedValue({
          token: 'abc',
        } as any);
        const callback = await getAuthStateCallback(service);

        await callback(unverifiedUser() as any);

        expect(mockAnalytics.logAppCheckStatus).toHaveBeenCalledWith({
          ready: true,
          reason: 'ready',
        });
        expect(mockAnalytics.logError).not.toHaveBeenCalledWith(
          'User Service',
          'initializeAuth',
          'Proceeding without confirmed App Check token',
          expect.anything()
        );
      });
    });

    describe('waiting for the server-created profile', () => {
      it('falls back to creating the profile at once when the listener fails, without waiting out the timeout', async () => {
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          ((_ref: any, _onNext: any, onError: any) => {
            setTimeout(() => onError(new Error('listen failed')), 0);
            return vi.fn();
          }) as any
        );
        const callback = await getAuthStateCallback(service);

        await callback(unverifiedUser() as any);

        expect(mockAnalytics.logSnapshotError).toHaveBeenCalledWith(
          'User Service',
          'waitForServerCreatedUser',
          'Failed to listen for server-created user profile',
          'listen failed'
        );
        expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
        expect(firestoreModule.setDoc).toHaveBeenCalledWith(
          mockDocRef,
          expect.objectContaining({ email: '', defaultGroupRef: null })
        );
        expect(mockGroupService.getUserGroups).toHaveBeenCalled();
      });

      it('logs "Unknown error" when the listener fails with something that is not an Error', async () => {
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          ((_ref: any, _onNext: any, onError: any) => {
            onError({ code: 'permission-denied' });
            return vi.fn();
          }) as any
        );
        const callback = await getAuthStateCallback(service);

        await callback(unverifiedUser() as any);

        expect(mockAnalytics.logSnapshotError).toHaveBeenCalledWith(
          'User Service',
          'waitForServerCreatedUser',
          'Failed to listen for server-created user profile',
          'Unknown error'
        );
      });

      it('takes the first profile the listener delivers and stops listening, ignoring later snapshots', async () => {
        const unsubscribe = vi.fn();
        vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(
          ((_ref: any, onNext: any) => {
            setTimeout(() => {
              onNext(makeUserSnap(true, { email: '' }));
              onNext(makeUserSnap(true, { email: 'late@test.com' }));
            }, 0);
            return unsubscribe;
          }) as any
        );
        const callback = await getAuthStateCallback(service);

        await callback(unverifiedUser() as any);

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(mockUserStore.initUser).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-123', email: '' }),
          false,
          false
        );
        expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      });
    });

    describe('session start edge cases', () => {
      it('does not write or refresh the token for a verified user who has no sign-in address', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: '' }) as any
        );
        const getIdTokenResult = vi.fn();
        const callback = await getAuthStateCallback(service);

        await callback({
          ...unverifiedUser(),
          email: null,
          emailVerified: true,
          getIdTokenResult,
        } as any);

        expect(getIdTokenResult).not.toHaveBeenCalled();
        expect(firestoreModule.setDoc).not.toHaveBeenCalled();
        expect(mockUserStore.initUser).toHaveBeenCalledWith(
          expect.objectContaining({ email: '' }),
          false,
          true
        );
      });

      it('does not write when the refreshed token carries no address', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce(
          makeUserSnap(true, { email: '' }) as any
        );
        const callback = await getAuthStateCallback(service);

        await callback({
          ...unverifiedUser(),
          emailVerified: true,
          getIdTokenResult: vi
            .fn()
            .mockResolvedValue({ claims: { email_verified: true } }),
        } as any);

        expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      });

      it.each(failure('boom'))(
        'logs the load failure for %s',
        async (_label, thrown, message) => {
          vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(thrown);
          const callback = await getAuthStateCallback(service);

          await callback(unverifiedUser() as any);

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'initializeAuth',
            'Failed to initialize user',
            message
          );
          expect(mockLoadingService.loadingOff).toHaveBeenCalled();
        }
      );

      it('still reports a load failure that is not a revoked session while a sign-out is expected', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(
          new Error('network error')
        );
        const callback = await getAuthStateCallback(service);

        service.expectSignOut(true);
        await callback(unverifiedUser() as any);

        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          expect.anything(),
          {
            data: {
              message:
                'Something went wrong loading your account. Please try again.',
            },
          }
        );
      });

      it.each(failure('denied'))(
        'logs a failed persistence setup for %s and still listens',
        async (_label, thrown, message) => {
          vi.spyOn(authModule, 'setPersistence').mockRejectedValueOnce(thrown);

          await (service as any).initializeAuth();

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'initializeAuth',
            'Failed to set auth persistence',
            message
          );
          expect(mockAuth.onAuthStateChanged).toHaveBeenCalled();
        }
      );
    });

    describe('reporting a lost session once', () => {
      it('shows the expired-session notice once for repeated losses, and again after the next successful sign-in', async () => {
        userSignal.set({ id: 'user-123' });
        const callback = await getAuthStateCallback(service);

        await callback(null);
        await callback(null);

        expect(mockSnackBar.openFromComponent).toHaveBeenCalledTimes(1);
        expect(mockRouter.navigate).toHaveBeenCalledTimes(1);

        await callback(unverifiedUser() as any);
        await callback(null);

        expect(mockSnackBar.openFromComponent).toHaveBeenCalledTimes(2);
      });
    });

    describe('user document failures', () => {
      it.each(failure('read failed'))(
        'logs and rethrows a getUserDetails failure for %s',
        async (_label, thrown, message) => {
          vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(thrown);

          await expect(service.getUserDetails('user-123')).rejects.toBe(thrown);

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'getUserDetails',
            'Failed to get user details',
            message
          );
        }
      );

      it.each(failure('write failed'))(
        'logs and rethrows when creating the profile fails for %s',
        async (_label, thrown, message) => {
          vi.spyOn(firestoreModule, 'setDoc').mockRejectedValueOnce(thrown);

          await expect(
            service.createUserIfNotExists('new-user')
          ).rejects.toBe(thrown);

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'createUserIfNotExists',
            'Failed to create user',
            message
          );
        }
      );

      it.each(failure('write failed'))(
        'logs, rethrows and leaves the store alone when updating the user fails for %s',
        async (_label, thrown, message) => {
          (mockAuth as any).currentUser = { uid: 'user-123' };
          vi.spyOn(firestoreModule, 'setDoc').mockRejectedValueOnce(thrown);

          await expect(
            service.updateUser({ venmoId: '@alice' })
          ).rejects.toBe(thrown);

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'updateUser',
            'Failed to update user',
            message
          );
          expect(mockUserStore.updateUser).not.toHaveBeenCalled();
        }
      );
    });

    describe('getPaymentMethods', () => {
      const memberRef = { id: 'member-1' } as any;

      it('reads the member, then the user it points at, and answers empty strings for payment ids the user never set', async () => {
        const userRef = { id: 'user-1' };
        vi.spyOn(firestoreModule, 'getDoc')
          .mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ userRef }),
          } as any)
          .mockResolvedValueOnce({
            exists: () => true,
            data: () => ({}),
          } as any);

        const result = await service.getPaymentMethods(memberRef);

        expect(vi.mocked(firestoreModule.getDoc).mock.calls).toEqual([
          [memberRef],
          [userRef],
        ]);
        expect(result).toEqual({
          venmoId: '',
          paypalId: '',
          cashAppId: '',
          zelleId: '',
        });
      });

      it.each(failure('read failed'))(
        'logs and rethrows a failure for %s',
        async (_label, thrown, message) => {
          vi.spyOn(firestoreModule, 'getDoc').mockRejectedValueOnce(thrown);

          await expect(service.getPaymentMethods(memberRef)).rejects.toBe(
            thrown
          );

          expect(mockAnalytics.logError).toHaveBeenCalledWith(
            'User Service',
            'getPaymentMethods',
            'Failed to get payment methods',
            message
          );
        }
      );
    });
  });
});
