import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LocaleService } from './locale.service';
import { GroupStore } from '@store/group.store';

describe('LocaleService', () => {
  let service: LocaleService;
  const currentGroupSignal = signal<any>(null);

  beforeEach(() => {
    currentGroupSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        LocaleService,
        {
          provide: GroupStore,
          useValue: {
            currentGroup: currentGroupSignal,
          },
        },
      ],
    });

    service = TestBed.inject(LocaleService);
  });

  describe('default USD currency', () => {
    it('should format currency with dollar sign prefix', () => {
      expect(service.formatCurrency(1234.56)).toBe('$ 1,234.56');
    });

    it('should format zero', () => {
      expect(service.formatCurrency(0)).toBe('$ 0.00');
    });

    it('should format negative values', () => {
      expect(service.formatCurrency(-50.25)).toBe('-$ 50.25');
    });

    it('should round to 2 decimal places', () => {
      expect(service.roundToCurrency(1.006)).toBe(1.01);
      expect(service.roundToCurrency(1.004)).toBe(1);
      expect(service.roundToCurrency(99.99)).toBe(99.99);
    });

    it('should return smallest increment of 0.01', () => {
      expect(service.getSmallestIncrement()).toBe(0.01);
    });

    it('should return formatted zero as 0.00', () => {
      expect(service.getFormattedZero()).toBe('0.00');
    });

    it('should return decimal format 1.2-2', () => {
      expect(service.getDecimalFormat()).toBe('1.2-2');
    });
  });

  describe('JPY currency (0 decimals)', () => {
    beforeEach(() => {
      service.setGroupCurrency('JPY');
    });

    it('should format with yen symbol and no decimals', () => {
      expect(service.formatCurrency(1234)).toBe('¥ 1,234');
    });

    it('should round to whole numbers', () => {
      expect(service.roundToCurrency(1234.56)).toBe(1235);
    });

    it('should return smallest increment of 1', () => {
      expect(service.getSmallestIncrement()).toBe(1);
    });

    it('should return formatted zero as 0', () => {
      expect(service.getFormattedZero()).toBe('0');
    });

    it('should return decimal format 1.0-0', () => {
      expect(service.getDecimalFormat()).toBe('1.0-0');
    });
  });

  describe('EUR currency (comma decimal)', () => {
    beforeEach(() => {
      service.setGroupCurrency('EUR');
    });

    it('should format with euro symbol, dot thousands, comma decimal', () => {
      expect(service.formatCurrency(1234.56)).toBe('€ 1.234,56');
    });

    it('should format small amounts', () => {
      expect(service.formatCurrency(0.99)).toBe('€ 0,99');
    });

    it('should return formatted zero as 0,00', () => {
      expect(service.getFormattedZero()).toBe('0,00');
    });
  });

  describe('SEK currency (suffix + space thousands)', () => {
    beforeEach(() => {
      service.setGroupCurrency('SEK');
    });

    it('should format with kr suffix and space thousands separator', () => {
      expect(service.formatCurrency(1234.56)).toBe('1 234,56 kr');
    });

    it('should return formatted zero as 0,00', () => {
      expect(service.getFormattedZero()).toBe('0,00');
    });
  });

  describe('OTH currency (no symbol, 0 decimals)', () => {
    beforeEach(() => {
      service.setGroupCurrency('OTH');
    });

    it('should format with no symbol', () => {
      expect(service.formatCurrency(1234)).toBe('1,234');
    });

    it('should return formatted zero as 0', () => {
      expect(service.getFormattedZero()).toBe('0');
    });
  });

  describe('roundToCurrency edge cases', () => {
    it('should return 0 for NaN', () => {
      expect(service.roundToCurrency(NaN)).toBe(0);
    });
  });
});
