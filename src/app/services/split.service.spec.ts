import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import '@app/extensions/date-extensions';
import { SplitService } from './split.service';
import { SplitStore } from '@store/split.store';
import { AnalyticsService } from '@services/analytics.service';

const mockFs = {};

function makeSnap(docs: any[]) {
  return { docs, size: docs.length };
}

function makeDoc(id: string, data: any, refOverride?: any) {
  return {
    id,
    data: () => data,
    ref: refOverride ?? { id, eq: (other: any) => other?.id === id },
  };
}

describe('SplitService', () => {
  let service: SplitService;
  let mockBatch: ReturnType<typeof makeMockBatch>;

  const mockSplitStore = { setSplits: vi.fn(), unpaidSplits: signal<any[]>([]) };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  function makeMockBatch() {
    return {
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    mockBatch = makeMockBatch();

    vi.spyOn(firestoreModule, 'collection').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'query').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'doc').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap([]) as any);
    vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(mockBatch as any);

    TestBed.configureTestingModule({
      providers: [
        SplitService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: SplitStore, useValue: mockSplitStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(SplitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateSplit - expense paid status determination', () => {
    const expenseRef = { id: 'exp-1' } as any;
    const splitRef = { id: 'split-1', eq: (other: any) => other?.id === 'split-1' } as any;

    it('should mark expense as paid when all other splits are already paid and this split is being paid', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([
          makeDoc('split-1', { paid: false }, splitRef), // current split (excluded)
          makeDoc('split-2', { paid: true }),              // other split already paid
        ]) as any,
      );

      await service.updateSplit('group-1', expenseRef, splitRef, { paid: true });

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: true });
    });

    it('should not mark expense as paid when other splits are still unpaid', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([
          makeDoc('split-1', { paid: false }, splitRef),
          makeDoc('split-2', { paid: false }), // another unpaid split
        ]) as any,
      );

      await service.updateSplit('group-1', expenseRef, splitRef, { paid: true });

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: false });
    });

    it('should mark expense as unpaid when marking a split as unpaid', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(makeSnap([makeDoc('split-1', { paid: true }, splitRef)]) as any);

      await service.updateSplit('group-1', expenseRef, splitRef, { paid: false });

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: false });
    });

    it('should update the split in the batch', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(makeSnap([makeDoc('split-1', { paid: false }, splitRef)]) as any);

      await service.updateSplit('group-1', expenseRef, splitRef, { paid: true });

      expect(mockBatch.update).toHaveBeenCalledWith(splitRef, { paid: true });
    });
  });

  describe('paySplitsBetweenMembers - expense deduplication', () => {
    const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' } as any;

    it('should mark the expense as paid when all its splits will be paid', async () => {
      const splits = [
        { id: 'split-1', expenseRef } as any,
      ];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDoc('split-1', { paid: false })]) as any,
      );

      await service.paySplitsBetweenMembers('group-1', splits, {} as any);

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: true });
    });

    it('should not mark expense as paid when other splits remain unpaid', async () => {
      const splits = [{ id: 'split-1', expenseRef } as any];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([
          makeDoc('split-1', { paid: false }),
          makeDoc('split-2', { paid: false }), // unpaid other split
        ]) as any,
      );

      await service.paySplitsBetweenMembers('group-1', splits, {} as any);

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: false });
    });

    it('should add a history record', async () => {
      const splits = [{ id: 'split-1', expenseRef } as any];
      const historyDocRef = { id: 'new-hist' };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(makeSnap([makeDoc('split-1', { paid: false })]) as any);
      vi.spyOn(firestoreModule, 'doc').mockReturnValue(historyDocRef as any);

      const history = { totalPaid: 50 };
      await service.paySplitsBetweenMembers('group-1', splits, history as any);

      expect(mockBatch.set).toHaveBeenCalledWith(historyDocRef, history);
    });
  });

  describe('settleGroup - expense deduplication', () => {
    it('should deduplicate expense refs across splits', async () => {
      const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' } as any;
      const splits = [
        { id: 'split-1', expenseRef } as any,
        { id: 'split-2', expenseRef } as any, // same expense
      ];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDoc('split-1', { paid: false }), makeDoc('split-2', { paid: false })]) as any,
      );

      await service.settleGroup('group-1', splits, []);

      // expenseRef update should only be called once per unique expense
      const expenseUpdates = mockBatch.update.mock.calls.filter((c: any[]) => c[0] === expenseRef);
      expect(expenseUpdates).toHaveLength(1);
    });

    it('should mark expense as paid when all splits are in the settle batch', async () => {
      const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' } as any;
      const splits = [{ id: 'split-1', expenseRef } as any];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap([makeDoc('split-1', { paid: false })]) as any,
      );

      await service.settleGroup('group-1', splits, []);

      expect(mockBatch.update).toHaveBeenCalledWith(expenseRef, { paid: true });
    });

    it('should create a history record for each transfer', async () => {
      const expenseRef = { id: 'exp-1', path: 'groups/g/expenses/exp-1' } as any;
      const splits = [{ id: 'split-1', expenseRef } as any];
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(makeSnap([makeDoc('split-1', { paid: false })]) as any);

      const historyDocRef = { id: 'new-hist' };
      vi.spyOn(firestoreModule, 'doc').mockReturnValue(historyDocRef as any);

      const transfers = [
        { owedByMemberRef: 'ref-a', owedToMemberRef: 'ref-b', amount: 30 },
        { owedByMemberRef: 'ref-c', owedToMemberRef: 'ref-d', amount: 20 },
      ] as any;

      await service.settleGroup('group-1', splits, transfers);

      expect(mockBatch.set).toHaveBeenCalledTimes(2);
    });
  });
});
