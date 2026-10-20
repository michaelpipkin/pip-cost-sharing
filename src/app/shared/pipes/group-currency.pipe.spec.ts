import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';
import { beforeEach, describe, expect, it } from 'vitest';
import { GroupCurrencyPipe } from './group-currency.pipe';

describe('GroupCurrencyPipe', () => {
  const currentGroup = signal<any>(null);
  let pipe: GroupCurrencyPipe;

  beforeEach(() => {
    currentGroup.set(null);
    TestBed.configureTestingModule({
      providers: [
        LocaleService,
        { provide: GroupStore, useValue: { currentGroup } },
      ],
    });
    pipe = TestBed.runInInjectionContext(() => new GroupCurrencyPipe());
  });

  it('should format in USD before a group is selected', () => {
    expect(pipe.transform(1234.56)).toBe('$ 1,234.56');
  });

  it("should follow the current group's currency when it changes", () => {
    currentGroup.set({ currencyCode: 'EUR' });
    TestBed.tick();
    expect(pipe.transform(1234.56)).toBe('€ 1.234,56');

    currentGroup.set({ currencyCode: 'JPY' });
    TestBed.tick();
    expect(pipe.transform(1234.56)).toBe('¥ 1,235');
  });

  it('should keep the sign in front of the symbol for negative amounts', () => {
    expect(pipe.transform(-50.25)).toBe('-$ 50.25');
  });
});
