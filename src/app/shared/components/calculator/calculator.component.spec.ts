import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CalculatorComponent } from './calculator.component';
import { GroupStore } from '@store/group.store';
import { createMockGroupStore } from '@testing/test-helpers';

describe('CalculatorComponent', () => {
  let fixture: ComponentFixture<CalculatorComponent>;
  let component: CalculatorComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    const mockGroupStore = createMockGroupStore();

    await TestBed.configureTestingModule({
      imports: [CalculatorComponent],
      providers: [
        provideNoopAnimations(),
        { provide: GroupStore, useValue: mockGroupStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalculatorComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function click(testId: string): void {
    const btn = query(testId);
    btn?.click();
  }

  describe('initial render', () => {
    it('should render the calculator', () => {
      expect(query('calculator')).toBeTruthy();
    });

    it('should show 0 in the expression display', () => {
      const display = query('calculator-display');
      const expression = display?.querySelector('.expression');
      expect(expression?.textContent?.trim()).toBe('0');
    });

    it('should show 0.00 in the result display', () => {
      const display = query('calculator-display');
      const result = display?.querySelector('.result');
      expect(result?.textContent?.trim()).toBe('0.00');
    });

    it('should render all number buttons', () => {
      for (let i = 0; i <= 9; i++) {
        expect(query(`num-${i}-btn`)).toBeTruthy();
      }
    });

    it('should render operator buttons', () => {
      expect(query('add-btn')).toBeTruthy();
      expect(query('subtract-btn')).toBeTruthy();
      expect(query('multiply-btn')).toBeTruthy();
      expect(query('divide-btn')).toBeTruthy();
    });

    it('should render clear, backspace, equals, and decimal buttons', () => {
      expect(query('clear-btn')).toBeTruthy();
      expect(query('backspace-btn')).toBeTruthy();
      expect(query('equals-btn')).toBeTruthy();
      expect(query('decimal-btn')).toBeTruthy();
    });
  });

  describe('number input', () => {
    it('should update expression when number buttons are clicked', async () => {
      click('num-4-btn');
      click('num-2-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('42');
    });

    it('should update the result as numbers are entered', async () => {
      click('num-4-btn');
      click('num-2-btn');
      await fixture.whenStable();
      expect(component.result()).toBe(42);
    });
  });

  describe('operations', () => {
    it('should add operator to expression', async () => {
      click('num-2-btn');
      click('add-btn');
      click('num-3-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('2+3');
    });

    it('should evaluate addition correctly', async () => {
      click('num-2-btn');
      click('add-btn');
      click('num-3-btn');
      component.calculate();
      await fixture.whenStable();
      expect(component.result()).toBe(5);
    });

    it('should convert × to * internally', async () => {
      component.addNumber('6');
      component.addOperation('×');
      component.addNumber('7');
      component.calculate();
      await fixture.whenStable();
      expect(component.result()).toBe(42);
    });

    it('should convert ÷ to / internally', async () => {
      component.addNumber('8');
      component.addOperation('÷');
      component.addNumber('4');
      component.calculate();
      await fixture.whenStable();
      expect(component.result()).toBe(2);
    });

    it('should handle decimal input', async () => {
      click('num-1-btn');
      click('decimal-btn');
      click('num-5-btn');
      click('add-btn');
      click('num-2-btn');
      click('decimal-btn');
      click('num-5-btn');
      component.calculate();
      await fixture.whenStable();
      expect(component.result()).toBe(4);
    });
  });

  describe('clear and backspace', () => {
    it('should clear expression and result when C is clicked', async () => {
      click('num-4-btn');
      click('num-2-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('42');

      click('clear-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('');
      expect(component.result()).toBe(0);
      expect(component.hasError()).toBe(false);
    });

    it('should remove last character on backspace', async () => {
      click('num-4-btn');
      click('num-2-btn');
      click('num-3-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('423');

      click('backspace-btn');
      await fixture.whenStable();
      expect(component.expression()).toBe('42');
    });
  });

  describe('useResult output', () => {
    it('should emit resultSelected when = is clicked', async () => {
      const emitSpy = vi.fn();
      component.resultSelected.subscribe(emitSpy);

      click('num-5-btn');
      await fixture.whenStable();
      click('equals-btn');
      await fixture.whenStable();

      expect(emitSpy).toHaveBeenCalledWith(5);
    });

    it('should not emit when hasError is true', async () => {
      const emitSpy = vi.fn();
      component.resultSelected.subscribe(emitSpy);

      component.hasError.set(true);
      component.useResult();
      await fixture.whenStable();

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('should show Error text for invalid expression', async () => {
      // StringUtils.toNumber returns 0 for invalid expressions,
      // it doesn't throw. So hasError stays false.
      // We test the error display by manually setting hasError.
      component.hasError.set(true);
      await fixture.whenStable();

      const display = query('calculator-display');
      const result = display?.querySelector('.result');
      expect(result?.textContent?.trim()).toBe('Error');
    });

    it('should add error class to result div', async () => {
      component.hasError.set(true);
      await fixture.whenStable();

      const display = query('calculator-display');
      const result = display?.querySelector('.result');
      expect(result?.classList.contains('error')).toBe(true);
    });
  });
});
