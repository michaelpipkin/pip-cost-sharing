import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Expense } from '@models/expense';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemberStore } from '@store/member.store';
import { mockDocRef as refAt } from '@testing/test-helpers';
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
    setGroupHasExpenses: vi.fn(),
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
  const mockAnalytics = {
    logEvent: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logSnapshotError: vi.fn(),
  };

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
    it('should set groupHasExpenses to true when the group has expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeExpenseDoc('exp-1', {})]) as any
      );

      await service.doesGroupHaveExpenses('group-1');

      expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledWith(true);
    });

    it('should set groupHasExpenses to false when the group has no expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([]) as any
      );

      await service.doesGroupHaveExpenses('group-1');

      expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledWith(false);
    });

    it('should not throw on error (safe fallback)', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce(
        new Error('Firestore error')
      );

      await expect(service.doesGroupHaveExpenses('group-1')).resolves.toBeUndefined();
    });

    it('should ignore a slower check for a group the user has since switched away from', async () => {
      let finishGroupA!: (snap: any) => void;
      vi.spyOn(firestoreModule, 'getDocs')
        .mockReturnValueOnce(new Promise((r) => (finishGroupA = r)) as any)
        .mockResolvedValueOnce(makeSnap([]) as any);

      const groupA = service.doesGroupHaveExpenses('group-a');
      await service.doesGroupHaveExpenses('group-b');
      finishGroupA(makeSnap([makeExpenseDoc('exp-1', {})]));
      await groupA;

      expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledTimes(1);
      expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledWith(false);
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

  describe('with path-aware references', () => {
    // Replace the blanket {} / shared-ref mocks with ones that keep the path
    // they were given, so assertions see the real collection paths, where
    // fields and document references the service builds.
    let autoIds: number;

    beforeEach(() => {
      autoIds = 0;
      vi.spyOn(firestoreModule, 'collection').mockImplementation(((
        _fs: unknown,
        path: string
      ) => ({ path })) as any);
      vi.spyOn(firestoreModule, 'doc').mockImplementation(((
        arg: any,
        path?: string
      ) =>
        typeof path === 'string'
          ? refAt(path)
          : refAt(`${arg.path}/auto-${++autoIds}`)) as any);
      vi.spyOn(storageModule, 'ref').mockImplementation(((
        _storage: unknown,
        path: string
      ) => ({ fullPath: path })) as any);
    });

    async function flushCleanup() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    describe('checkGroupHasExpenses', () => {
      it('should look at one expense of the group', async () => {
        vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
          makeSnap([makeExpenseDoc('e1', {})]) as any
        );

        await expect(service.checkGroupHasExpenses('g1')).resolves.toBe(true);

        expect(firestoreModule.collection).toHaveBeenCalledWith(
          mockFs,
          'groups/g1/expenses'
        );
        expect(firestoreModule.limit).toHaveBeenCalledWith(1);
      });

      it('should log the failure and answer false', async () => {
        vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce(
          new Error('Firestore error')
        );

        await expect(service.checkGroupHasExpenses('g1')).resolves.toBe(false);

        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'checkGroupHasExpenses',
          'Failed to check if group has expenses',
          'Firestore error'
        );
      });

      it('should log "Unknown error" for a failure that is not an Error', async () => {
        vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce('offline');

        await expect(service.checkGroupHasExpenses('g1')).resolves.toBe(false);

        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'checkGroupHasExpenses',
          'Failed to check if group has expenses',
          'Unknown error'
        );
      });
    });

    describe('getGroupExpensesByDateRange', () => {
      const memberRef = refAt('groups/g1/members/m1');
      const categoryRef = refAt('groups/g1/categories/c1');

      it('should query splits by date only and expenses by every filter, newest first, capped at 200', async () => {
        await service.getGroupExpensesByDateRange(
          'g1',
          new Date(2025, 0, 1),
          new Date(2025, 0, 31),
          true,
          memberRef,
          categoryRef
        );

        expect((firestoreModule.collection as any).mock.calls).toEqual([
          [mockFs, 'groups/g1/splits'],
          [mockFs, 'groups/g1/expenses'],
        ]);
        expect((firestoreModule.where as any).mock.calls).toEqual([
          // splits
          ['date', '>=', '2025-01-01'],
          ['date', '<=', '2025-01-31'],
          // expenses
          ['date', '>=', '2025-01-01'],
          ['date', '<=', '2025-01-31'],
          ['paid', '==', false],
          ['paidByMemberRef', '==', memberRef],
          ['categoryRef', '==', categoryRef],
        ]);
        expect(firestoreModule.orderBy).toHaveBeenCalledWith('date', 'desc');
        expect(firestoreModule.limit).toHaveBeenCalledWith(200);
      });

      it('should add no where clause when no filter is given', async () => {
        await service.getGroupExpensesByDateRange('g1');

        expect(firestoreModule.where).not.toHaveBeenCalled();
      });

      it('should build expenses with their own splits, parsed dates, category and payer', async () => {
        const e1 = refAt('groups/g1/expenses/e1');
        const e2 = refAt('groups/g1/expenses/e2');
        const payerRef = refAt('groups/g1/members/m1');
        const owerRef = refAt('groups/g1/members/m2');
        const catRef = refAt('groups/g1/categories/c1');
        const payer = { displayName: 'Ann' } as any;
        const ower = { displayName: 'Bob' } as any;
        const category = { name: 'Food' } as any;
        vi.spyOn(mockCategoryStore, 'getCategoryByRef').mockImplementation(
          (r: any) => (r === catRef ? category : undefined)
        );
        vi.spyOn(mockMemberStore, 'getMemberByRef').mockImplementation(
          (r: any) => (r === payerRef ? payer : r === owerRef ? ower : undefined)
        );
        const splitDoc = (id: string, expenseRef: any, amount: number) => ({
          id,
          data: () => ({
            expenseRef,
            date: '2025-03-04',
            categoryRef: catRef,
            paidByMemberRef: payerRef,
            owedByMemberRef: owerRef,
            allocatedAmount: amount,
            paid: false,
          }),
          ref: refAt(`groups/g1/splits/${id}`),
        });
        const expenseDoc = (id: string, ref: any, extra: object) => ({
          id,
          ref,
          data: () => ({
            date: '2025-03-04',
            description: id,
            categoryRef: catRef,
            paidByMemberRef: payerRef,
            ...extra,
          }),
        });
        vi.spyOn(firestoreModule, 'getDocs')
          .mockResolvedValueOnce(
            makeSnap([
              splitDoc('s1', e1, 10),
              splitDoc('s2', e2, 20),
              splitDoc('s3', e1, 30),
            ]) as any
          )
          .mockResolvedValueOnce(
            makeSnap([
              expenseDoc('e1', e1, { splitByPercentage: true }),
              expenseDoc('e2', e2, { splitMethod: 'shares' }),
            ]) as any
          );

        const result = await service.getGroupExpensesByDateRange('g1');
        const [first, second] = result as [Expense, Expense];

        expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
        expect(first.splits.map((s) => s.id)).toEqual(['s1', 's3']);
        expect(second.splits.map((s) => s.id)).toEqual(['s2']);
        expect(first.date).toEqual(new Date(2025, 2, 4));
        expect(first.ref).toBe(e1);
        expect(first.category).toBe(category);
        expect(first.paidByMember).toBe(payer);
        // A legacy expense with only splitByPercentage still reads as percentage.
        expect(first.splitMethod).toBe('percentage');
        expect(second.splitMethod).toBe('shares');
        const split = first.splits[0]!;
        expect(split.date).toEqual(new Date(2025, 2, 4));
        expect(split.ref?.path).toBe('groups/g1/splits/s1');
        expect(split.category).toBe(category);
        expect(split.paidByMember).toBe(payer);
        expect(split.owedByMember).toBe(ower);
      });

      it.each([
        ['categories', mockCategoryStore],
        ['members', mockMemberStore],
      ])('should wait until the %s are loaded before querying', async (_n, store) => {
        store.loaded.set(false);
        vi.useFakeTimers();
        try {
          const pending = service.getGroupExpensesByDateRange('g1');
          await vi.advanceTimersByTimeAsync(100);
          expect(firestoreModule.getDocs).not.toHaveBeenCalled();

          store.loaded.set(true);
          await vi.advanceTimersByTimeAsync(10);

          await expect(pending).resolves.toEqual([]);
          expect(firestoreModule.getDocs).toHaveBeenCalledTimes(2);
        } finally {
          vi.useRealTimers();
          store.loaded.set(true);
        }
      });
    });

    describe('getExpense', () => {
      it('should read the expense document and its splits by expense reference', async () => {
        const e1 = refAt('groups/g1/expenses/e1');
        const catRef = refAt('groups/g1/categories/c1');
        const category = { name: 'Food' } as any;
        vi.spyOn(mockCategoryStore, 'getCategoryByRef').mockImplementation(
          (r: any) => (r === catRef ? category : undefined)
        );
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          id: 'e1',
          ref: e1,
          data: () => ({
            date: '2025-06-09',
            description: 'Dinner',
            categoryRef: catRef,
            splitByPercentage: false,
          }),
        } as any);
        vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
          makeSnap([
            {
              id: 's1',
              data: () => ({ date: '2025-06-09', allocatedAmount: 12 }),
              ref: refAt('groups/g1/splits/s1'),
            },
          ]) as any
        );

        const expense = await service.getExpense('g1', 'e1');

        expect(firestoreModule.doc).toHaveBeenCalledWith(
          mockFs,
          'groups/g1/expenses/e1'
        );
        expect(firestoreModule.collection).toHaveBeenCalledWith(
          mockFs,
          '/groups/g1/splits/'
        );
        expect(firestoreModule.where).toHaveBeenCalledWith(
          'expenseRef',
          '==',
          expect.objectContaining({ path: 'groups/g1/expenses/e1' })
        );
        expect(expense.id).toBe('e1');
        expect(expense.date).toEqual(new Date(2025, 5, 9));
        expect(expense.splitMethod).toBe('amount');
        expect(expense.category).toBe(category);
        expect(expense.ref).toBe(e1);
        expect(expense.splits.map((s) => s.id)).toEqual(['s1']);
        const split = expense.splits[0]!;
        expect(split.allocatedAmount).toBe(12);
        expect(split.date).toEqual(new Date(2025, 5, 9));
        expect(split.ref?.path).toBe('groups/g1/splits/s1');
      });

      it('should log and rethrow when the expense does not exist', async () => {
        await expect(service.getExpense('g1', 'gone')).rejects.toThrow(
          'Expense not found'
        );

        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'getExpense',
          'Failed to get expense',
          'Expense not found'
        );
      });

      it('should log "Unknown error" and rethrow a failure that is not an Error', async () => {
        vi.spyOn(firestoreModule, 'getDocs').mockRejectedValueOnce('offline');

        await expect(service.getExpense('g1', 'e1')).rejects.toBe('offline');

        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'getExpense',
          'Failed to get expense',
          'Unknown error'
        );
      });

      it.each([
        ['categories', mockCategoryStore],
        ['members', mockMemberStore],
      ])('should wait until the %s are loaded before reading', async (_n, store) => {
        store.loaded.set(false);
        vi.useFakeTimers();
        try {
          const pending = service.getExpense('g1', 'e1').catch((e) => e);
          await vi.advanceTimersByTimeAsync(100);
          expect(firestoreModule.getDoc).not.toHaveBeenCalled();

          store.loaded.set(true);
          await vi.advanceTimersByTimeAsync(10);

          // The default getDoc says the expense is missing: reading happened.
          expect(((await pending) as Error).message).toBe('Expense not found');
          expect(firestoreModule.getDoc).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
          store.loaded.set(true);
        }
      });
    });

    describe('addExpense (written shapes)', () => {
      const receipt = new File(['data'], 'r.jpg', { type: 'image/jpeg' });

      it('should write the expense and each split (pointing at the expense) in one batch, then refresh the has-expenses flag', async () => {
        const expense: any = { description: 'Dinner' };
        const splits: any[] = [{ allocatedAmount: 15 }, { allocatedAmount: 15 }];
        vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
          makeSnap([makeExpenseDoc('x', {})]) as any
        );

        const result = await service.addExpense('g1', expense, splits);

        expect(firestoreModule.collection).toHaveBeenCalledWith(
          mockFs,
          '/groups/g1/expenses'
        );
        expect(result.path).toBe('/groups/g1/expenses/auto-1');
        expect(mockBatch.set).toHaveBeenCalledTimes(3);
        expect(mockBatch.set).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ path: '/groups/g1/expenses/auto-1' }),
          { description: 'Dinner' }
        );
        expect(mockBatch.set).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ path: '/groups/g1/splits/auto-2' }),
          {
            allocatedAmount: 15,
            expenseRef: expect.objectContaining({
              path: '/groups/g1/expenses/auto-1',
            }),
          }
        );
        expect(mockBatch.set).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ path: '/groups/g1/splits/auto-3' }),
          expect.objectContaining({ allocatedAmount: 15 })
        );
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledWith(true);
        expect(expense.receiptPath).toBeUndefined();
      });

      it('should upload the receipt under the new expense id, record its path and log it, before writing', async () => {
        const expense: any = {};

        await service.addExpense('g1', expense, [], receipt);

        expect(storageModule.ref).toHaveBeenCalledWith(
          mockStorage,
          'groups/g1/receipts/auto-1'
        );
        expect(storageModule.uploadBytes).toHaveBeenCalledWith(
          { fullPath: 'groups/g1/receipts/auto-1' },
          receipt
        );
        expect(expense.receiptPath).toBe('groups/g1/receipts/auto-1');
        expect(mockAnalytics.logEvent).toHaveBeenCalledWith('receipt_uploaded');
        expect(
          (storageModule.uploadBytes as any).mock.invocationCallOrder[0]
        ).toBeLessThan(mockBatch.commit.mock.invocationCallOrder[0]);
      });

      it('should delete the uploaded receipt, log the failure and rethrow when the batch fails', async () => {
        mockBatch.commit.mockRejectedValueOnce(new Error('batch error'));

        await expect(
          service.addExpense('g1', {}, [], receipt)
        ).rejects.toThrow('batch error');

        expect(storageModule.deleteObject).toHaveBeenCalledWith({
          fullPath: 'groups/g1/receipts/auto-1',
        });
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'addExpense',
          'Failed to add expense',
          'batch error'
        );
        expect(mockExpenseStore.setGroupHasExpenses).not.toHaveBeenCalled();
      });

      it.each([
        [new Error('gone'), 'gone'],
        ['denied', 'Unknown error'],
      ])('should log a failed receipt cleanup (%s)', async (failure, message) => {
        mockBatch.commit.mockRejectedValueOnce(new Error('batch error'));
        vi.spyOn(storageModule, 'deleteObject').mockRejectedValueOnce(failure);

        await expect(
          service.addExpense('g1', {}, [], receipt)
        ).rejects.toThrow('batch error');
        await flushCleanup();

        expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
          'delete_receipt_error',
          { error: message }
        );
      });

      it('should not touch Storage when the batch fails and there is no receipt', async () => {
        mockBatch.commit.mockRejectedValueOnce('offline');

        await expect(service.addExpense('g1', {}, [])).rejects.toBe('offline');

        expect(storageModule.deleteObject).not.toHaveBeenCalled();
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'addExpense',
          'Failed to add expense',
          'Unknown error'
        );
      });
    });

    describe('updateExpense', () => {
      const expenseRef = refAt('groups/g1/expenses/e1');
      const receipt = new File(['data'], 'r.jpg', { type: 'image/jpeg' });

      it('should replace the old splits with the new ones in one batch', async () => {
        const old1 = refAt('groups/g1/splits/old1');
        const old2 = refAt('groups/g1/splits/old2');
        vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
          makeSnap([{ ref: old1 }, { ref: old2 }]) as any
        );
        const changes: any = { description: 'Lunch' };
        const splits: any[] = [{ allocatedAmount: 5 }, { allocatedAmount: 7 }];

        await service.updateExpense('g1', expenseRef, changes, splits);

        expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, {
          description: 'Lunch',
        });
        expect(firestoreModule.collection).toHaveBeenCalledWith(
          mockFs,
          '/groups/g1/splits/'
        );
        expect(firestoreModule.where).toHaveBeenCalledWith(
          'expenseRef',
          '==',
          expenseRef
        );
        expect(mockBatch.delete.mock.calls).toEqual([[old1], [old2]]);
        expect(mockBatch.set).toHaveBeenCalledTimes(2);
        expect(mockBatch.set).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ path: '/groups/g1/splits/auto-1' }),
          { allocatedAmount: 5, expenseRef }
        );
        expect(mockBatch.set).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ path: '/groups/g1/splits/auto-2' }),
          { allocatedAmount: 7, expenseRef }
        );
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        expect(storageModule.uploadBytes).not.toHaveBeenCalled();
      });

      it('should upload the receipt to the expense path and save its path with the changes', async () => {
        const changes: any = {};

        await service.updateExpense('g1', expenseRef, changes, [], receipt);

        expect(storageModule.ref).toHaveBeenCalledWith(
          mockStorage,
          'groups/g1/receipts/e1'
        );
        expect(storageModule.uploadBytes).toHaveBeenCalledWith(
          { fullPath: 'groups/g1/receipts/e1' },
          receipt
        );
        expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, {
          receiptPath: 'groups/g1/receipts/e1',
        });
        expect(mockAnalytics.logEvent).toHaveBeenCalledWith('receipt_uploaded');
        expect(
          (storageModule.uploadBytes as any).mock.invocationCallOrder[0]
        ).toBeLessThan(mockBatch.commit.mock.invocationCallOrder[0]);
      });

      it.each([
        [new Error('quota'), 'quota'],
        ['denied', 'Unknown error'],
      ])('should stop before writing when the upload fails (%s)', async (failure, message) => {
        vi.spyOn(storageModule, 'uploadBytes').mockRejectedValueOnce(failure);
        const changes: any = {};

        await expect(
          service.updateExpense('g1', expenseRef, changes, [], receipt)
        ).rejects.toThrow('Failed to upload receipt');

        expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
          'receipt_upload_failed',
          { error: message }
        );
        expect(changes.receiptPath).toBeUndefined();
        expect(mockBatch.update).not.toHaveBeenCalled();
        expect(mockBatch.commit).not.toHaveBeenCalled();
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'updateExpense',
          'Failed to update expense',
          'Failed to upload receipt'
        );
      });

      // BUG (new): expense.service.ts:332 - the catch deletes
      // receipts/{expenseId} whenever a receipt was passed, even when the
      // upload itself failed and nothing new was written. That path is where an
      // existing receipt for this expense lives, so a failed replacement
      // upload deletes the receipt the expense already had (the expense doc
      // keeps pointing at it).
      it.fails('should not delete the stored receipt when the replacement upload fails', async () => {
        vi.spyOn(storageModule, 'uploadBytes').mockRejectedValueOnce(
          new Error('quota')
        );

        await expect(
          service.updateExpense('g1', expenseRef, {}, [], receipt)
        ).rejects.toThrow('Failed to upload receipt');
        await flushCleanup();

        expect(storageModule.deleteObject).not.toHaveBeenCalled();
      });

      it('should delete the uploaded receipt, log the failure and rethrow when the batch fails', async () => {
        mockBatch.commit.mockRejectedValueOnce(new Error('batch error'));

        await expect(
          service.updateExpense('g1', expenseRef, {}, [], receipt)
        ).rejects.toThrow('batch error');

        expect(storageModule.deleteObject).toHaveBeenCalledWith({
          fullPath: 'groups/g1/receipts/e1',
        });
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'updateExpense',
          'Failed to update expense',
          'batch error'
        );
      });

      it.each([
        [new Error('gone'), 'gone'],
        ['denied', 'Unknown error'],
      ])('should log a failed receipt cleanup after a batch failure (%s)', async (failure, message) => {
        mockBatch.commit.mockRejectedValueOnce(new Error('batch error'));
        vi.spyOn(storageModule, 'deleteObject').mockRejectedValueOnce(failure);

        await expect(
          service.updateExpense('g1', expenseRef, {}, [], receipt)
        ).rejects.toThrow('batch error');
        await flushCleanup();

        expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
          'delete_receipt_after_batch_failure',
          { error: message }
        );
      });

      it('should not touch Storage and log "Unknown error" when the batch fails without a receipt', async () => {
        mockBatch.commit.mockRejectedValueOnce('offline');

        await expect(
          service.updateExpense('g1', expenseRef, {}, [])
        ).rejects.toBe('offline');

        expect(storageModule.deleteObject).not.toHaveBeenCalled();
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Expense Service',
          'updateExpense',
          'Failed to update expense',
          'Unknown error'
        );
      });
    });

    describe('deleteExpense (written shapes)', () => {
      const expenseRef = refAt('groups/g1/expenses/exp-1');

      it('should read the expense, delete its splits found by expense reference plus the expense, then refresh the has-expenses flag', async () => {
        const split1 = refAt('groups/g1/splits/s1');
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          data: () => ({}),
        } as any);
        vi.spyOn(firestoreModule, 'getDocs')
          .mockResolvedValueOnce(makeSnap([{ ref: split1 }]) as any)
          .mockResolvedValueOnce(makeSnap([makeExpenseDoc('other', {})]) as any);

        await service.deleteExpense('g1', expenseRef);

        expect(firestoreModule.getDoc).toHaveBeenCalledWith(expenseRef);
        expect(firestoreModule.collection).toHaveBeenCalledWith(
          mockFs,
          '/groups/g1/splits/'
        );
        expect(firestoreModule.where).toHaveBeenCalledWith(
          'expenseRef',
          '==',
          expenseRef
        );
        expect(mockBatch.delete.mock.calls).toEqual([[split1], [expenseRef]]);
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        expect(mockExpenseStore.setGroupHasExpenses).toHaveBeenCalledWith(true);
        expect(storageModule.deleteObject).not.toHaveBeenCalled();
      });

      it('should delete the receipt at its stored path', async () => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ receiptPath: 'groups/g1/receipts/exp-1' }),
        } as any);

        await service.deleteExpense('g1', expenseRef);

        expect(storageModule.ref).toHaveBeenCalledWith(
          mockStorage,
          'groups/g1/receipts/exp-1'
        );
        expect(storageModule.deleteObject).toHaveBeenCalledWith({
          fullPath: 'groups/g1/receipts/exp-1',
        });
      });

      it('should still delete the splits and the expense when the expense doc is already gone', async () => {
        await service.deleteExpense('g1', expenseRef);

        expect(mockBatch.delete).toHaveBeenCalledWith(expenseRef);
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        expect(storageModule.deleteObject).not.toHaveBeenCalled();
      });

      it.each([
        [new Error('gone'), 'gone'],
        ['denied', 'Unknown error'],
      ])('should log, not throw, when the receipt cannot be deleted (%s)', async (failure, message) => {
        vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ receiptPath: 'groups/g1/receipts/exp-1' }),
        } as any);
        vi.spyOn(storageModule, 'deleteObject').mockRejectedValueOnce(failure);

        await expect(
          service.deleteExpense('g1', expenseRef)
        ).resolves.toBeUndefined();
        await flushCleanup();

        expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
          'delete_receipt_error',
          { error: message }
        );
      });
    });
  });
});
