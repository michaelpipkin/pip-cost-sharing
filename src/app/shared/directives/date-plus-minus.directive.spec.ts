import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { form, FormField } from '@angular/forms/signals';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { toIsoFormat } from '@utils/date-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateShortcutKeysDirective } from './date-plus-minus.directive';

// Fixed "now": a mid-afternoon time, so a result that is not midnight shows.
const NOW = new Date(2026, 5, 15, 14, 30, 45);

@Component({
  imports: [ReactiveFormsModule, DateShortcutKeysDirective],
  template: `
    <input [formControl]="control" appDateShortcutKeys />
  `,
})
class ControlHostComponent {
  control = new FormControl<Date | null>(null);
}

@Component({
  imports: [FormField, MatDatepickerModule, DateShortcutKeysDirective],
  providers: [provideNativeDateAdapter()],
  // A date model needs the datepicker's value accessor, as in the real forms.
  template: `
    <input [formField]="f.date" [matDatepicker]="picker" appDateShortcutKeys />
    <mat-datepicker #picker></mat-datepicker>
  `,
})
class SignalHostComponent {
  model = signal<{ date: Date | null }>({ date: null });
  f = form(this.model);
}

interface Harness {
  input: HTMLInputElement;
  /** The Date the directive last wrote to the bound form, or null. */
  value: () => Date | null;
  fixture: ComponentFixture<unknown>;
}

type Setup = () => Promise<Harness>;

const setupControlHost: Setup = async () => {
  const fixture = TestBed.createComponent(ControlHostComponent);
  await fixture.whenStable();
  return {
    fixture,
    input: fixture.nativeElement.querySelector('input'),
    value: () => fixture.componentInstance.control.value,
  };
};

const setupSignalHost: Setup = async () => {
  const fixture = TestBed.createComponent(SignalHostComponent);
  await fixture.whenStable();
  return {
    fixture,
    input: fixture.nativeElement.querySelector('input'),
    value: () => fixture.componentInstance.model().date,
  };
};

describe('DateShortcutKeysDirective', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each([
    ['a [formControl] host', setupControlHost],
    ['a signal [formField] host', setupSignalHost],
  ] as [string, Setup][])('on %s', (_name, setup) => {
    let h: Harness;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ControlHostComponent, SignalHostComponent],
      }).compileComponents();
      h = await setup();
    });

    afterEach(() => {
      h.fixture.destroy();
    });

    /** Types into the input, presses a key, and returns the keydown event. */
    const press = (
      key: string,
      text: string,
      init: KeyboardEventInit = {}
    ): KeyboardEvent => {
      h.input.value = text;
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      h.input.dispatchEvent(event);
      return event;
    };

    const written = (): string | null => {
      const v = h.value();
      return v ? toIsoFormat(v) : null;
    };

    it('should step back a day on "-"', () => {
      press('-', '6/15/2026');
      expect(written()).toBe('2026-06-14');
    });

    it('should step forward a day on "+"', () => {
      press('+', '6/15/2026');
      expect(written()).toBe('2026-06-16');
    });

    it('should roll over into the next month on "+" at month end', () => {
      press('+', '1/31/2026');
      expect(written()).toBe('2026-02-01');
    });

    it('should roll back into February on "-" from March 1', () => {
      press('-', '3/1/2026');
      expect(written()).toBe('2026-02-28');
    });

    it('should roll back into the previous year on "-" from January 1', () => {
      press('-', '1/1/2026');
      expect(written()).toBe('2025-12-31');
    });

    it('should go to the first of the month on "m"', () => {
      press('m', '3/17/2026');
      expect(written()).toBe('2026-03-01');
    });

    it('should go to January 1 on "y"', () => {
      press('y', '3/17/2026');
      expect(written()).toBe('2026-01-01');
    });

    it('should go to today on "t"', () => {
      press('t', '3/17/2020');
      expect(written()).toBe('2026-06-15');
    });

    it('should give today for a shortcut on empty input', () => {
      press('+', '');
      expect(written()).toBe('2026-06-15');
    });

    it('should give today for a shortcut on unparseable input', () => {
      press('-', 'not a date');
      expect(written()).toBe('2026-06-15');
    });

    it.each(['-', '+', 't', 'm', 'y'])(
      'should preventDefault the handled key "%s"',
      (key) => {
        expect(press(key, '3/17/2026').defaultPrevented).toBe(true);
      }
    );

    it('should leave other keys alone', () => {
      const event = press('5', '3/17/2026');
      expect(event.defaultPrevented).toBe(false);
      expect(h.value()).toBeNull();
    });

    // BUG (B4): src/app/shared/directives/date-plus-minus.directive.ts:14-16
    // handles the keys without checking ctrlKey/metaKey/altKey, so browser and
    // OS shortcuts (Ctrl+T new tab, Ctrl+Y redo, Cmd+M minimize) are swallowed
    // with preventDefault and overwrite the date. A modified key should be
    // ignored and not prevented.
    it.fails('should ignore "t" with ctrlKey and not prevent it (B4)', () => {
      const event = press('t', '3/17/2020', { ctrlKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(h.value()).toBeNull();
    });

    // BUG (B4): same handler as above, for the Meta key.
    it.fails('should ignore "t" with metaKey and not prevent it (B4)', () => {
      const event = press('t', '3/17/2020', { metaKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(h.value()).toBeNull();
    });

    // BUG (B4): src/app/shared/directives/date-plus-minus.directive.ts:18,41
    // `t` assigns `today = new Date()`, which carries the current time of day,
    // while the other shortcuts give midnight. It should be today at midnight.
    it.fails('should give today at midnight on "t" (B4)', () => {
      press('t', '3/17/2020');
      expect(h.value()?.getTime()).toBe(new Date(2026, 5, 15).getTime());
    });
  });
});
