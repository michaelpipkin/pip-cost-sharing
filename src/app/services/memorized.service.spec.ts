import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import { MemorizedService } from './memorized.service';
import { MemorizedStore } from '@store/memorized.store';
import { CategoryStore } from '@store/category.store';
import { MemberStore } from '@store/member.store';
import { AnalyticsService } from '@services/analytics.service';

const mockFs = {};
const mockDocRef = { id: 'mem-1' };

describe('MemorizedService', () => {
  let service: MemorizedService;

  const mockMemorizedStore = {
    setMemorizedExpenses: vi.fn(),
    memorizedExpenses: signal<any[]>([]),
  };
  const mockCategoryStore = {
    loaded: signal(true),
    getCategoryByRef: vi.fn().mockReturnValue(undefined),
    groupCategories: signal<any[]>([]),
  };
  const mockMemberStore = {
    loaded: signal(true),
    getMemberByRef: vi.fn().mockReturnValue(undefined),
    groupMembers: signal<any[]>([]),
  };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.spyOn(firestoreModule, 'collection').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'doc').mockReturnValue(mockDocRef as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => false,
    } as any);
    vi.spyOn(firestoreModule, 'addDoc').mockResolvedValue({
      id: 'new-doc',
    } as any);
    vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        MemorizedService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: MemorizedStore, useValue: mockMemorizedStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(MemorizedService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMemorized', () => {
    it('should return a Memorized object when document exists', async () => {
      const mockData = { description: 'Weekly Groceries', splits: [] };
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'mem-1',
        data: () => mockData,
        ref: mockDocRef,
      } as any);

      const result = await service.getMemorized('group-1', 'mem-1');

      expect(result.id).toBe('mem-1');
      expect(result.description).toBe('Weekly Groceries');
    });

    it('should throw when document does not exist', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => false,
      } as any);

      await expect(
        service.getMemorized('group-1', 'nonexistent')
      ).rejects.toThrow('Memorized expense not found');
    });

    it('should enrich with category and member from stores', async () => {
      const mockCategory = { id: 'cat-1', name: 'Groceries' };
      const mockMember = { id: 'member-1', displayName: 'Alice' };
      mockCategoryStore.getCategoryByRef.mockReturnValue(mockCategory);
      mockMemberStore.getMemberByRef.mockReturnValue(mockMember);

      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'mem-1',
        data: () => ({
          description: 'Test',
          categoryRef: 'ref-1',
          paidByMemberRef: 'ref-2',
          splits: [],
        }),
        ref: mockDocRef,
      } as any);

      const result = await service.getMemorized('group-1', 'mem-1');

      expect(result.category).toBe(mockCategory);
      expect(result.paidByMember).toBe(mockMember);
    });
  });

  describe('addMemorized', () => {
    it('should call addDoc and return the new document reference', async () => {
      const newRef = { id: 'new-mem' };
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce(newRef as any);

      const result = await service.addMemorized('group-1', {
        description: 'New Template',
      });

      expect(firestoreModule.addDoc).toHaveBeenCalledOnce();
      expect(result).toBe(newRef);
    });
  });

  describe('updateMemorized', () => {
    it('should call updateDoc with the given changes', async () => {
      const memorizedRef = { id: 'mem-1' } as any;
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      await service.updateMemorized(memorizedRef, { description: 'Updated' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(memorizedRef, {
        description: 'Updated',
      });
    });
  });

  describe('deleteMemorized', () => {
    it('should call deleteDoc with the memorized ref', async () => {
      const memorizedRef = { id: 'mem-1' } as any;
      vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValueOnce(undefined);

      await service.deleteMemorized(memorizedRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(memorizedRef);
    });
  });
});
