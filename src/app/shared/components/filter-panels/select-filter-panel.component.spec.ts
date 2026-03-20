import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import {
  SelectFilterPanelComponent,
  SelectFilterValue,
} from './select-filter-panel.component';

const options = ['Option A', 'Option B', 'Option C'];

describe('SelectFilterPanelComponent', () => {
  describe('single-select mode (default)', () => {
    let fixture: ComponentFixture<SelectFilterPanelComponent>;
    let component: SelectFilterPanelComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [SelectFilterPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(SelectFilterPanelComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('options', options);
      await fixture.whenStable();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    describe('initialValue effect', () => {
      it('should set selectedValue from initialValue input', async () => {
        fixture.componentRef.setInput('initialValue', {
          value: 'Option A',
          multiple: false,
        });
        await fixture.whenStable();

        expect(component.selectedValue).toBe('Option A');
      });

      it('should reset selectedValue when initialValue is set then cleared', async () => {
        fixture.componentRef.setInput('initialValue', {
          value: 'Option A',
          multiple: false,
        });
        await fixture.whenStable();
        expect(component.selectedValue).toBe('Option A');

        fixture.componentRef.setInput('initialValue', null);
        await fixture.whenStable();

        expect(component.selectedValue).toBeNull();
      });
    });

    describe('hasSelection', () => {
      it('should return false when no single value selected', () => {
        component.selectedValue = null;
        expect(component.hasSelection()).toBe(false);
      });

      it('should return true when a single value is selected', () => {
        component.selectedValue = 'Option A';
        expect(component.hasSelection()).toBe(true);
      });
    });

    describe('isAllSelected', () => {
      it('should return false in single-select mode', () => {
        expect(component.isAllSelected()).toBe(false);
      });
    });

    describe('clearSelection', () => {
      it('should set selectedValue to null in single-select', () => {
        component.selectedValue = 'Option A';
        component.clearSelection();
        expect(component.selectedValue).toBeNull();
      });
    });

    describe('onApply', () => {
      it('should emit apply with selected value when selection exists', () => {
        const emitted: SelectFilterValue[] = [];
        component.apply.subscribe((v) => emitted.push(v));

        component.selectedValue = 'Option A';
        component.onApply();

        expect(emitted.length).toBe(1);
        expect(emitted[0]!.value).toBe('Option A');
        expect(emitted[0]!.multiple).toBe(false);
      });

      it('should not emit apply when no selection', () => {
        const emitted: SelectFilterValue[] = [];
        component.apply.subscribe((v) => emitted.push(v));

        component.selectedValue = null;
        component.onApply();

        expect(emitted.length).toBe(0);
      });
    });

    describe('onClear', () => {
      it('should reset selectedValue to null in single-select', () => {
        component.selectedValue = 'Option A';
        component.onClear();
        expect(component.selectedValue).toBeNull();
      });

      it('should emit clear event', () => {
        let cleared = false;
        component.clear.subscribe(() => (cleared = true));
        component.onClear();
        expect(cleared).toBe(true);
      });
    });
  });

  describe('multi-select mode', () => {
    let fixture: ComponentFixture<SelectFilterPanelComponent>;
    let component: SelectFilterPanelComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [SelectFilterPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(SelectFilterPanelComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('options', options);
      fixture.componentRef.setInput('multiple', true);
      await fixture.whenStable();
    });

    describe('hasSelection', () => {
      it('should return false for multi-select with empty array', () => {
        component.selectedValue = [];
        expect(component.hasSelection()).toBe(false);
      });

      it('should return true for multi-select with at least one item', () => {
        component.selectedValue = ['Option A'];
        expect(component.hasSelection()).toBe(true);
      });
    });

    describe('isAllSelected', () => {
      it('should return false when not all options selected', () => {
        component.selectedValue = ['Option A'];
        expect(component.isAllSelected()).toBe(false);
      });

      it('should return true when all options selected', () => {
        component.selectedValue = [...options];
        expect(component.isAllSelected()).toBe(true);
      });
    });

    describe('selectAll', () => {
      it('should set selectedValue to all options', () => {
        component.selectAll();
        expect(component.selectedValue).toEqual(options);
      });
    });

    describe('clearSelection', () => {
      it('should set selectedValue to empty array in multi-select', () => {
        component.selectedValue = [...options];
        component.clearSelection();
        expect(component.selectedValue).toEqual([]);
      });
    });
  });
});
