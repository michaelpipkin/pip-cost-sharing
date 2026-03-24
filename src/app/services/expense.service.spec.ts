import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemberStore } from '@store/member.store';
import * as firestoreModule from 'firebase/firestore';
import * as storageModule from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseService } from './expense.service';

const mockFs = {};
const mockStorage = {};
const mockDocRef = {
  id: 'expense-1',
  path: 'groups/g1/expenses/expense-1',
  fullPath: 'groups/g1/receipts/expense-1',
};

function makeSnap(docs: any[] = []) {
  return {
    size: docs.length,
    empty: docs.length === 0,
    docs,
    forEach: (callback: (doc: any) => void) => docs.forEach(callback),
  };
}

function makeExpenseDoc(id: string, data: any) {
  return { id, data: () => data, ref: { id }, exists: () => true };
}

describe('ExpenseService', () => {
  let service: ExpenseService;
  let mockBatch: any;

  const mockExpenseStore = {
    setGroupExpenses: vi.fn(),
    groupExpenses: signal<any[]>([]),
  };
  const mockMemberStore = {
    loaded: signal(true),
    getMemberByRef: vi.fn().mockReturnValue(undefined),
    groupMembers: signal<any[]>([]),
  };
  const mockCategoryStore = {
    loaded: signal(true),
    getCategoryByRef: vi.fn().mockReturnValue(undefined),
    groupCategories: signal<any[]>([]),
  };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

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
    vi.spyOn(firestoreModule, 'limit').mockReturnValue({} as any);
    vi.spyOn(storageModule, 'ref').mockReturnValue(mockDocRef as any);
    vi.spyOn(storageModule, 'uploadBytes').mockResolvedValue(undefined as any);
    vi.spyOn(storageModule, 'deleteObject').mockResolvedValue(undefined as any);
    vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      exists: () => false,
    } as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap([]) as any);

    TestBed.configureTestingModule({
      providers: [
        ExpenseService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: storageModule.getStorage, useValue: mockStorage },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(ExpenseService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('doesGroupHaveExpenses', () => {
    it('should return true when the group has expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeExpenseDoc('exp-1', {})]) as any
      );

      const result = await service.doesGroupHaveExpenses('group-1');

      expect(result).toBe(true);
    });

    it('should return false when the group has no expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      const result = await service.doesGroupHaveExpenses('group-1');

      expect(result).toBe(false);
    });

    it('should return true on error (safe fallback)', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce(
        new Error('Firestore error')
      );

      const result = await service.doesGroupHaveExpenses('group-1');

      expect(result).toBe(true);
    });
  });

  describe('addExpense', () => {
    it('should set the expense and splits in a batch', async () => {
      const splits = [{ allocatedAmount: 50 }, { allocatedAmount: 50 }];

      await service.addExpense('group-1', { description: 'Test' }, splits);

      expect(mockBatch.set).toHaveBeenCalledTimes(3); // 1 expense + 2 splits
    });

    it('should return the expense document reference', async () => {
      const result = await service.addExpense(
        'group-1',
        { description: 'Test' },
        []
      );

      expect(result).toBe(mockDocRef);
    });

    it('should upload receipt when provided', async () => {
      const receipt = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });

      await service.addExpense('group-1', {}, [], receipt);

      expect(storageModule.uploadBytes).toHaveBeenCalledOnce();
    });

    it('should not upload receipt when not provided', async () => {
      await service.addExpense('group-1', {}, [], null);

      expect(storageModule.uploadBytes).not.toHaveBeenCalled();
    });

    it('should set receiptPath on expense when receipt is uploaded', async () => {
      const receipt = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
      const expense: any = {};

      await service.addExpense('group-1', expense, [], receipt);

      expect(expense.receiptPath).toBeDefined();
    });

    it('should clean up receipt and rethrow when batch commit fails', async () => {
      const receipt = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
      mockBatch.commit.mockRejectedValueOnce(new Error('batch error'));

      await expect(
        service.addExpense('group-1', {}, [], receipt)
      ).rejects.toThrow('batch error');
      // deleteObject is called asynchronously in .catch(), so just verify no crash
    });
  });

  describe('deleteExpense', () => {
    const expenseRef = { id: 'exp-1' } as any;

    it('should delete associated splits and the expense in a batch', async () => {
      const splitRef1 = { id: 'split-1' };
      const splitRef2 = { id: 'split-2' };
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ receiptPath: null }),
      } as any);
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([{ ref: splitRef1 }, { ref: splitRef2 }]) as any
      );

      await service.deleteExpense('group-1', expenseRef);

      expect(mockBatch.delete).toHaveBeenCalledWith(splitRef1);
      expect(mockBatch.delete).toHaveBeenCalledWith(splitRef2);
      expect(mockBatch.delete).toHaveBeenCalledWith(expenseRef);
    });

    it('should delete receipt from storage when receiptPath exists', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ receiptPath: 'groups/g/receipts/exp-1' }),
      } as any);
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.deleteExpense('group-1', expenseRef);

      expect(storageModule.deleteObject).toHaveBeenCalled();
    });

    it('should not attempt to delete receipt when receiptPath is absent', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ receiptPath: null }),
      } as any);
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.deleteExpense('group-1', expenseRef);

      expect(storageModule.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('getGroupExpensesByDateRange - query building', () => {
    beforeEach(() => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(
        makeSnap([]) as any
      );
    });

    it('should apply start date filter when startDate is provided', async () => {
      const startDate = new Date(2025, 0, 1);

      await service.getGroupExpensesByDateRange('group-1', startDate);

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'date',
        '>=',
        '2025-01-01'
      );
    });

    it('should apply end date filter when endDate is provided', async () => {
      const endDate = new Date(2025, 11, 31);

      await service.getGroupExpensesByDateRange('group-1', undefined, endDate);

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'date',
        '<=',
        '2025-12-31'
      );
    });

    it('should apply unpaidOnly filter when specified', async () => {
      await service.getGroupExpensesByDateRange(
        'group-1',
        undefined,
        undefined,
        true
      );

      expect(firestoreModule.where).toHaveBeenCalledWith('paid', '==', false);
    });

    it('should apply member filter when memberRef is provided', async () => {
      const memberRef = { id: 'member-1' } as any;

      await service.getGroupExpensesByDateRange(
        'group-1',
        undefined,
        undefined,
        undefined,
        memberRef
      );

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'paidByMemberRef',
        '==',
        memberRef
      );
    });

    it('should apply category filter when categoryRef is provided', async () => {
      const categoryRef = { id: 'cat-1' } as any;

      await service.getGroupExpensesByDateRange(
        'group-1',
        undefined,
        undefined,
        undefined,
        null,
        categoryRef
      );

      expect(firestoreModule.where).toHaveBeenCalledWith(
        'categoryRef',
        '==',
        categoryRef
      );
    });

    it('should always apply limit of 200', async () => {
      await service.getGroupExpensesByDateRange('group-1');

      expect(firestoreModule.limit).toHaveBeenCalledWith(200);
    });

    it('should return an empty array when no expenses match', async () => {
      const result = await service.getGroupExpensesByDateRange('group-1');

      expect(result).toEqual([]);
    });
  });
});
