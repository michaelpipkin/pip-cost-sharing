import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { TableFilterService } from '@services/table-filter.service';
import {
  clickBackdrop,
  disposeOverlays,
  overlayButton,
  overlayPanes,
} from '@testing/overlay-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateRangeFilterDirective } from './date-range-filter.directive';

@Component({
  imports: [DateRangeFilterDirective],
  template: `
    <div
      class="header"
      appDateRangeFilter
      [filterKey]="'date'"
      [filterService]="service"
      [columnHeader]="'Date'"
    >
      Date
    </div>
  `,
})
class HostComponent {
  readonly service = TestBed.inject(TableFilterService);
}

describe('DateRangeFilterDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let service: TableFilterService<any>;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const icon = () =>
    fixture.nativeElement.querySelector('.filter-icon') as HTMLElement;
  const directive = () =>
    fixture.debugElement
      .query(By.directive(DateRangeFilterDirective))
      .injector.get(DateRangeFilterDirective);
  const panel = () =>
    document.querySelector('.cdk-overlay-container app-date-range-filter-panel');
  const dateInputs = () =>
    Array.from(
      panel()!.querySelectorAll<HTMLInputElement>('input[matInput]')
    );
  const create = async () => {
    fixture = TestBed.createComponent(HostComponent);
    await settle();
  };
  const openPanel = async () => {
    icon().click();
    await settle();
    await settle();
  };
  const day = (y: number, m: number, d: number) => new Date(y, m, d);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [TableFilterService, provideNativeDateAdapter()],
    }).compileComponents();
    service = TestBed.inject(TableFilterService);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    disposeOverlays();
  });

  it('opens empty, with Apply disabled, when there is no filter', async () => {
    await create();
    await openPanel();

    expect(dateInputs().map((i) => i.value)).toEqual(['', '']);
    expect(overlayButton('Apply').disabled).toBe(true);
    expect(panel()!.querySelector('h5')!.textContent).toContain('Date');
  });

  it('round-trips the current start and end into the panel and back', async () => {
    const start = day(2025, 0, 10);
    const end = day(2025, 0, 31);
    service.setFilter('date', { type: 'dateRange', start, end });
    await create();
    await openPanel();

    expect(dateInputs().map((i) => i.value)).toEqual(['1/10/2025', '1/31/2025']);

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('date')).toEqual({
      type: 'dateRange',
      start,
      end,
    });
    expect(panel()).toBeNull();
  });

  it('keeps an open-ended range open on that end', async () => {
    const start = day(2025, 0, 10);
    service.setFilter('date', { type: 'dateRange', start, end: null });
    await create();
    await openPanel();

    expect(dateInputs().map((i) => i.value)).toEqual(['1/10/2025', '']);

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('date')).toEqual({
      type: 'dateRange',
      start,
      end: null,
    });
  });

  it('applies a preset range to the service and closes the panel', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2025, 5, 15, 9, 30) });
    try {
      await create();
      await openPanel();
      overlayButton('Last 7 Days').click();
      await settle();

      overlayButton('Apply').click();
      await settle();

      const filter = service.getFilter('date') as {
        type: string;
        start: Date;
        end: Date;
      };
      expect(filter.type).toBe('dateRange');
      expect(filter.start.toDateString()).toBe(day(2025, 5, 8).toDateString());
      expect(filter.end.toDateString()).toBe(day(2025, 5, 15).toDateString());
      expect(panel()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Clear removes only its filter and closes the panel', async () => {
    service.setFilter('date', {
      type: 'dateRange',
      start: day(2025, 0, 10),
      end: null,
    });
    service.setFilter('other', { type: 'text', value: 'x' });
    await create();
    await openPanel();

    overlayButton('Clear').click();
    await settle();

    expect(service.hasFilter('date')).toBe(false);
    expect(service.hasFilter('other')).toBe(true);
    expect(panel()).toBeNull();
  });

  it('closes on a backdrop click without changing the filter', async () => {
    const start = day(2025, 0, 10);
    service.setFilter('date', { type: 'dateRange', start, end: null });
    await create();
    await openPanel();
    overlayButton('Today').click();
    await settle();

    clickBackdrop();
    await settle();

    expect(panel()).toBeNull();
    expect(service.getFilter('date')).toEqual({
      type: 'dateRange',
      start,
      end: null,
    });
  });

  it('removes the open panel content when the host is destroyed', async () => {
    await create();
    await openPanel();
    expect(panel()).not.toBeNull();

    fixture.destroy();

    expect(panel()).toBeNull();
  });

  it('does not accumulate backdrop subscriptions', async () => {
    await create();
    const close = vi.spyOn(directive() as any, 'closeFilterPanel');
    for (let i = 0; i < 3; i++) {
      await openPanel();
      icon().click();
      await settle();
    }
    await openPanel();
    close.mockClear();

    clickBackdrop();
    await settle();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('disposes the overlay when the host is destroyed', async () => {
    await create();
    await openPanel();
    expect(overlayPanes()).toHaveLength(1);

    fixture.destroy();

    expect(overlayPanes()).toHaveLength(0);
  });
});
