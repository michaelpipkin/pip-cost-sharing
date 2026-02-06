import { describe, it, expect } from 'vitest';
import { SortingService } from './sorting.service';

describe('SortingService', () => {
  const service = new SortingService();

  describe('string sorting', () => {
    it('should sort strings ascending (case-insensitive)', () => {
      const data = [{ name: 'Charlie' }, { name: 'alice' }, { name: 'Bob' }];
      const result = service.sort(data, 'name', true);
      expect(result.map((d) => d.name)).toEqual(['alice', 'Bob', 'Charlie']);
    });

    it('should sort strings descending (case-insensitive)', () => {
      const data = [{ name: 'Charlie' }, { name: 'alice' }, { name: 'Bob' }];
      const result = service.sort(data, 'name', false);
      expect(result.map((d) => d.name)).toEqual(['Charlie', 'Bob', 'alice']);
    });

    it('should handle equal strings', () => {
      const data = [{ name: 'Alice' }, { name: 'alice' }];
      const result = service.sort(data, 'name', true);
      expect(result.length).toBe(2);
    });
  });

  describe('numeric sorting', () => {
    it('should sort numbers ascending', () => {
      const data = [{ amount: 30 }, { amount: 10 }, { amount: 20 }];
      const result = service.sort(data, 'amount', true);
      expect(result.map((d) => d.amount)).toEqual([10, 20, 30]);
    });

    it('should sort numbers descending', () => {
      const data = [{ amount: 30 }, { amount: 10 }, { amount: 20 }];
      const result = service.sort(data, 'amount', false);
      expect(result.map((d) => d.amount)).toEqual([30, 20, 10]);
    });

    it('should handle negative numbers', () => {
      const data = [{ val: -1 }, { val: 5 }, { val: -10 }];
      const result = service.sort(data, 'val', true);
      expect(result.map((d) => d.val)).toEqual([-10, -1, 5]);
    });
  });

  it('should return the same array reference (mutating sort)', () => {
    const data = [{ name: 'B' }, { name: 'A' }];
    const result = service.sort(data, 'name', true);
    expect(result).toBe(data);
  });
});
