import { TestBed } from '@angular/core/testing';
import { CalculatorComponent } from '@components/calculator/calculator.component';
import { StringUtils } from '@utils/string-utils.service';
import {
  disposeOverlays,
  overlayPanes,
} from '@testing/overlay-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalculatorOverlayService } from './calculator-overlay.service';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

describe('CalculatorOverlayService', () => {
  let service: CalculatorOverlayService;
  let formField: HTMLElement;
  let input: HTMLInputElement;
  let trigger: HTMLButtonElement;
  let onResult: ReturnType<typeof vi.fn<(result: number) => void>>;
  let scrollTo: ReturnType<typeof vi.spyOn>;

  const key = (
    k: string,
    init: KeyboardEventInit = {}
  ): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.body.dispatchEvent(event);
    return event;
  };
  const calc = (): CalculatorComponent =>
    (service as any).calculatorRef.instance;
  const calculatorEls = () => document.querySelectorAll('app-calculator');
  const open = () => service.openCalculator(trigger, onResult);
  const hiddenInputs = () =>
    Array.from(document.body.querySelectorAll('input')).filter(
      (i) => i !== input
    );

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement scrollTo; keep it from logging and observe it
    scrollTo = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [
        {
          provide: StringUtils,
          useValue: { toNumber: (expr: string) => Number(expr) },
        },
      ],
    });
    service = TestBed.inject(CalculatorOverlayService);

    formField = document.createElement('mat-form-field');
    input = document.createElement('input');
    trigger = document.createElement('button');
    formField.append(input, trigger);
    document.body.appendChild(formField);
    onResult = vi.fn();
  });

  afterEach(() => {
    // Each step runs even if an earlier one throws, so a failing test cannot
    // leave fake timers, spies or a pane behind for the next spec
    try {
      service.closeCalculator();
      formField.remove();
      hiddenInputs().forEach((i) => i.remove());
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
      // closeCalculator must have disposed the overlay: no pane may remain
      disposeOverlays();
    }
  });

  describe('opening', () => {
    it('shows one calculator in an overlay with a backdrop', () => {
      open();

      expect(overlayPanes()).toHaveLength(1);
      expect(calculatorEls()).toHaveLength(1);
      expect(document.querySelector('.calculator-backdrop')).not.toBeNull();
    });

    it('keeps only one overlay open at a time', () => {
      const secondCallback = vi.fn();
      open();
      const first = calculatorEls()[0];

      service.openCalculator(trigger, secondCallback);

      expect(overlayPanes()).toHaveLength(1);
      expect(calculatorEls()).toHaveLength(1);
      expect(calculatorEls()[0]).not.toBe(first);
      // and the live one reports to the newest caller
      key('7');
      key('Enter');
      expect(secondCallback).toHaveBeenCalledWith(7);
      expect(onResult).not.toHaveBeenCalled();
    });

    it('does not leave the replaced overlay listening for keys', () => {
      open();
      const addNumber = vi.spyOn(CalculatorComponent.prototype, 'addNumber');
      service.openCalculator(trigger, vi.fn());
      addNumber.mockClear();

      key('4');

      expect(addNumber).toHaveBeenCalledTimes(1);
    });
  });

  describe('virtual keyboard handling', () => {
    it('makes the field read-only while open and restores it after 300 ms', () => {
      open();
      expect(input.readOnly).toBe(true);
      expect(hiddenInputs()).toHaveLength(1);

      vi.advanceTimersByTime(299);
      expect(input.readOnly).toBe(true);
      expect(hiddenInputs()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(input.readOnly).toBe(false);
      expect(hiddenInputs()).toHaveLength(0);
    });

    it('blurs the field it was opened from', () => {
      const blur = vi.spyOn(input, 'blur');
      open();
      expect(blur).toHaveBeenCalled();
    });

    it('scrolls to the top on iOS to dismiss the keyboard', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IOS_UA);

      open();

      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('does not scroll on other platforms', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'
      );

      open();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('opens and returns a result for a trigger that is not in a form field', () => {
      const lone = document.createElement('button');
      document.body.appendChild(lone);
      try {
        service.openCalculator(lone, onResult);
        expect(hiddenInputs()).toHaveLength(0);

        key('9');
        key('Enter');
        vi.runAllTimers();

        expect(onResult).toHaveBeenCalledWith(9);
      } finally {
        lone.remove();
      }
    });
  });

  describe('a result', () => {
    it('calls back with the value and disposes the overlay', () => {
      open();
      key('1');
      key('2');
      key('Enter');

      expect(onResult).toHaveBeenCalledExactlyOnceWith(12);
      expect(overlayPanes()).toHaveLength(0);
      expect(calculatorEls()).toHaveLength(0);
    });

    it('focuses then blurs the field on the next tick, not before', () => {
      const focus = vi.spyOn(input, 'focus');
      const blur = vi.spyOn(input, 'blur');
      open();
      focus.mockClear();
      blur.mockClear();

      key('3');
      key('=');
      expect(focus).not.toHaveBeenCalled();
      expect(blur).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);

      expect(focus).toHaveBeenCalledTimes(1);
      expect(blur).toHaveBeenCalledTimes(1);
      expect(focus.mock.invocationCallOrder[0]!).toBeLessThan(
        blur.mock.invocationCallOrder[0]!
      );
    });

    it('stops listening for keys once closed', () => {
      open();
      key('5');
      key('Enter');
      onResult.mockClear();

      key('6');
      key('Enter');

      expect(onResult).not.toHaveBeenCalled();
    });

    it('gives no result for an expression the calculator rejects', () => {
      open();
      const calculator = calc();
      calculator.hasError.set(true);

      key('Enter');

      expect(onResult).not.toHaveBeenCalled();
      expect(calculatorEls()).toHaveLength(1);
    });
  });

  describe('closing without a result', () => {
    const expectClosedQuietly = () => {
      const focus = vi.spyOn(input, 'focus');
      return () => {
        vi.runAllTimers();
        expect(onResult).not.toHaveBeenCalled();
        expect(focus).not.toHaveBeenCalled();
        expect(overlayPanes()).toHaveLength(0);
      };
    };

    it('the calculator closing gives no callback and no refocus', () => {
      const verify = expectClosedQuietly();
      open();

      calc().closed.emit();

      verify();
    });

    it('a backdrop click gives no callback and no refocus', () => {
      const verify = expectClosedQuietly();
      open();

      document
        .querySelector<HTMLElement>('.calculator-backdrop')!
        .click();

      verify();
    });

    it('Escape gives no callback and no refocus', () => {
      const verify = expectClosedQuietly();
      open();

      key('Escape');

      verify();
    });

    it('closeCalculator() with nothing open is a no-op', () => {
      const focus = vi.spyOn(input, 'focus');

      expect(() => service.closeCalculator()).not.toThrow();
      expect(() => service.closeCalculator(true)).not.toThrow();
      vi.runAllTimers();

      expect(focus).not.toHaveBeenCalled();
      expect(overlayPanes()).toHaveLength(0);
    });

    it('closeCalculator(true) refocuses and blurs the field on the next tick', () => {
      const focus = vi.spyOn(input, 'focus');
      const blur = vi.spyOn(input, 'blur');
      open();
      focus.mockClear();
      blur.mockClear();

      service.closeCalculator(true);
      expect(focus).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);

      expect(focus).toHaveBeenCalledTimes(1);
      expect(blur).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard mapping', () => {
    // Stub the calculator's actions so the overlay stays open across keys
    let addNumber: ReturnType<typeof vi.spyOn>;
    let addOperation: ReturnType<typeof vi.spyOn>;
    let useResult: ReturnType<typeof vi.spyOn>;
    let backspace: ReturnType<typeof vi.spyOn>;
    let clear: ReturnType<typeof vi.spyOn>;

    const calls = () => ({
      addNumber: addNumber.mock.calls,
      addOperation: addOperation.mock.calls,
      useResult: useResult.mock.calls,
      backspace: backspace.mock.calls,
      clear: clear.mock.calls,
    });

    beforeEach(() => {
      const proto = CalculatorComponent.prototype;
      addNumber = vi.spyOn(proto, 'addNumber').mockImplementation(() => {});
      addOperation = vi
        .spyOn(proto, 'addOperation')
        .mockImplementation(() => {});
      useResult = vi.spyOn(proto, 'useResult').mockImplementation(() => {});
      backspace = vi.spyOn(proto, 'backspace').mockImplementation(() => {});
      clear = vi.spyOn(proto, 'clear').mockImplementation(() => {});
      open();
    });

    it.each(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])(
      'digit %s adds that number',
      (digit) => {
        key(digit);
        expect(calls()).toEqual({
          addNumber: [[digit]],
          addOperation: [],
          useResult: [],
          backspace: [],
          clear: [],
        });
      }
    );

    it.each([
      ['.', '.'],
      [',', '.'],
      ['(', '('],
      [')', ')'],
    ])('%s adds "%s" as a number token', (pressed, added) => {
      key(pressed);
      expect(calls().addNumber).toEqual([[added]]);
      expect(calls().addOperation).toEqual([]);
    });

    it.each([
      ['+', '+'],
      ['-', '-'],
      ['*', '×'],
      ['x', '×'],
      ['X', '×'],
      ['/', '÷'],
    ])('%s adds the %s operation', (pressed, op) => {
      key(pressed);
      expect(calls().addOperation).toEqual([[op]]);
      expect(calls().addNumber).toEqual([]);
    });

    it.each(['Enter', '='])('%s uses the result', (pressed) => {
      key(pressed);
      expect(calls().useResult).toHaveLength(1);
      expect(calls().clear).toHaveLength(0);
    });

    it('Backspace removes the last character', () => {
      key('Backspace');
      expect(calls().backspace).toHaveLength(1);
      expect(calls().clear).toHaveLength(0);
    });

    it.each(['Delete', 'c', 'C'])('%s clears the expression', (pressed) => {
      key(pressed);
      expect(calls().clear).toHaveLength(1);
      expect(calls().backspace).toHaveLength(0);
    });

    it('Escape closes without touching the expression', () => {
      key('Escape');
      expect(calls()).toEqual({
        addNumber: [],
        addOperation: [],
        useResult: [],
        backspace: [],
        clear: [],
      });
      expect(overlayPanes()).toHaveLength(0);
    });

    it('ignores keys it has no meaning for', () => {
      key('a');
      key('F5');
      expect(calls()).toEqual({
        addNumber: [],
        addOperation: [],
        useResult: [],
        backspace: [],
        clear: [],
      });
      expect(overlayPanes()).toHaveLength(1);
    });

    it('keeps typed keys from reaching the page behind', () => {
      expect(key('5').defaultPrevented).toBe(true);
      expect(key('Enter').defaultPrevented).toBe(true);
    });

    // Regression for B4: only calculator keys are prevented, so Tab keeps
    // moving focus out of the open calculator.
    it('does not swallow Tab', () => {
      expect(key('Tab').defaultPrevented).toBe(false);
    });

    it('does not swallow Shift+Tab', () => {
      expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    });

    // Regression for B4: modifier combinations are browser shortcuts, and the
    // "c" in Ctrl/Cmd+C is not the clear key.
    it('does not swallow Ctrl+C or treat it as clear', () => {
      const event = key('c', { ctrlKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(calls().clear).toHaveLength(0);
    });

    it('does not swallow Cmd+A or Cmd+V', () => {
      expect(key('a', { metaKey: true }).defaultPrevented).toBe(false);
      expect(key('v', { metaKey: true }).defaultPrevented).toBe(false);
    });

    it('ignores a calculator key held with Alt', () => {
      expect(key('5', { altKey: true }).defaultPrevented).toBe(false);
      expect(calls().addNumber).toEqual([]);
    });

    it('still prevents a plain calculator key', () => {
      const event = key('7');
      expect(event.defaultPrevented).toBe(true);
      expect(calls().addNumber).toEqual([['7']]);
    });
  });
});
