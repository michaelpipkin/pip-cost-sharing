import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  AllocationUtilsService,
  AllocationInput,
  AllocationSplit,
} from './allocation-utils.service';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';

function makeSplit(
  memberRef: any,
  assignedAmount: number = 0,
  shares: number = 0
): AllocationSplit {
  return {
    owedByMemberRef: memberRef,
    assignedAmount,
    percentage: 0,
    shares,
    allocatedAmount: 0,
  };
}

describe('AllocationUtilsService', () => {
  let service: AllocationUtilsService;
  let localeService: LocaleService;
  const currentGroupSignal = signal<any>(null);

  beforeEach(() => {
    currentGroupSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        AllocationUtilsService,
        LocaleService,
        {
          provide: GroupStore,
          useValue: {
            currentGroup: currentGroupSignal,
          },
        },
      ],
    });

    service = TestBed.inject(AllocationUtilsService);
    localeService = TestBed.inject(LocaleService);
  });

  describe('empty splits', () => {
    it('should return empty splits with adjusted shared amount', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 80,
        allocatedAmount: 20,
        splits: [],
      };
      const result = service.allocateSharedAmounts(input);
      expect(result.splits).toEqual([]);
      expect(result.adjustedSharedAmount).toBe(80);
    });
  });

  describe('even split (USD)', () => {
    it('should split $100 evenly between 2 members', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 100,
        allocatedAmount: 0,
        splits: [makeSplit({ id: 'member1' }), makeSplit({ id: 'member2' })],
      };
      const result = service.allocateSharedAmounts(input);
      expect(result.splits.length).toBe(2);
      expect(result.splits[0]!.allocatedAmount).toBe(50);
      expect(result.splits[1]!.allocatedAmount).toBe(50);
      const total = result.splits.reduce(
        (sum, s) => sum + s.allocatedAmount,
        0
      );
      expect(total).toBe(100);
    });
  });

  describe('uneven split (USD)', () => {
    it('should split $100 between 3 members and total should equal $100', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 100,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }),
          makeSplit({ id: 'member2' }),
          makeSplit({ id: 'member3' }),
        ],
      };
      const result = service.allocateSharedAmounts(input);
      expect(result.splits.length).toBe(3);
      const total = localeService.roundToCurrency(
        result.splits.reduce((sum, s) => sum + s.allocatedAmount, 0)
      );
      expect(total).toBe(100);
    });
  });

  describe('removing empty splits', () => {
    it('should remove splits with no member and no assigned amount', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 100,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }),
          makeSplit(null, 0), // empty: no member, no amount
          makeSplit({ id: 'member2' }),
        ],
      };
      const result = service.allocateSharedAmounts(input);
      expect(result.splits.length).toBe(2);
    });

    it('should keep splits with assigned amount but no member', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 80,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }),
          makeSplit(null, 20), // has assigned amount, keep it
        ],
      };
      const result = service.allocateSharedAmounts(input);
      expect(result.splits.length).toBe(2);
    });
  });

  describe('with assigned amounts', () => {
    it('should incorporate assigned amounts into allocation', () => {
      const input: AllocationInput = {
        totalAmount: 100,
        sharedAmount: 60,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }, 20),
          makeSplit({ id: 'member2' }, 20),
        ],
      };
      const result = service.allocateSharedAmounts(input);
      const total = localeService.roundToCurrency(
        result.splits.reduce((sum, s) => sum + s.allocatedAmount, 0)
      );
      expect(total).toBe(100);
    });
  });

  describe('JPY currency (0 decimals)', () => {
    beforeEach(() => {
      localeService.setGroupCurrency('JPY');
    });

    it('should allocate whole numbers', () => {
      const input: AllocationInput = {
        totalAmount: 1000,
        sharedAmount: 1000,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }),
          makeSplit({ id: 'member2' }),
          makeSplit({ id: 'member3' }),
        ],
      };
      const result = service.allocateSharedAmounts(input);
      result.splits.forEach((split) => {
        expect(Number.isInteger(split.allocatedAmount)).toBe(true);
      });
      const total = result.splits.reduce(
        (sum, s) => sum + s.allocatedAmount,
        0
      );
      expect(total).toBe(1000);
    });
  });

  describe('rounding adjustment', () => {
    it('should adjust rounding so total matches exactly', () => {
      const input: AllocationInput = {
        totalAmount: 99.99,
        sharedAmount: 99.99,
        allocatedAmount: 0,
        splits: [
          makeSplit({ id: 'member1' }),
          makeSplit({ id: 'member2' }),
          makeSplit({ id: 'member3' }),
        ],
      };
      const result = service.allocateSharedAmounts(input);
      const total = localeService.roundToCurrency(
        result.splits.reduce((sum, s) => sum + s.allocatedAmount, 0)
      );
      expect(total).toBe(99.99);
    });
  });

  describe('allocateByPercentage', () => {
    it('should return empty splits when input has no splits', () => {
      const result = service.allocateByPercentage({ totalAmount: 100, splits: [] });
      expect(result.splits).toEqual([]);
    });

    it('should allocate 30/30/40 percentages on $100', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 30, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 30, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member3' }, assignedAmount: 0, percentage: 40, shares: 0, allocatedAmount: 0 },
      ];
      const result = service.allocateByPercentage({ totalAmount: 100, splits });
      expect(result.splits[0]!.allocatedAmount).toBe(30);
      expect(result.splits[1]!.allocatedAmount).toBe(30);
      expect(result.splits[2]!.allocatedAmount).toBe(40);
    });

    it('should auto-balance last row percentage to 100', () => {
      // First two are set; last row should be auto-calculated to 100 - 70 = 30
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 40, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 30, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member3' }, assignedAmount: 0, percentage: 0, shares: 0, allocatedAmount: 0 },
      ];
      const result = service.allocateByPercentage({ totalAmount: 100, splits });
      expect(result.splits[2]!.percentage).toBe(30);
      expect(result.splits[2]!.allocatedAmount).toBe(30);
    });

    it('should ensure allocated amounts sum to total amount', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 33, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 33, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member3' }, assignedAmount: 0, percentage: 34, shares: 0, allocatedAmount: 0 },
      ];
      const result = service.allocateByPercentage({ totalAmount: 100, splits });
      const total = localeService.roundToCurrency(
        result.splits.reduce((sum, s) => sum + s.allocatedAmount, 0)
      );
      expect(total).toBe(100);
    });
  });

  describe('allocateByShares', () => {
    it('should return empty splits when input has no splits', () => {
      const result = service.allocateByShares({ totalAmount: 100, splits: [] });
      expect(result.splits).toEqual([]);
    });

    it('should allocate $100 with integer ratios [1, 1, 2] → [25, 25, 50]', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 0, shares: 1, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 0, shares: 1, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member3' }, assignedAmount: 0, percentage: 0, shares: 2, allocatedAmount: 0 },
      ];
      const result = service.allocateByShares({ totalAmount: 100, splits });
      expect(result.splits[0]!.allocatedAmount).toBe(25);
      expect(result.splits[1]!.allocatedAmount).toBe(25);
      expect(result.splits[2]!.allocatedAmount).toBe(50);
    });

    it('should allocate $100 with decimal ratios [1.5, 1, 1] and total correctly', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 0, shares: 1.5, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 0, shares: 1, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member3' }, assignedAmount: 0, percentage: 0, shares: 1, allocatedAmount: 0 },
      ];
      const result = service.allocateByShares({ totalAmount: 100, splits });
      const total = localeService.roundToCurrency(
        result.splits.reduce((sum, s) => sum + s.allocatedAmount, 0)
      );
      expect(total).toBe(100);
    });

    it('should return zero allocations when all shares are zero', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 0, shares: 0, allocatedAmount: 0 },
        { owedByMemberRef: { id: 'member2' }, assignedAmount: 0, percentage: 0, shares: 0, allocatedAmount: 0 },
      ];
      const result = service.allocateByShares({ totalAmount: 100, splits });
      expect(result.splits[0]!.allocatedAmount).toBe(0);
      expect(result.splits[1]!.allocatedAmount).toBe(0);
    });

    it('should allocate full amount to single member', () => {
      const splits: AllocationSplit[] = [
        { owedByMemberRef: { id: 'member1' }, assignedAmount: 0, percentage: 0, shares: 5, allocatedAmount: 0 },
      ];
      const result = service.allocateByShares({ totalAmount: 75, splits });
      expect(result.splits[0]!.allocatedAmount).toBe(75);
    });
  });
});
