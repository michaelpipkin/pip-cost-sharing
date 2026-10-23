import { describe, expect, it } from 'vitest';
import { parseDate, toIsoFormat } from './date-utils';

describe('date-utils', () => {
  describe('toIsoFormat', () => {
    it('should zero-pad the month and day', () => {
      expect(toIsoFormat(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('should format the last day of the year', () => {
      expect(toIsoFormat(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('should use the local calendar date, not the UTC one', () => {
      // 23:59 local is still the same local day whatever the UTC offset.
      expect(toIsoFormat(new Date(2026, 5, 15, 23, 59, 59))).toBe(
        '2026-06-15'
      );
      expect(toIsoFormat(new Date(2026, 5, 15, 0, 0, 1))).toBe('2026-06-15');
    });
  });

  describe('parseDate', () => {
    it('should return local midnight of the given day', () => {
      const date = parseDate('2026-03-09');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(2);
      expect(date.getDate()).toBe(9);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });

    it('should round-trip a leap day through toIsoFormat', () => {
      expect(toIsoFormat(parseDate('2024-02-29'))).toBe('2024-02-29');
      expect(parseDate('2024-02-29').getDate()).toBe(29);
    });

    it('should round-trip a date built from parts', () => {
      const date = new Date(2026, 11, 31);
      expect(parseDate(toIsoFormat(date)).getTime()).toBe(date.getTime());
    });

    it('should give an Invalid Date for garbage input', () => {
      expect(Number.isNaN(parseDate('garbage').getTime())).toBe(true);
    });
  });
});
