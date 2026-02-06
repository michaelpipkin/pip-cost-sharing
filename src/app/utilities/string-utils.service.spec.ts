import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { StringUtils } from './string-utils.service';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';

describe('StringUtils', () => {
  let service: StringUtils;
  let localeService: LocaleService;
  const currentGroupSignal = signal<any>(null);

  beforeEach(() => {
    currentGroupSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        StringUtils,
        LocaleService,
        {
          provide: GroupStore,
          useValue: {
            currentGroup: currentGroupSignal,
          },
        },
      ],
    });

    service = TestBed.inject(StringUtils);
    localeService = TestBed.inject(LocaleService);
  });

  describe('simple numbers (USD mode)', () => {
    it('should parse integer string', () => {
      expect(service.toNumber('42')).toBe(42);
    });

    it('should parse decimal string', () => {
      expect(service.toNumber('3.14')).toBe(3.14);
    });

    it('should parse negative number', () => {
      expect(service.toNumber('-25')).toBe(-25);
    });
  });

  describe('math expressions', () => {
    it('should evaluate addition', () => {
      expect(service.toNumber('10+5')).toBe(15);
    });

    it('should evaluate subtraction', () => {
      expect(service.toNumber('20-8')).toBe(12);
    });

    it('should evaluate multiplication', () => {
      expect(service.toNumber('6*7')).toBe(42);
    });

    it('should evaluate division', () => {
      expect(service.toNumber('100/4')).toBe(25);
    });

    it('should evaluate parenthesized expressions', () => {
      expect(service.toNumber('(10+5)*2')).toBe(30);
    });

    it('should evaluate complex expressions', () => {
      expect(service.toNumber('10+5*2')).toBe(20);
    });
  });

  describe('edge cases', () => {
    it('should return 0 for empty string', () => {
      expect(service.toNumber('')).toBe(0);
    });

    it('should return 0 for whitespace', () => {
      expect(service.toNumber('   ')).toBe(0);
    });

    it('should return 0 for non-numeric string', () => {
      expect(service.toNumber('abc')).toBe(0);
    });

    it('should return 0 for non-string input', () => {
      expect(service.toNumber(null as any)).toBe(0);
      expect(service.toNumber(undefined as any)).toBe(0);
    });

    it('should return 0 for division by zero', () => {
      expect(service.toNumber('1/0')).toBe(0);
    });
  });

  describe('EUR mode (comma decimal)', () => {
    beforeEach(() => {
      localeService.setGroupCurrency('EUR');
    });

    it('should parse comma-separated decimal', () => {
      expect(service.toNumber('3,14')).toBe(3.14);
    });

    it('should parse integer in EUR mode', () => {
      expect(service.toNumber('42')).toBe(42);
    });
  });
});
