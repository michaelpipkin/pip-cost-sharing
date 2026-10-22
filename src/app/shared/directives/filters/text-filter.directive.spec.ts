import { OverlayRef } from '@angular/cdk/overlay';
import { Component, ComponentRef, signal } from '@angular/core';
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
import { TextFilterDirective } from './text-filter.directive';

@Component({
  imports: [TextFilterDirective],
  template: `
    <div
      class="header"
      appTextFilter
      [filterKey]="'description'"
      [filterService]="service"
      [columnHeader]="'Description'"
      [enabled]="enabled()"
    >
      Description
    </div>
  `,
})
class HostComponent {
  readonly service = TestBed.inject(TableFilterService);
  readonly enabled = signal(true);
}

describe('TextFilterDirective', () => {
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
      .query(By.directive(TextFilterDirective))
      .injector.get(TextFilterDirective);
  const panel = () =>
    document.querySelector('.cdk-overlay-container app-text-filter-panel');
  const textInput = () =>
    panel()!.querySelector('input[matInput]') as HTMLInputElement;
  const caseCheckbox = () =>
    panel()!.querySelector('mat-checkbox input') as HTMLInputElement;
  const openPanel = async () => {
    icon().click();
    await settle();
    await settle();
  };
  const typeText = async (text: string) => {
    textInput().value = text;
    textInput().dispatchEvent(new Event('input'));
    await settle();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [TableFilterService],
    }).compileComponents();
    service = TestBed.inject(TableFilterService);
    fixture = TestBed.createComponent(HostComponent);
    await settle();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    disposeOverlays();
  });

  it('applies the typed text, case-insensitive by default, and closes the panel', async () => {
    await openPanel();
    expect(overlayButton('Apply').disabled).toBe(true);

    await typeText('pizza');
    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('description')).toEqual({
      type: 'text',
      value: 'pizza',
      caseSensitive: false,
    });
    expect(panel()).toBeNull();
  });

  it('applies caseSensitive when the box is ticked', async () => {
    await openPanel();
    await typeText('Pizza');
    caseCheckbox().click();
    await settle();

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('description')).toEqual({
      type: 'text',
      value: 'Pizza',
      caseSensitive: true,
    });
  });

  it('round-trips the current text and caseSensitive into the reopened panel', async () => {
    service.setFilter('description', {
      type: 'text',
      value: 'Pizza',
      caseSensitive: true,
    });
    await openPanel();

    expect(textInput().value).toBe('Pizza');
    expect(caseCheckbox().checked).toBe(true);

    overlayButton('Apply').click();
    await settle();

    expect(service.getFilter('description')).toEqual({
      type: 'text',
      value: 'Pizza',
      caseSensitive: true,
    });
  });

  it('shows an unticked box for a filter that is case-insensitive', async () => {
    service.setFilter('description', { type: 'text', value: 'pizza' });
    await openPanel();

    expect(textInput().value).toBe('pizza');
    expect(caseCheckbox().checked).toBe(false);
  });

  it('Clear removes only its filter and closes the panel', async () => {
    service.setFilter('description', { type: 'text', value: 'pizza' });
    service.setFilter('other', { type: 'toggle', value: true });
    await openPanel();

    overlayButton('Clear').click();
    await settle();

    expect(service.hasFilter('description')).toBe(false);
    expect(service.hasFilter('other')).toBe(true);
    expect(panel()).toBeNull();
  });

  it('closes on a backdrop click without changing the filter', async () => {
    service.setFilter('description', { type: 'text', value: 'pizza' });
    await openPanel();
    await typeText('changed');

    clickBackdrop();
    await settle();

    expect(panel()).toBeNull();
    expect(service.getFilter('description')).toEqual({
      type: 'text',
      value: 'pizza',
    });
  });

  describe('panel outputs', () => {
    it('still applies once per click (outputs are not subscribed twice)', async () => {
      const setFilter = vi.spyOn(service, 'setFilter');
      await openPanel();
      await typeText('pizza');

      overlayButton('Apply').click();
      await settle();

      expect(setFilter).toHaveBeenCalledTimes(1);
    });

    it('keeps working when the panel is opened a second time', async () => {
      const setFilter = vi.spyOn(service, 'setFilter');
      await openPanel();
      clickBackdrop();
      await settle();

      await openPanel();
      await typeText('soup');
      overlayButton('Apply').click();
      await settle();

      expect(setFilter).toHaveBeenCalledTimes(1);
      expect(service.getFilter('description')).toMatchObject({ value: 'soup' });
    });

    it('removes the open panel content when the host is destroyed', async () => {
      await openPanel();
      expect(panel()).not.toBeNull();

      fixture.destroy();

      expect(panel()).toBeNull();
    });

      // setTimeout reassigns componentRef from the nonexistent
    // OverlayRef._attachedPortal, so after the first tick the directive no
    // longer tracks the panel component that attach() returned (and its
    // destroy handler has nothing to destroy). The timeout is also dead weight
    // next to the setupComponent() call in openFilterPanel.
    // The fix may drop componentRef altogether (e.g. the base class owning
    // panel disposal); if so, remove this marker and keep an equivalent check
    // that destroying the host destroys the panel component.
    it('destroys the attached panel component when the host is destroyed', async () => {
      const attach = vi.spyOn(OverlayRef.prototype, 'attach');
      await openPanel();
      const attached = attach.mock.results[0]!.value as ComponentRef<unknown>;
      let panelDestroyed = false;
      attached.onDestroy(() => (panelDestroyed = true));

      fixture.destroy();

      expect(panelDestroyed).toBe(true);
    });
  });

  describe('reopening', () => {
      // (base-filter.directive.ts:179): each open adds a backdropClick()
    // subscription to the same overlay and none is released.
    it('does not accumulate backdrop subscriptions', async () => {
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

      // but never disposes it, leaving the pane in the overlay container.
    it('disposes the overlay when the host is destroyed', async () => {
      await openPanel();
      expect(overlayPanes()).toHaveLength(1);

      fixture.destroy();

      expect(overlayPanes()).toHaveLength(0);
    });
  });
});
