import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import * as functionsModule from 'firebase/functions';
import {
  DuplicateMemberEmailError,
  memberEmailUpdateMessage,
  MemberService,
} from './member.service';
import { UserStore } from '@store/user.store';
import { MemberStore } from '@store/member.store';
import { AnalyticsService } from '@services/analytics.service';
import { SortingService } from './sorting.service';

const mockFs = {};
const mockFunctions = {};

function makeSnap(docs: any[] = []) {
  return { size: docs.length, empty: docs.length === 0, docs };
}

function makeDocSnap(id: string, data: any, ref?: any) {
  return { id, data: () => data, ref: ref ?? { id } };
}

/** The member-email callables' failed Auth lookup, as the SDK throws it. */
function authLookupUnavailable(): Error {
  return Object.assign(
    new Error("Couldn't check your account right now. Please try again. [503]"),
    { code: 'functions/unavailable' }
  );
}

describe('MemberService', () => {
  let service: MemberService;

  const userSignal = signal<any>(null);
  const mockUserStore = { user: userSignal };
  const mockMemberStore = {
    setCurrentMember: vi.fn(),
    clearCurrentMember: vi.fn(),
    setGroupMembers: vi.fn(),
    groupMembers: signal<any[]>([]),
    currentMember: signal<any>(null),
  };
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };

  beforeEach(() => {
    // clearAllMocks, not resetAllMocks: a reset also strips the default
    // implementations from the shared module mocks in src/testing/mocks,
    // breaking whichever spec files run after this one in the same browser
    // context (isolate: false). Per-test once-values here all go through
    // vi.spyOn, which afterEach's restoreAllMocks already undoes.
    vi.clearAllMocks();
    userSignal.set(null);

    vi.spyOn(firestoreModule, 'collection').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'collectionGroup').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'query').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'orderBy').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'limit').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'documentId').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'doc').mockReturnValue({
      id: 'group-mock',
    } as any);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    } as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap([]) as any);
    vi.spyOn(firestoreModule, 'addDoc').mockResolvedValue({
      id: 'new-member',
    } as any);
    vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        MemberService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
        { provide: UserStore, useValue: mockUserStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: SortingService, useValue: new SortingService() },
      ],
    });
    service = TestBed.inject(MemberService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGroupMembers', () => {
    // Captures the listener's callback so tests can deliver snapshots
    let deliver: (snap: any) => void;
    const snap = (names: string[], fromCache: boolean) => ({
      ...makeSnap(
        names.map((name) => makeDocSnap(name, { displayName: name }))
      ),
      metadata: { fromCache },
    });
    const published = () =>
      mockMemberStore.setGroupMembers.mock.calls.map((call: any[]) =>
        call[0].map((m: any) => m.displayName)
      );

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(firestoreModule, 'onSnapshot').mockImplementation(((
        _q: unknown,
        next: (snap: any) => void
      ) => {
        deliver = next;
        return vi.fn();
      }) as any);
      service.getGroupMembers('group-1');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should wait for the server instead of publishing a partial cached list', () => {
      // After a refresh the cache holds only the current member
      deliver(snap(['Pat'], true));
      expect(mockMemberStore.setGroupMembers).not.toHaveBeenCalled();

      deliver(snap(['Alex', 'Pat', 'Sam'], false));
      expect(published()).toEqual([['Alex', 'Pat', 'Sam']]);
    });

    it('should publish later results as usual, cached or not', () => {
      deliver(snap(['Pat'], false));
      deliver(snap(['Pat', 'Sam'], true));
      expect(published()).toEqual([['Pat'], ['Pat', 'Sam']]);
    });

    it('should wait for the server again when listening to another group', () => {
      deliver(snap(['Pat'], false));
      mockMemberStore.setGroupMembers.mockClear();

      service.getGroupMembers('group-2');
      deliver(snap(['Pat'], true));
      expect(mockMemberStore.setGroupMembers).not.toHaveBeenCalled();
    });

    // The server confirmation can be slow to arrive (seen hanging
    // indefinitely against the emulator) - these cover the fallback that
    // keeps the page from getting stuck loading forever when it does.
    it('should publish the cached list if the server never confirms in time', () => {
      deliver(snap(['Pat'], true));
      expect(mockMemberStore.setGroupMembers).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);
      expect(published()).toEqual([['Pat']]);
    });

    it('should not publish twice if the server confirms just before the timeout', () => {
      deliver(snap(['Pat'], true));
      deliver(snap(['Alex', 'Pat'], false));

      vi.advanceTimersByTime(2000);
      expect(published()).toEqual([['Alex', 'Pat']]);
    });

    it('should not let a stale timeout publish after switching groups', () => {
      deliver(snap(['Pat'], true));

      service.getGroupMembers('group-2');
      vi.advanceTimersByTime(2000);

      expect(mockMemberStore.setGroupMembers).not.toHaveBeenCalled();
    });
  });

  describe('getMemberByUserRef', () => {
    const userRef = { id: 'user-1' } as any;
    const lookup = (memberId: string) =>
      makeSnap([makeDocSnap(memberId, { displayName: memberId })]);

    it('should ignore a slower lookup for a group the user has since switched away from', async () => {
      let finishGroupA!: (snap: any) => void;
      vi.spyOn(firestoreModule, 'getDocs')
        .mockReturnValueOnce(new Promise((r) => (finishGroupA = r)) as any)
        .mockResolvedValueOnce(lookup('b-me') as any);

      const groupA = service.getMemberByUserRef('group-a', userRef);
      await service.getMemberByUserRef('group-b', userRef);
      finishGroupA(lookup('a-me'));
      await groupA;

      expect(mockMemberStore.setCurrentMember).toHaveBeenCalledTimes(1);
      expect(mockMemberStore.setCurrentMember.mock.calls[0]![0].id).toBe(
        'b-me'
      );
    });

    it('should ignore a lookup that finishes after listening stopped', async () => {
      let finish!: (snap: any) => void;
      vi.spyOn(firestoreModule, 'getDocs').mockReturnValueOnce(
        new Promise((r) => (finish = r)) as any
      );

      const pending = service.getMemberByUserRef('group-a', userRef);
      service.stopListening();
      finish(lookup('a-me'));
      await pending;

      expect(mockMemberStore.setCurrentMember).not.toHaveBeenCalled();
    });
  });

  describe('addMemberToGroup', () => {
    it('should throw when a member with the same email already exists', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('m1', { email: 'dup@test.com' })]) as any
      );

      const added = service.addMemberToGroup('group-1', {
        email: 'dup@test.com',
      });
      await expect(added).rejects.toThrow(
        'Another member of this group already uses that address.'
      );
      await expect(added).rejects.toBeInstanceOf(DuplicateMemberEmailError);
    });

    it('should write the member without a userRef, leaving linking to the server', async () => {
      // Even if an account with that address existed, the client sets nothing.
      let reads = 0;
      vi.spyOn(firestoreModule, 'getDocs').mockImplementation(
        async () =>
          (reads++ === 0
            ? makeSnap([])
            : makeSnap([makeDocSnap('user-123', {}, { id: 'user-123' })])) as any
      );

      const member: any = { email: 'new@test.com' };
      await service.addMemberToGroup('group-1', member);

      expect(member.userRef).toBeUndefined();
      expect(firestoreModule.addDoc).toHaveBeenCalledWith({}, member);
      expect(member).not.toHaveProperty('userRef');
    });

    it('should never query the users collection', async () => {
      await service.addMemberToGroup('group-1', { email: 'new@test.com' });

      expect(firestoreModule.collection).not.toHaveBeenCalledWith(
        mockFs,
        'users'
      );
      // Only the duplicate check reads.
      expect(firestoreModule.getDocs).toHaveBeenCalledOnce();
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('should call addDoc to persist the new member', async () => {
      await service.addMemberToGroup('group-1', { email: 'new@test.com' });

      expect(firestoreModule.addDoc).toHaveBeenCalledOnce();
    });

    it('should skip the duplicate check when no email is given', async () => {
      await service.addMemberToGroup('group-1', { displayName: 'No Email' });

      expect(firestoreModule.getDocs).not.toHaveBeenCalled();
      expect(firestoreModule.addDoc).toHaveBeenCalledOnce();
    });

    it('should query emailLower with a normalized (trimmed, lowercased) email', async () => {
      await service.addMemberToGroup('group-1', {
        email: '  New@Test.com  ',
      });

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'emailLower',
        '==',
        'new@test.com'
      );
      expect(firestoreModule.where).not.toHaveBeenCalledWith(
        'email',
        '==',
        expect.anything()
      );
    });
  });

  describe('updateMember', () => {
    const mockMemberRef = { id: 'member-1', parent: { id: 'members' } } as any;

    it('should throw when another member has the same email', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('other-member', {})]) as any
      );

      const updated = service.updateMember(mockMemberRef, {
        email: 'dup@test.com',
      });
      await expect(updated).rejects.toThrow(
        'Another member of this group already uses that address.'
      );
      await expect(updated).rejects.toBeInstanceOf(DuplicateMemberEmailError);
    });

    it('should refuse another row’s address case-insensitively, writing nothing', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('other-member', {})]) as any
      );

      const saved = service.updateMember(mockMemberRef, {
        email: 'Taken@Test.com',
      });
      await expect(saved).rejects.toBeInstanceOf(DuplicateMemberEmailError);

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'emailLower',
        '==',
        'taken@test.com'
      );
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });

    it('should never query users or set a userRef when the email changes', async () => {
      const changes: any = { email: 'new@test.com' };
      await service.updateMember(mockMemberRef, changes);

      expect(firestoreModule.collection).not.toHaveBeenCalledWith(
        mockFs,
        'users'
      );
      expect(changes.userRef).toBeUndefined();
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        email: 'new@test.com',
      });
    });

    it('should skip the duplicate check when the email is cleared', async () => {
      await service.updateMember(mockMemberRef, { email: '' });

      expect(firestoreModule.getDocs).not.toHaveBeenCalled();
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        email: '',
      });
    });

    it('should call updateDoc when the email is unique', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      await service.updateMember(mockMemberRef, { email: 'new@test.com' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        email: 'new@test.com',
      });
    });

    it('should skip duplicate email check when email is not being changed', async () => {
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      await service.updateMember(mockMemberRef, { displayName: 'Alice' });

      expect(firestoreModule.getDocs).not.toHaveBeenCalled();
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        displayName: 'Alice',
      });
    });

    it('should query emailLower with a normalized (trimmed, lowercased) email', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.updateMember(mockMemberRef, {
        email: '  New@Test.com  ',
      });

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'emailLower',
        '==',
        'new@test.com'
      );
    });
  });

  describe('removeMemberFromGroup', () => {
    const mockMemberRef = {
      id: 'member-1',
      eq: (other: any) => other.id === 'member-1',
    } as any;

    it('should throw when the member has existing splits', async () => {
      const splitDoc = {
        data: () => ({
          owedByMemberRef: { eq: () => true },
          paidByMemberRef: { eq: () => false },
        }),
      };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([splitDoc]) as any
      );

      await expect(
        service.removeMemberFromGroup('group-1', mockMemberRef)
      ).rejects.toThrow(
        'This member has existing splits and cannot be deleted.'
      );
    });

    it('should call deleteDoc when member has no splits', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );
      vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValueOnce(undefined);

      await service.removeMemberFromGroup('group-1', mockMemberRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockMemberRef);
    });

    it('should delete the row without reading or writing the removed user', async () => {
      const mockUserRef = { id: 'user-1' };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );
      // The row is linked, but the client no longer looks at the account.
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
        exists: () => true,
        data: () => ({ userRef: mockUserRef }),
      } as any);

      await service.removeMemberFromGroup('group-1', mockMemberRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockMemberRef);
      expect(firestoreModule.getDoc).not.toHaveBeenCalled();
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('leaveGroup', () => {
    const mockMemberRef = { id: 'member-1' } as any;

    it('should throw when the member is the only admin', async () => {
      userSignal.set({ ref: { id: 'user-1' } });
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('member-1', { groupAdmin: true })]) as any
      );

      await expect(
        service.leaveGroup('group-1', mockMemberRef)
      ).rejects.toThrow('You are the only group admin.');
    });

    it('should mark the member inactive when they have splits', async () => {
      const splitDoc = {
        data: () => ({
          owedByMemberRef: { eq: () => true },
          paidByMemberRef: { eq: () => false },
        }),
      };
      // Two admins so not last admin
      vi.spyOn(firestoreModule, 'getDocs')
        .mockResolvedValueOnce(
          makeSnap([
            makeDocSnap('member-1', {}),
            makeDocSnap('member-2', {}),
          ]) as any
        )
        .mockResolvedValueOnce(makeSnap([splitDoc]) as any);
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined);
      userSignal.set({ ref: { id: 'user-1' } });

      const result = await service.leaveGroup('group-1', mockMemberRef);

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        active: false,
        leftGroup: true,
        groupAdmin: false,
      });
      expect(result).toEqual({ deleted: false });
    });

    it('should delete the member when they have no splits', async () => {
      vi.spyOn(firestoreModule, 'getDocs')
        .mockResolvedValueOnce(
          makeSnap([
            makeDocSnap('member-1', {}),
            makeDocSnap('member-2', {}),
          ]) as any
        )
        .mockResolvedValueOnce(makeSnap([]) as any);
      vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValueOnce(undefined);
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);
      userSignal.set({ ref: { id: 'user-1' } });

      const result = await service.leaveGroup('group-1', mockMemberRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockMemberRef);
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('rejoinGroup', () => {
    it('should clear leftGroup and reactivate the member', async () => {
      const mockMemberRef = { id: 'member-1' } as any;
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      await service.rejoinGroup(mockMemberRef);

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        leftGroup: false,
        active: true,
      });
    });
  });

  describe('updateAllMemberEmails', () => {
    // M1/M2: the server writes (updateMemberEmails), so the client never
    // queries or writes member docs here, nor names the address.
    it('calls the updateMemberEmails callable with no address and returns its counts', async () => {
      const callable = vi
        .fn()
        .mockResolvedValue({ data: { updated: 2, conflicts: 1 } });
      const httpsCallable = vi
        .spyOn(functionsModule, 'httpsCallable')
        .mockReturnValue(callable as any);
      const updateDoc = vi.spyOn(firestoreModule, 'updateDoc');

      const result = await service.updateAllMemberEmails();

      expect(httpsCallable).toHaveBeenCalledWith(
        mockFunctions,
        'updateMemberEmails'
      );
      expect(callable).toHaveBeenCalledWith({});
      expect(result).toEqual({ updated: 2, conflicts: 1 });
      expect(updateDoc).not.toHaveBeenCalled();
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'member_emails_updated',
        { membersUpdated: 2, memberConflicts: 1 }
      );
    });

    it('passes onlyFromEmail through', async () => {
      const callable = vi
        .fn()
        .mockResolvedValue({ data: { updated: 1, conflicts: 0 } });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        callable as any
      );

      await service.updateAllMemberEmails('Old@Test.com');

      expect(callable).toHaveBeenCalledWith({ onlyFromEmail: 'Old@Test.com' });
    });

    it('rethrows the unverified-login refusal without logging it', async () => {
      const error = Object.assign(
        new Error('Verify your login email first. [403]'),
        { code: 'functions/permission-denied' }
      );
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(service.updateAllMemberEmails()).rejects.toBe(error);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    // The server logs a failed Auth lookup itself; here it is an outcome.
    it('rethrows the failed-account-check error without logging it', async () => {
      const error = authLookupUnavailable();
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(service.updateAllMemberEmails()).rejects.toBe(error);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    // A legacy login address the server can't write.
    // The owner should hear about it, so it is logged.
    it('logs and rethrows the invalid-login-email refusal', async () => {
      const error = Object.assign(
        new Error(
          'Your login email is not a single valid email address. [400]'
        ),
        { code: 'functions/failed-precondition' }
      );
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(service.updateAllMemberEmails()).rejects.toBe(error);
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Service',
        'updateAllMemberEmails',
        'Failed to update member emails',
        'Your login email is not a single valid email address.'
      );
    });

    it('logs and rethrows an unexpected failure', async () => {
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('boom'), { code: 'functions/internal' })
          ) as any
      );

      await expect(service.updateAllMemberEmails()).rejects.toThrow('boom');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Service',
        'updateAllMemberEmails',
        'Failed to update member emails',
        'boom'
      );
    });
  });

  describe('memberEmailUpdateMessage', () => {
    it.each([
      [{ updated: 0, conflicts: 0 }, 'No member records needed updating'],
      [{ updated: 1, conflicts: 0 }, 'Updated email on 1 member record'],
      [{ updated: 3, conflicts: 0 }, 'Updated email on 3 member records'],
      [
        { updated: 2, conflicts: 1 },
        'Updated email on 2 member records. 1 skipped because another member of that group already uses that address.',
      ],
      [
        { updated: 1, conflicts: 2 },
        'Updated email on 1 member record. 2 skipped because another member of each of those groups already uses that address.',
      ],
      [
        { updated: 0, conflicts: 1 },
        'No member records were updated. 1 skipped because another member of that group already uses that address.',
      ],
    ])('%o reads "%s"', (result, message) => {
      expect(memberEmailUpdateMessage(result)).toBe(message);
    });
  });

  describe('getLinkedMemberEmails', () => {
    const mockUserRef = { id: 'user-1' } as any;

    it("returns the email on each of the user's member records", async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([
          makeDocSnap('m1', { email: 'a@test.com' }, { id: 'm1' }),
          makeDocSnap('m2', { email: 'b@test.com' }, { id: 'm2' }),
          makeDocSnap('m3', {}, { id: 'm3' }),
        ]) as any
      );

      expect(await service.getLinkedMemberEmails(mockUserRef)).toEqual([
        'a@test.com',
        'b@test.com',
        '',
      ]);
    });

    it('logs and rethrows a failed read', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce(
        new Error('Firestore error')
      );

      await expect(service.getLinkedMemberEmails(mockUserRef)).rejects.toThrow(
        'Firestore error'
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Service',
        'getLinkedMemberEmails',
        'Failed to get linked member emails',
        'Firestore error'
      );
    });
  });

  // Plan 4 B19: a member's own group email change goes through the server,
  // which mails a confirmation link to any address that isn't the caller's
  // verified sign-in address.
  describe('requestMemberEmailChange', () => {
    it('calls the requestMemberEmailChange callable and returns its status', async () => {
      const callable = vi
        .fn()
        .mockResolvedValue({ data: { status: 'pending' } });
      const httpsCallable = vi
        .spyOn(functionsModule, 'httpsCallable')
        .mockReturnValue(callable as any);

      const status = await service.requestMemberEmailChange(
        'group-1',
        'member-1',
        'new@example.com'
      );

      expect(httpsCallable).toHaveBeenCalledWith(
        mockFunctions,
        'requestMemberEmailChange'
      );
      expect(callable).toHaveBeenCalledWith({
        groupId: 'group-1',
        memberId: 'member-1',
        email: 'new@example.com',
      });
      expect(status).toBe('pending');
    });

    it.each(['functions/resource-exhausted', 'functions/already-exists'])(
      'rethrows %s (an outcome the dialog reports) without logging it',
      async (code) => {
        const error = Object.assign(new Error('refused'), { code });
        vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
          vi.fn().mockRejectedValue(error) as any
        );

        await expect(
          service.requestMemberEmailChange(
            'group-1',
            'member-1',
            'a@example.com'
          )
        ).rejects.toBe(error);
        expect(mockAnalytics.logError).not.toHaveBeenCalled();
      }
    );

    it('rethrows the failed-account-check error without logging it', async () => {
      const error = authLookupUnavailable();
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(
        service.requestMemberEmailChange('group-1', 'member-1', 'a@example.com')
      ).rejects.toBe(error);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('logs any other unavailable error', async () => {
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(
          Object.assign(new Error('unavailable'), {
            code: 'functions/unavailable',
          })
        ) as any
      );

      await expect(
        service.requestMemberEmailChange('group-1', 'member-1', 'a@example.com')
      ).rejects.toThrow('unavailable');
      expect(mockAnalytics.logError).toHaveBeenCalledOnce();
    });

    it('logs and rethrows an unexpected failure', async () => {
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('boom'), { code: 'functions/internal' })
          ) as any
      );

      await expect(
        service.requestMemberEmailChange('group-1', 'member-1', 'a@example.com')
      ).rejects.toThrow('boom');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Service',
        'requestMemberEmailChange',
        'Failed to request member email change',
        'boom'
      );
    });
  });

  describe('confirmMemberEmailChange', () => {
    it('calls the confirmMemberEmailChange callable with the token', async () => {
      const callable = vi.fn().mockResolvedValue({
        data: { groupId: 'group-1', email: 'new@example.com' },
      });
      const httpsCallable = vi
        .spyOn(functionsModule, 'httpsCallable')
        .mockReturnValue(callable as any);

      const result = await service.confirmMemberEmailChange('tok-123');

      expect(httpsCallable).toHaveBeenCalledWith(
        mockFunctions,
        'confirmMemberEmailChange'
      );
      expect(callable).toHaveBeenCalledWith({ token: 'tok-123' });
      expect(result).toEqual({ groupId: 'group-1', email: 'new@example.com' });
    });

    it('rethrows a rejected call without logging the expected outcomes', async () => {
      const error = Object.assign(new Error('expired'), {
        code: 'functions/failed-precondition',
      });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(service.confirmMemberEmailChange('tok')).rejects.toBe(error);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('rethrows the failed-account-check error without logging it', async () => {
      const error = authLookupUnavailable();
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi.fn().mockRejectedValue(error) as any
      );

      await expect(service.confirmMemberEmailChange('tok')).rejects.toBe(error);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('logs an unexpected failure', async () => {
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('boom'), { code: 'functions/internal' })
          ) as any
      );

      await expect(service.confirmMemberEmailChange('tok')).rejects.toThrow(
        'boom'
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Service',
        'confirmMemberEmailChange',
        'Failed to confirm member email change',
        'boom'
      );
    });
  });
});
