import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import { MemberService } from './member.service';
import { UserStore } from '@store/user.store';
import { MemberStore } from '@store/member.store';
import { AnalyticsService } from '@services/analytics.service';
import { SortingService } from './sorting.service';

const mockFs = {};

function makeSnap(docs: any[] = []) {
  return { size: docs.length, empty: docs.length === 0, docs };
}

function makeDocSnap(id: string, data: any, ref?: any) {
  return { id, data: () => data, ref: ref ?? { id } };
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
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
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

  describe('addMemberToGroup', () => {
    it('should throw when a member with the same email already exists', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('m1', { email: 'dup@test.com' })]) as any
      );

      await expect(
        service.addMemberToGroup('group-1', { email: 'dup@test.com' })
      ).rejects.toThrow(
        'A member with this email address already exists in the group.'
      );
    });

    it('should link userRef when a matching user account exists', async () => {
      const mockUserRef = { id: 'user-123' };
      vi.spyOn(firestoreModule, 'getDocs')
        .mockResolvedValueOnce(makeSnap([]) as any) // no duplicate member
        .mockResolvedValueOnce(
          makeSnap([makeDocSnap('user-123', {}, mockUserRef)]) as any
        ); // user found
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce({
        id: 'new-member',
      } as any);

      const member: any = { email: 'new@test.com' };
      await service.addMemberToGroup('group-1', member);

      expect(member.userRef).toBe(mockUserRef);
    });

    it('should not set userRef when no matching user account exists', async () => {
      vi.spyOn(firestoreModule, 'getDocs')
        .mockResolvedValueOnce(makeSnap([]) as any) // no duplicate member
        .mockResolvedValueOnce(makeSnap([]) as any); // no user found
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce({
        id: 'new-member',
      } as any);

      const member: any = { email: 'new@test.com' };
      await service.addMemberToGroup('group-1', member);

      expect(member.userRef).toBeUndefined();
    });

    it('should call addDoc to persist the new member', async () => {
      vi.spyOn(firestoreModule, 'getDocs')
        .mockResolvedValueOnce(makeSnap([]) as any)
        .mockResolvedValueOnce(makeSnap([]) as any);
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce({
        id: 'new-member',
      } as any);

      await service.addMemberToGroup('group-1', { email: 'new@test.com' });

      expect(firestoreModule.addDoc).toHaveBeenCalledOnce();
    });
  });

  describe('updateMember', () => {
    const mockMemberRef = { id: 'member-1', parent: { id: 'members' } } as any;

    it('should throw when another member has the same email', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('other-member', {})]) as any
      );

      await expect(
        service.updateMember(mockMemberRef, { email: 'dup@test.com' })
      ).rejects.toThrow(
        'A member with this email address already exists in the group.'
      );
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
  });

  describe('updateMemberWithUserMatching', () => {
    const mockMemberRef = { id: 'member-1' } as any;

    it('should search for a user and link userRef when member is unlinked and email is changing', async () => {
      const mockUserRef = { id: 'user-abc' };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDocSnap('user-abc', {}, mockUserRef)]) as any
      );
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      const changes: any = { email: 'new@test.com' };
      await service.updateMemberWithUserMatching(
        mockMemberRef,
        changes,
        null,
        'old@test.com'
      );

      expect(changes.userRef).toBe(mockUserRef);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        mockMemberRef,
        changes
      );
    });

    it('should not search when member already has a userRef', async () => {
      const existingRef = { id: 'existing-user' } as any;
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      const changes: any = { email: 'new@test.com' };
      await service.updateMemberWithUserMatching(
        mockMemberRef,
        changes,
        existingRef,
        'old@test.com'
      );

      expect(firestoreModule.getDocs).not.toHaveBeenCalled();
    });

    it('should not search when email is not changing', async () => {
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      const changes: any = { email: 'same@test.com' };
      await service.updateMemberWithUserMatching(
        mockMemberRef,
        changes,
        null,
        'same@test.com'
      );

      expect(firestoreModule.getDocs).not.toHaveBeenCalled();
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
  });

  describe('leaveGroup', () => {
    const mockMemberRef = { id: 'member-1' } as any;

    it('should throw when the member is the only admin', async () => {
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

      await service.leaveGroup('group-1', mockMemberRef);

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockMemberRef, {
        active: false,
      });
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

      await service.leaveGroup('group-1', mockMemberRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockMemberRef);
    });
  });

  describe('updateAllMemberEmails', () => {
    const mockUserRef = { id: 'user-1' } as any;

    it('should update email on all member documents linked to the user', async () => {
      const docs = [
        makeDocSnap('m1', {}, { id: 'm1' }),
        makeDocSnap('m2', {}, { id: 'm2' }),
      ];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(docs) as any
      );
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined);

      const count = await service.updateAllMemberEmails(
        mockUserRef,
        'new@test.com'
      );

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(2);
      expect(count).toBe(2);
    });

    it('should return 0 when no members are linked to the user', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      const count = await service.updateAllMemberEmails(
        mockUserRef,
        'new@test.com'
      );

      expect(count).toBe(0);
    });

    it('should rethrow errors', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce(
        new Error('Firestore error')
      );

      await expect(
        service.updateAllMemberEmails(mockUserRef, 'new@test.com')
      ).rejects.toThrow('Firestore error');
    });
  });
});
