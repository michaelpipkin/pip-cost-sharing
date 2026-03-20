import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import {
  TextFilterPanelComponent,
  TextFilterValue,
} from './text-filter-panel.component';

describe('TextFilterPanelComponent', () => {
  let fixture: ComponentFixture<TextFilterPanelComponent>;
  let component: TextFilterPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextFilterPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TextFilterPanelComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialValue effect', () => {
    it('should set filterText and caseSensitive from initialValue', async () => {
      fixture.componentRef.setInput('initialValue', {
        value: 'hello',
        caseSensitive: true,
      });
      await fixture.whenStable();

      expect(component.filterText).toBe('hello');
      expect(component.caseSensitive).toBe(true);
    });

    it('should not change state when initialValue is undefined', async () => {
      component.filterText = 'existing';
      fixture.componentRef.setInput('initialValue', undefined);
      await fixture.whenStable();

      // Effect only runs when initial is truthy
      expect(component.filterText).toBe('existing');
    });
  });

  describe('default state', () => {
    it('should start with empty filterText', () => {
      expect(component.filterText).toBe('');
    });

    it('should start with caseSensitive false', () => {
      expect(component.caseSensitive).toBe(false);
    });
  });

  describe('onApply', () => {
    it('should emit apply with filterText and caseSensitive when text is set', () => {
      const emitted: TextFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.filterText = 'hello';
      component.caseSensitive = true;
      component.onApply();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ value: 'hello', caseSensitive: true });
    });

    it('should not emit apply when filterText is empty', () => {
      const emitted: TextFilterValue[] = [];
      component.apply.subscribe((v) => emitted.push(v));

      component.filterText = '';
      component.onApply();

      expect(emitted.length).toBe(0);
    });
  });

  describe('onClear', () => {
    it('should reset filterText to empty string', () => {
      component.filterText = 'hello';
      component.onClear();

      expect(component.filterText).toBe('');
    });

    it('should reset caseSensitive to false', () => {
      component.caseSensitive = true;
      component.onClear();

      expect(component.caseSensitive).toBe(false);
    });

    it('should emit clear event', () => {
      const clearSpy = vi.fn();
      component.clear.subscribe(clearSpy);
      component.onClear();

      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
