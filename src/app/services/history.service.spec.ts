import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import { HistoryService } from './history.service';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { AnalyticsService } from '@services/analytics.service';

const mockFs = {};

describe('HistoryService', () => {
  let service: HistoryService;

  const mockHistoryStore = {
    setHistory: vi.fn(),
    groupHistory: signal<any[]>([]),
  };
  const mockMemberStore = {
    loaded: signal(true),
    groupMembers: signal<any[]>([]),
    getMemberByRef: vi.fn(),
  };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  function makeMockBatch() {
    return {
      update: vi.fn(),
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.spyOn(firestoreModule, 'collection').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'query').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'orderBy').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
      data: () => ({}),
    } as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({ docs: [] } as any);
    vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(
      makeMockBatch() as any
    );

    TestBed.configureTestingModule({
      providers: [
        HistoryService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(HistoryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('unpayHistory', () => {
    it('should mark all splits as unpaid in a batch', async () => {
      const splitRef1 = { id: 'split-1', path: 'groups/g/splits/split-1' };
      const splitRef2 = { id: 'split-2', path: 'groups/g/splits/split-2' };
      const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' };
      const historyRef = { id: 'hist-1' };

      const mockBatch = {
        update: vi.fn(),
        delete: vi.fn(),
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);

      vi.spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce({ data: () => ({ expenseRef }) } as any)
        .mockResolvedValueOnce({ data: () => ({ expenseRef }) } as any);

      await service.unpayHistory({
        splitsPaid: [splitRef1, splitRef2],
        ref: historyRef,
      } as any);

      expect(mockBatch.update).toHaveBeenCalledWith(splitRef1, { paid: false });
      expect(mockBatch.update).toHaveBeenCalledWith(splitRef2, { paid: false });
    });

    it('should mark each unique related expense as unpaid', async () => {
      const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' };
      const splitRef1 = { id: 's1', path: 'groups/g/splits/s1' };
      const splitRef2 = { id: 's2', path: 'groups/g/splits/s2' };

      const mockBatch = {
        update: vi.fn(),
        delete: vi.fn(),
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);

      // Both splits belong to the same expense
      vi.spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce({ data: () => ({ expenseRef }) } as any)
        .mockResolvedValueOnce({ data: () => ({ expenseRef }) } as any);

      await service.unpayHistory({
        splitsPaid: [splitRef1, splitRef2],
        ref: { id: 'hist-1' },
      } as any);

      // expenseRef should only be updated once (de-duplicated by path)
      const expenseUpdateCalls = mockBatch.update.mock.calls.filter(
        (call) => call[0] === expenseRef
      );
      expect(expenseUpdateCalls).toHaveLength(1);
    });

    it('should delete the history record', async () => {
      const expenseRef = { id: 'exp-1', path: 'g/e/exp-1' };
      const historyRef = { id: 'hist-1' };

      const mockBatch = {
        update: vi.fn(),
        delete: vi.fn(),
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValueOnce({
        data: () => ({ expenseRef }),
      } as any);

      await service.unpayHistory({
        splitsPaid: [{ id: 's1', path: 'x' }],
        ref: historyRef,
      } as any);

      expect(mockBatch.delete).toHaveBeenCalledWith(historyRef);
    });
  });

  describe('unpaySingleSplitFromHistory', () => {
    const splitRef = {
      id: 'split-1',
      eq: (other: any) => other.id === 'split-1',
    } as any;
    const expenseRef = { id: 'exp-1' } as any;
    const historyRef = { id: 'hist-1' } as any;

    let mockBatch: any;

    beforeEach(() => {
      mockBatch = {
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);
    });

    it('should mark the split and expense as unpaid', async () => {
      const otherRef = { id: 'split-2', eq: () => false };
      await service.unpaySingleSplitFromHistory(
        splitRef,
        expenseRef,
        {
          splitsPaid: [splitRef, otherRef],
          totalPaid: 100,
          ref: historyRef,
        } as any,
        25,
        true
      );

      expect(mockBatch.update).toHaveBeenCalledWith(splitRef, { paid: false });
      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, {
        paid: false,
      });
    });

    it('should delete the history record when removing the last split', async () => {
      await service.unpaySingleSplitFromHistory(
        splitRef,
        expenseRef,
        { splitsPaid: [splitRef], totalPaid: 100, ref: historyRef } as any,
        100,
        true
      );

      expect(mockBatch.delete).toHaveBeenCalledWith(historyRef);
      expect(mockBatch.update).not.toHaveBeenCalledWith(
        historyRef,
        expect.anything()
      );
    });

    it('should subtract the split amount from totalPaid for positive direction', async () => {
      const otherRef = { id: 'split-2', eq: () => false };
      await service.unpaySingleSplitFromHistory(
        splitRef,
        expenseRef,
        {
          splitsPaid: [splitRef, otherRef],
          totalPaid: 100,
          ref: historyRef,
        } as any,
        25,
        true
      );

      const historyUpdateCall = mockBatch.update.mock.calls.find(
        (call: any[]) => call[0] === historyRef
      );
      expect(historyUpdateCall![1].totalPaid).toBe(75); // 100 - 25
    });

    it('should add the split amount to totalPaid for negative direction', async () => {
      const otherRef = { id: 'split-2', eq: () => false };
      await service.unpaySingleSplitFromHistory(
        splitRef,
        expenseRef,
        {
          splitsPaid: [splitRef, otherRef],
          totalPaid: -75,
          ref: historyRef,
        } as any,
        25,
        false
      );

      const historyUpdateCall = mockBatch.update.mock.calls.find(
        (call: any[]) => call[0] === historyRef
      );
      expect(historyUpdateCall![1].totalPaid).toBe(-50); // -75 + 25
    });

    it('should remove only the target split from splitsPaid', async () => {
      const otherRef = { id: 'split-2', eq: () => false };
      await service.unpaySingleSplitFromHistory(
        splitRef,
        expenseRef,
        {
          splitsPaid: [splitRef, otherRef],
          totalPaid: 100,
          ref: historyRef,
        } as any,
        25,
        true
      );

      const historyUpdateCall = mockBatch.update.mock.calls.find(
        (call: any[]) => call[0] === historyRef
      );
      expect(historyUpdateCall![1].splitsPaid).toEqual([otherRef]);
    });
  });

  describe('unpayGroupSettle', () => {
    let mockBatch: any;

    beforeEach(() => {
      mockBatch = makeMockBatch();
      vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);
    });

    it('should delete all history records in the batch', async () => {
      const histRef1 = { id: 'h1' };
      const histRef2 = { id: 'h2' };

      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          { ref: histRef1, data: () => ({ splitsPaid: [] }) },
          { ref: histRef2, data: () => ({ splitsPaid: [] }) },
        ],
      } as any);

      await service.unpayGroupSettle('group-1', 'batch-abc');

      expect(mockBatch.delete).toHaveBeenCalledWith(histRef1);
      expect(mockBatch.delete).toHaveBeenCalledWith(histRef2);
    });

    it('should mark de-duplicated splits and expenses as unpaid', async () => {
      const splitRef = { path: 'groups/g/splits/s1', id: 's1' };
      const expenseRef = { path: 'groups/g/expenses/e1', id: 'e1' };
      const histRef = { id: 'h1' };

      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          // Two records with the same split ref (should be de-duplicated)
          { ref: histRef, data: () => ({ splitsPaid: [splitRef, splitRef] }) },
        ],
      } as any);
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue({
        exists: () => true,
        data: () => ({ expenseRef }),
      } as any);

      await service.unpayGroupSettle('group-1', 'batch-1');

      const splitUpdateCalls = mockBatch.update.mock.calls.filter(
        (c: any[]) => c[0] === splitRef
      );
      expect(splitUpdateCalls).toHaveLength(1); // de-duplicated
      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, {
        paid: false,
      });
    });

    it('should only delete history records for old-style records with empty splitsPaid', async () => {
      const histRef = { id: 'h1' };

      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [{ ref: histRef, data: () => ({ splitsPaid: [] }) }],
      } as any);

      await service.unpayGroupSettle('group-1', 'batch-old');

      expect(mockBatch.delete).toHaveBeenCalledWith(histRef);
      // No split or expense updates since splitsPaid is empty
      expect(mockBatch.update).not.toHaveBeenCalled();
    });
  });
});
