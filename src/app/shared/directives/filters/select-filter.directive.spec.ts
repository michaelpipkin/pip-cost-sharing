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
import { SelectFilterDirective } from './select-filter.directive';

interface Option {
  name: string;
}

const ALICE: Option = { name: 'Alice' };
const BOB: Option = { name: 'Bob' };

/**
 * Hosts the directive the way a table header cell does. The outer div counts
 * clicks that bubble out of the header.
 */
@Component({
  imports: [SelectFilterDirective],
  template: `
    <div class="outer" (click)="outerClicks = outerClicks + 1">
      <div
        class="header"
        appSelectFilter
        [filterKey]="'payer'"
        [filterService]="service"
        [filterOptions]="options"
        [filterMultiple]="multiple()"
        [filterLabel]="'Select payer'"
        [displayFn]="display"
        [columnHeader]="'Payer'"
        [enabled]="enabled()"
      >
        @if (sortHeader()) {
          <span class="mat-sort-header-content">Payer</span>
        } @else {
          Payer
        }
      </div>
    </div>
  `,
})
class HostComponent {
  readonly service = TestBed.inject(TableFilterService);
  readonly options = [ALICE, BOB];
  readonly display = (option: Option) => option.name;
  readonly enabled = signal(true);
  readonly multiple = signal(false);
  readonly sortHeader = signal(false);
  outerClicks = 0;
}

describe('SelectFilterDirective (and the base filter behaviour)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let service: TableFilterService<any>;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const header = () =>
    fixture.nativeElement.querySelector('.header') as HTMLElement;
  const icon = () =>
    fixture.nativeElement.querySelector('.filter-icon') as HTMLElement | null;
  const directive = () =>
    fixture.debugElement
      .query(By.directive(SelectFilterDirective))
      .injector.get(SelectFilterDirective);
  const panel = () =>
    document.querySelector('.cdk-overlay-container app-select-filter-panel');
  const create = async () => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await settle();
  };
  const openPanel = async () => {
    icon()!.click();
    await settle();
    // ngModel writes the initial value on a later microtask
    await settle();
  };
  const chooseOption = async (name: string) => {
    document
      .querySelector<HTMLElement>('.mat-mdc-select-trigger')!
      .click();
    await settle();
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('.mat-mdc-option')
    ).find((o) => o.textContent?.trim() === name)!;
    option.click();
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
  });

  describe('filter icon', () => {
    it('is appended to the header cell when there is no sort header', async () => {
      await create();

      expect(icon()).not.toBeNull();
      expect(icon()!.parentElement).toBe(header());
      expect(icon()!.textContent).toBe('filter_alt');
      expect(icon()!.classList.contains('material-icons')).toBe(true);
    });

    it('goes inside .mat-sort-header-content when the header sorts', async () => {
      fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.sortHeader.set(true);
      host = fixture.componentInstance;
      await settle();

      const content = header().querySelector('.mat-sort-header-content')!;
      expect(icon()!.parentElement).toBe(content);
    });

    it('is removed with the host', async () => {
      await create();
      const el = icon()!;
      expect(el.isConnected).toBe(true);

      fixture.destroy();

      expect(el.isConnected).toBe(false);
    });
  });

  describe('enabled', () => {
    it('hides the icon when disabled and shows it again when re-enabled', async () => {
      await create();
      expect(icon()!.style.display).toBe('');

      host.enabled.set(false);
      await settle();
      expect(icon()!.style.display).toBe('none');

      host.enabled.set(true);
      await settle();
      expect(icon()!.style.display).toBe('');
    });

    it('clears an existing filter when it flips to disabled', async () => {
      await create();
      service.setFilter('payer', { type: 'select', value: ALICE });
      service.setFilter('other', { type: 'text', value: 'x' });
      await settle();

      host.enabled.set(false);
      await settle();

      expect(service.hasFilter('payer')).toBe(false);
      // only this column's filter goes
      expect(service.hasFilter('other')).toBe(true);
    });

      // the icon exists, and injectFilterIcon only hides the icon, so a directive
    // created disabled leaves an existing filter applied (and invisible).
    it('clears an existing filter when it is created disabled', async () => {
      service.setFilter('payer', { type: 'select', value: ALICE });
      fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.enabled.set(false);
      host = fixture.componentInstance;
      await settle();

      expect(icon()!.style.display).toBe('none');
      expect(service.hasFilter('payer')).toBe(false);
    });
  });

  describe('filter-active class', () => {
    it('follows the filter service', async () => {
      await create();
      expect(icon()!.classList.contains('filter-active')).toBe(false);

      service.setFilter('payer', { type: 'select', value: ALICE });
      await settle();
      expect(icon()!.classList.contains('filter-active')).toBe(true);

      service.clearFilter('payer');
      await settle();
      expect(icon()!.classList.contains('filter-active')).toBe(false);
    });

    it('is set from the start when a filter already exists', async () => {
      service.setFilter('payer', { type: 'select', value: ALICE });
      await create();

      expect(icon()!.classList.contains('filter-active')).toBe(true);
    });

    it('ignores filters on other columns', async () => {
      await create();
      service.setFilter('other', { type: 'text', value: 'x' });
      await settle();

      expect(icon()!.classList.contains('filter-active')).toBe(false);
    });
  });

  describe('panel', () => {
    it('opens on an icon click without letting the click reach the header', async () => {
      await create();
      expect(panel()).toBeNull();

      await openPanel();

      expect(panel()).not.toBeNull();
      expect(host.outerClicks).toBe(0);
    });

    it('closes on a second icon click', async () => {
      await create();
      await openPanel();
      expect(panel()).not.toBeNull();

      icon()!.click();
      await settle();

      expect(panel()).toBeNull();
    });

    it('closes on a backdrop click, without touching the filter', async () => {
      await create();
      await openPanel();

      clickBackdrop();
      await settle();

      expect(panel()).toBeNull();
      expect(service.hasFilter('payer')).toBe(false);
    });

    it('shows the column header and label it was given', async () => {
      await create();
      await openPanel();

      expect(panel()!.querySelector('h5')!.textContent).toContain('Payer');
      expect(panel()!.querySelector('mat-label')!.textContent).toContain(
        'Select payer'
      );
    });

    it('can be reopened after closing', async () => {
      await create();
      await openPanel();
      clickBackdrop();
      await settle();

      await openPanel();

      expect(panel()).not.toBeNull();
    });
  });

  describe('select behaviour', () => {
    it('applies the chosen option to the service and closes the panel', async () => {
      await create();
      await openPanel();
      await chooseOption('Bob');

      overlayButton('Apply').click();
      await settle();

      expect(service.getFilter('payer')).toEqual({
        type: 'select',
        value: BOB,
        multiple: false,
      });
      expect(panel()).toBeNull();
    });

    it('records a multiple selection with multiple: true', async () => {
      await create();
      host.multiple.set(true);
      await settle();
      await openPanel();
      document.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle();
      document
        .querySelectorAll<HTMLElement>('.mat-mdc-option')
        .forEach((o) => o.click());
      await settle();
      overlayButton('Apply').click();
      await settle();

      expect(service.getFilter('payer')).toEqual({
        type: 'select',
        value: [ALICE, BOB],
        multiple: true,
      });
    });

    it('starts with the current filter value selected', async () => {
      service.setFilter('payer', { type: 'select', value: BOB });
      await create();

      await openPanel();

      expect(panel()!.querySelector('mat-select')!.textContent).toContain(
        'Bob'
      );
    });

    it('starts empty, with Apply disabled, when there is no filter', async () => {
      await create();
      await openPanel();

      expect(overlayButton('Apply').disabled).toBe(true);
    });

    it('Clear removes the filter and closes the panel', async () => {
      service.setFilter('payer', { type: 'select', value: ALICE });
      service.setFilter('other', { type: 'text', value: 'x' });
      await create();
      await openPanel();

      overlayButton('Clear').click();
      await settle();

      expect(service.hasFilter('payer')).toBe(false);
      expect(service.hasFilter('other')).toBe(true);
      expect(panel()).toBeNull();
    });
  });

  describe('destroying the host', () => {
    it('removes the open panel content', async () => {
      await create();
      await openPanel();
      expect(panel()).not.toBeNull();

      fixture.destroy();

      expect(panel()).toBeNull();
    });

      // detaches the overlay, it never disposes it, so the pane (and backdrop)
    // stay in the overlay container for the life of the page.
    it('disposes the overlay, leaving no pane behind', async () => {
      await create();
      await openPanel();
      expect(overlayPanes()).toHaveLength(1);

      fixture.destroy();

      expect(overlayPanes()).toHaveLength(0);
    });
  });

  describe('reopening', () => {
      // openFilterPanel) - every open subscribes to the same overlay's
    // backdropClick() and never unsubscribes, so after N opens one backdrop
    // click runs the close handler N times.
    it('does not accumulate backdrop subscriptions', async () => {
      await create();
      const close = vi.spyOn(directive() as any, 'closeFilterPanel');
      for (let i = 0; i < 3; i++) {
        await openPanel();
        icon()!.click(); // toggle closed
        await settle();
      }
      await openPanel();
      close.mockClear();

      clickBackdrop();
      await settle();

      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
