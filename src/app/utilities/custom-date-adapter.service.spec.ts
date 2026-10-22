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

  // BUG (B5): src/app/utilities/custom-date-adapter.service.ts:11-15 parses
  // loosely with ['MM/DD', 'MM/DD/YYYY']; "1/5/25" matches MM/DD, the "/25" is
  // ignored, and containsYear (/\d{4}/) is false, so the year is replaced with
  // the current one (2026). A two-digit year should give 2025.
  it.fails('should read a two-digit year as that year (B5)', () => {
    expect(ymd(adapter.parse('1/5/25'))).toEqual([2025, 1, 5]);
  });
});
