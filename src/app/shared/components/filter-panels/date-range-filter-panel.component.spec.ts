import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  DateRangeFilterPanelComponent,
  DateRangeFilterValue,
} from './date-range-filter-panel.component';

describe('DateRangeFilterPanelComponent', () => {
  let fixture: ComponentFixture<DateRangeFilterPanelComponent>;
  let component: DateRangeFilterPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DateRangeFilterPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DateRangeFilterPanelComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialValue effect', () => {
    it('should set start and end dates from initialValue input', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      fixture.componentRef.setInput('initialValue', { start, end });
      await fixture.whenStable();

      expect(component.startDate).toEqual(start);
      expect(component.endDate).toEqual(end);
    });

    it('should clear dates when initialValue is set to null', async () => {
      // First set a real value, then clear to null to trigger the effect
      fixture.componentRef.setInput('initialValue', {
        start: new Date(),
        end: new Date(),
      });
      await fixture.whenStable();

      fixture.componentRef.setInput('initialValue', null);
      await fixture.whenStable();

      expect(component.startDate).toBeNull();
      expect(component.endDate).toBeNull();
    });
  });

  describe('preset date shortcuts', () => {
    it('setToday should set startDate and endDate to today', () => {
      const before = new Date();
      component.setToday();
      const after = new Date();

      expect(component.startDate!.getDate()).toBeGreaterThanOrEqual(
        before.getDate()
      );
      expect(component.endDate!.getDate()).toBeLessThanOrEqual(after.getDate());
      expect(component.startDate!.toDateString()).toBe(
        component.endDate!.toDateString()
      );
    });

    it('setLast7Days should set a 7-day date range', () => {
      component.setLast7Days();

      const diff =
        component.endDate!.getTime() - component.startDate!.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      expect(days).toBe(7);
    });

    it('setLast30Days should set a 30-day date range', () => {
      component.setLast30Days();

      const diff =
        component.endDate!.getTime() - component.startDate!.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      expect(days).toBe(30);
    });

    it('setLast90Days should set a 90-day date range', () => {
      component.setLast90Days();

      const diff =
        component.endDate!.getTime() - component.startDate!.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      expect(days).toBe(90);
    });
  });

  describe('onApply', () => {
    it('should emit apply with start and end dates when both are set', () => {
      const emitted: DateRangeFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      component.startDate = start;
      component.endDate = end;
      component.onApply();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ start, end });
    });

    it('should emit apply when only startDate is set', () => {
      const emitted: DateRangeFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.startDate = new Date('2024-01-01');
      component.endDate = null;
      component.onApply();

      expect(emitted.length).toBe(1);
    });

    it('should not emit apply when both dates are null', () => {
      const emitted: DateRangeFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.startDate = null;
      component.endDate = null;
      component.onApply();

      expect(emitted.length).toBe(0);
    });
  });

  describe('onClear', () => {
    it('should clear startDate and endDate', () => {
      component.startDate = new Date();
      component.endDate = new Date();
      component.onClear();

      expect(component.startDate).toBeNull();
      expect(component.endDate).toBeNull();
    });

    it('should emit clear event', () => {
      const clearSpy = vi.fn();
      component.clear.subscribe(clearSpy);
      component.onClear();

      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
