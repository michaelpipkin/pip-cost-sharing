import { ComponentRef, DestroyRef, Directive, inject, input } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { BaseFilterDirective } from './base-filter.directive';
import {
  SelectFilterPanelComponent,
  SelectFilterValue,
} from '@shared/components/filter-panels/select-filter-panel.component';

/**
 * Directive for adding select filter capability to table header cells
 *
 * @example
 * ```html
 * <th mat-header-cell *matHeaderCellDef
 *     [appSelectFilter]="'paidBy'"
 *     [filterService]="filterService"
 *     [filterOptions]="members()"
 *     [displayFn]="memberDisplayFn">
 *   Payer
 * </th>
 * ```
 */
@Directive({
  selector: '[appSelectFilter]',
  standalone: true,
})
export class SelectFilterDirective extends BaseFilterDirective {
  readonly #destroyRef = inject(DestroyRef);

  filterOptions = input<any[]>([]);
  filterMultiple = input(false);
  filterLabel = input('Select value');
  displayFn = input<(option: any) => string>((option) =>
    option?.toString() || '');
  trackByFn = input<(_index: number, option: any) => any>((_index, option) =>
    option);

  private componentRef: ComponentRef<SelectFilterPanelComponent> | null = null;

  constructor() {
    super();
    this.#destroyRef.onDestroy(() => {
      if (this.componentRef) {
        this.componentRef.destroy();
      }
    });
  }

  protected override createFilterPanel(): ComponentPortal<any> {
    return new ComponentPortal(SelectFilterPanelComponent);
  }

  protected override openFilterPanel(): void {
    if (!this.overlayRef) {
      this.overlayRef = this.createOverlay();
    }

    const portal = this.createFilterPanel();
    this.componentRef = this.overlayRef.attach(portal);

    this.setupComponent();

    // Close on backdrop click
    this.overlayRef.backdropClick().subscribe(() => {
      this.closeFilterPanel();
    });
  }

  private setupComponent(): void {
    if (!this.componentRef) return;

    // Set inputs using setInput for signal-based inputs
    this.componentRef.setInput('options', this.filterOptions());
    this.componentRef.setInput('multiple', this.filterMultiple());
    this.componentRef.setInput('label', this.filterLabel());
    this.componentRef.setInput('displayFn', this.displayFn());
    this.componentRef.setInput('trackByFn', this.trackByFn());

    const columnHeader = this.columnHeader();
    if (columnHeader) {
      this.componentRef.setInput('columnLabel', columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter && currentFilter.type === 'select') {
      this.componentRef.setInput('initialValue', {
        value: currentFilter.value,
        multiple: currentFilter.multiple || false,
      });
    }

    // Subscribe to outputs
    this.componentRef.instance.apply.subscribe((value: SelectFilterValue) => {
      this.applyFilter({
        type: 'select',
        value: value.value,
        multiple: value.multiple,
      });
    });

    this.componentRef.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }

}
