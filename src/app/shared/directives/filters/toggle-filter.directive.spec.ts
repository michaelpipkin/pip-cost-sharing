import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TableFilterService } from '@services/table-filter.service';
import {
  clickBackdrop,
  disposeOverlays,
  overlayButton,
  overlayPanes,
} from '@testing/overlay-testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToggleFilterDirective } from './toggle-filter.directive';

@Component({
  imports: [ToggleFilterDirective],
  template: `
    <div
      class="header"
      appToggleFilter
      [filterKey]="'paid'"
      [filterService]="service"
      [columnHeader]="'Paid'"
      [filterTrueLabel]="trueLabel()"
    >
      Paid
    </div>
  `,
})
class HostComponent {
  readonly service = TestBed.inject(TableFilterService);
  readonly trueLabel = signal('Yes');
}

describe('ToggleFilterDirective', () => {
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
      .query(By.directive(ToggleFilterDirective))
      .injector.get(ToggleFilterDirective);
  const panel = () =>
    document.querySelector('.cdk-overlay-container app-toggle-filter-panel');
  const buttonLabels = () =>
    Array.from(
      panel()!.querySelectorAll('.filter-toggle-group button')
    ).map((b) => b.textContent!.trim());
  const isActive = (label: string) =>
    overlayButton(label).classList.contains('active');
  const create = async () => {
    fixture = TestBed.createComponent(HostComponent);
    await settle();
  };
  const openPanel = async () => {
    icon().click();
    await settle();
    await settle();
  };
  const choose = async (label: string) => {
    overlayButton(label).click();
    await settle();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [TableFilterService],
    }).compileComponents();
    service = TestBed.inject(TableFilterService);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    disposeOverlays();
    expect(overlayPanes()).toHaveLength(0);
  });

  it('offers All, Yes and No by default, with none chosen and Apply disabled', async () => {
    await create();
    await openPanel();

    expect(buttonLabels()).toEqual(['All', 'Yes', 'No']);
    expect(panel()!.querySelector('h5')!.textContent).toContain('Paid');
    expect(overlayButton('Apply').disabled).toBe(true);
  });

  it('applies Yes as true and closes the panel', async () => {
    await create();
    await openPanel();
    await choose('Yes');

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('paid')).toEqual({ type: 'toggle', value: true });
    expect(panel()).toBeNull();
  });

  it('applies No as false, not as "no filter"', async () => {
    await create();
    await openPanel();
    await choose('No');

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('paid')).toEqual({ type: 'toggle', value: false });
    expect(service.hasFilter('paid')).toBe(true);
  });

  it('opens with the current value chosen', async () => {
    service.setFilter('paid', { type: 'toggle', value: false });
    await create();
    await openPanel();

    expect(isActive('No')).toBe(true);
    expect(isActive('Yes')).toBe(false);
    expect(isActive('All')).toBe(false);
  });

  it('clears the filter, instead of storing null, when All is applied over an existing filter', async () => {
    service.setFilter('paid', { type: 'toggle', value: true });
    service.setFilter('other', { type: 'text', value: 'x' });
    await create();
    await openPanel();
    expect(overlayButton('Apply').disabled).toBe(false);
    await choose('All');

    overlayButton('Apply').click();
    await settle();

    expect(service.hasFilter('paid')).toBe(false);
    expect(service.hasFilter('other')).toBe(true);
    expect(panel()).toBeNull();
  });

  it('Clear removes the filter and closes the panel', async () => {
    service.setFilter('paid', { type: 'toggle', value: true });
    await create();
    await openPanel();

    overlayButton('Clear').click();
    await settle();

    expect(service.hasFilter('paid')).toBe(false);
    expect(panel()).toBeNull();
  });

  it('closes on a backdrop click without changing the filter', async () => {
    service.setFilter('paid', { type: 'toggle', value: true });
    await create();
    await openPanel();
    await choose('No');

    clickBackdrop();
    await settle();

    expect(panel()).toBeNull();
    expect(service.getFilter('paid')).toEqual({ type: 'toggle', value: true });
  });

  it('removes the open panel content when the host is destroyed', async () => {
    await create();
    await openPanel();
    expect(panel()).not.toBeNull();

    fixture.destroy();

    expect(panel()).toBeNull();
  });

  // BUG (unassigned - found writing this spec): toggle-filter.directive.ts:34-36
  // and :76-78 pass filterTrueLabel/filterFalseLabel/filterAllLabel to the
  // panel, but toggle-filter-panel.component.ts:20-39 hard-codes
  // "All"/"Yes"/"No" and never renders trueLabel()/falseLabel()/allLabel().
  it.fails('shows a custom true label', async () => {
    await create();
    fixture.componentInstance.trueLabel.set('Paid');
    await settle();
    await openPanel();

    expect(buttonLabels()).toEqual(['All', 'Paid', 'No']);
  });

  // BUG (B7): toggle-filter.directive.ts:62 (base-filter.directive.ts:179) -
  // each open adds a backdropClick() subscription that is never released.
  it.fails('does not accumulate backdrop subscriptions', async () => {
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

  // BUG (B7): base-filter.directive.ts:99-104 - destroy detaches the overlay
  // but never disposes it, leaving the pane in the overlay container.
  it.fails('disposes the overlay when the host is destroyed', async () => {
    await create();
    await openPanel();
    expect(overlayPanes()).toHaveLength(1);

    fixture.destroy();

    expect(overlayPanes()).toHaveLength(0);
  });
});
