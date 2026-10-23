import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomDateAdapter } from './custom-date-adapter.service';

describe('CustomDateAdapter', () => {
  let adapter: CustomDateAdapter;

  const ymd = (date: Date | null): number[] | null =>
    date && [date.getFullYear(), date.getMonth() + 1, date.getDate()];

  beforeEach(() => {
    // Only Date is faked, so moment() sees the fixed "now" and nothing else
    // (Angular's scheduler included) is affected.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15));
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DATE_LOCALE, useValue: 'en-US' }],
    });
    adapter = TestBed.inject(CustomDateAdapter);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be an Angular Material DateAdapter', () => {
    expect(adapter).toBeInstanceOf(DateAdapter);
  });

  it('should assume the current year when only month and day are typed', () => {
    expect(ymd(adapter.parse('3/17'))).toEqual([2026, 3, 17]);
  });

  it('should accept a trailing separator and assume the current year', () => {
    expect(ymd(adapter.parse('3/17/'))).toEqual([2026, 3, 17]);
    expect(ymd(adapter.parse('3-17-'))).toEqual([2026, 3, 17]);
    expect(ymd(adapter.parse('3.17.'))).toEqual([2026, 3, 17]);
  });

  it('should use the clock year, not a hard-coded one', () => {
    vi.setSystemTime(new Date(2031, 0, 2));
    expect(ymd(adapter.parse('3/17'))).toEqual([2031, 3, 17]);
  });

  it('should keep an explicit four-digit year', () => {
    expect(ymd(adapter.parse('03/17/2025'))).toEqual([2025, 3, 17]);
  });

  it('should return null for an empty string', () => {
    expect(adapter.parse('')).toBeNull();
  });

  it('should return an invalid date for text that is not a date', () => {
    // Material's DateAdapter contract: null only for empty input, an invalid
    // Date (which the datepicker input reports as a parse error) otherwise.
    const result = adapter.parse('abc');
    expect(result).toBeInstanceOf(Date);
    expect(adapter.isValid(result as Date)).toBe(false);
  });

  // Regression for B5: "1/5/25" used to match MM/DD with the "/25" ignored, so
  // the year became the current one (2026) instead of 2025.
  it('should read a two-digit year as that year (B5)', () => {
    expect(ymd(adapter.parse('1/5/25'))).toEqual([2025, 1, 5]);
  });

  it('should read a high two-digit year as the 1900s', () => {
    expect(ymd(adapter.parse('1/5/99'))).toEqual([1999, 1, 5]);
  });

  it('should read a low two-digit year as the 2000s (moment pivot at 68/69)', () => {
    expect(ymd(adapter.parse('12/31/30'))).toEqual([2030, 12, 31]);
    expect(ymd(adapter.parse('1/1/68'))).toEqual([2068, 1, 1]);
    expect(ymd(adapter.parse('1/1/69'))).toEqual([1969, 1, 1]);
  });

  it('should read the two-digit year 00 as 2000', () => {
    expect(ymd(adapter.parse('1/5/00'))).toEqual([2000, 1, 5]);
  });

  it.each([
    ['-', '3-17-25', [2025, 3, 17]],
    ['.', '3.17.25', [2025, 3, 17]],
    ['-', '3-17', [2026, 3, 17]],
    ['.', '3.17.2025', [2025, 3, 17]],
  ])('should accept the %s separator in %s', (_sep, text, expected) => {
    expect(ymd(adapter.parse(text))).toEqual(expected);
  });

  it('should return an invalid date for a one-digit year (1/5/2)', () => {
    const result = adapter.parse('1/5/2');
    expect(result).toBeInstanceOf(Date);
    expect(adapter.isValid(result as Date)).toBe(false);
  });

  it('should return an invalid date, not roll over, for an impossible date with a two-digit year', () => {
    const result = adapter.parse('2/30/25');
    expect(result).toBeInstanceOf(Date);
    expect(adapter.isValid(result as Date)).toBe(false);
  });

  it('should return an invalid date for an impossible month and day without a year', () => {
    expect(adapter.isValid(adapter.parse('2/30') as Date)).toBe(false);
    expect(adapter.isValid(adapter.parse('13/1') as Date)).toBe(false);
  });

  it('should accept a leap day only in a leap year', () => {
    expect(ymd(adapter.parse('2/29/24'))).toEqual([2024, 2, 29]);
    expect(adapter.isValid(adapter.parse('2/29/25') as Date)).toBe(false);
  });
});
