import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';
import { createMockGroupStore } from '@testing/test-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormatCurrencyInputDirective } from './format-currency-input.directive';

@Component({
  imports: [FormatCurrencyInputDirective],
  template: `
    <input appFormatCurrencyInput />
  `,
})
class HostComponent {}

describe('FormatCurrencyInputDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;
  let localeService: LocaleService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: GroupStore, useValue: createMockGroupStore() }],
    }).compileComponents();

    localeService = TestBed.inject(LocaleService);
    localeService.setGroupCurrency('USD');
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('input');
  });

  const focus = () => input.dispatchEvent(new FocusEvent('focus'));
  const blur = () => input.dispatchEvent(new FocusEvent('blur'));

  describe('focus', () => {
    it('should clear a zero amount', () => {
      input.value = '0.00';
      focus();
      expect(input.value).toBe('');
    });

    it('should select a non-zero amount instead of clearing it', () => {
      const selectSpy = vi.spyOn(input, 'select');
      input.value = '12.50';
      focus();
      expect(input.value).toBe('12.50');
      expect(selectSpy).toHaveBeenCalled();
    });

    it("should clear the group currency's zero, not just '0.00'", () => {
      localeService.setGroupCurrency('EUR');
      input.value = '0,00';
      focus();
      expect(input.value).toBe('');

      localeService.setGroupCurrency('JPY');
      input.value = '0';
      focus();
      expect(input.value).toBe('');
    });
  });

  describe('blur', () => {
    it('should format the value in the group currency', () => {
      input.value = '12.5';
      blur();
      expect(input.value).toBe('12.50');

      localeService.setGroupCurrency('EUR');
      input.value = '12,5';
      blur();
      expect(input.value).toBe('12,50');
    });

    it('should format an empty value as zero', () => {
      input.value = '';
      blur();
      expect(input.value).toBe('0.00');
    });

    it('should dispatch an input event after formatting', () => {
      const values: string[] = [];
      input.addEventListener('input', () => values.push(input.value));
      input.value = '7';
      blur();
      expect(values).toEqual(['7.00']);
    });
  });
});
