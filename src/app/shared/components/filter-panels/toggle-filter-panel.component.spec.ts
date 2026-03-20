import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import {
  ToggleFilterPanelComponent,
  ToggleFilterValue,
} from './toggle-filter-panel.component';

describe('ToggleFilterPanelComponent', () => {
  let fixture: ComponentFixture<ToggleFilterPanelComponent>;
  let component: ToggleFilterPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToggleFilterPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ToggleFilterPanelComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('default state', () => {
    it('should start with selectedValue null', () => {
      expect(component.selectedValue).toBeNull();
    });

    it('should start with hadInitialFilter false', () => {
      expect(component.hadInitialFilter).toBe(false);
    });
  });

  describe('initialValue effect', () => {
    it('should set selectedValue and hadInitialFilter from initialValue with non-null value', async () => {
      fixture.componentRef.setInput('initialValue', { value: true });
      await fixture.whenStable();

      expect(component.selectedValue).toBe(true);
      expect(component.hadInitialFilter).toBe(true);
    });

    it('should reset to null when initialValue has null value', async () => {
      component.selectedValue = true;
      component.hadInitialFilter = true;
      fixture.componentRef.setInput('initialValue', { value: null });
      await fixture.whenStable();

      expect(component.selectedValue).toBeNull();
      expect(component.hadInitialFilter).toBe(false);
    });
  });

  describe('three-state selection', () => {
    it('selectAll should set selectedValue to null', () => {
      component.selectedValue = true;
      component.selectAll();
      expect(component.selectedValue).toBeNull();
    });

    it('selectTrue should set selectedValue to true', () => {
      component.selectTrue();
      expect(component.selectedValue).toBe(true);
    });

    it('selectFalse should set selectedValue to false', () => {
      component.selectFalse();
      expect(component.selectedValue).toBe(false);
    });
  });

  describe('canApply', () => {
    it('should return false when selectedValue is null and no initial filter', () => {
      component.selectedValue = null;
      component.hadInitialFilter = false;
      expect(component.canApply()).toBe(false);
    });

    it('should return true when selectedValue is true', () => {
      component.selectedValue = true;
      expect(component.canApply()).toBe(true);
    });

    it('should return true when selectedValue is false', () => {
      component.selectedValue = false;
      expect(component.canApply()).toBe(true);
    });

    it('should return true when selectedValue is null but had initial filter', () => {
      component.selectedValue = null;
      component.hadInitialFilter = true;
      expect(component.canApply()).toBe(true);
    });
  });

  describe('onApply', () => {
    it('should emit apply with true when selectTrue was called', () => {
      const emitted: ToggleFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.selectTrue();
      component.onApply();

      expect(emitted.length).toBe(1);
      expect(emitted[0]!.value).toBe(true);
    });

    it('should emit apply with false when selectFalse was called', () => {
      const emitted: ToggleFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.selectFalse();
      component.onApply();

      expect(emitted.length).toBe(1);
      expect(emitted[0]!.value).toBe(false);
    });

    it('should emit apply with null when clearing an initial filter', () => {
      const emitted: ToggleFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.selectedValue = null;
      component.hadInitialFilter = true;
      component.onApply();

      expect(emitted.length).toBe(1);
      expect(emitted[0]!.value).toBeNull();
    });

    it('should not emit when no selection and no initial filter', () => {
      const emitted: ToggleFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.selectedValue = null;
      component.hadInitialFilter = false;
      component.onApply();

      expect(emitted.length).toBe(0);
    });
  });

  describe('onClear', () => {
    it('should reset selectedValue to null', () => {
      component.selectedValue = true;
      component.onClear();
      expect(component.selectedValue).toBeNull();
    });

    it('should emit clear event', () => {
      const clearSpy = vi.fn();
      component.clear.subscribe(clearSpy);
      component.onClear();

      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
