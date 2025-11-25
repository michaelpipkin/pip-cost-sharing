import { Directive, ComponentRef } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { BaseFilterDirective } from './base-filter.directive';
import {
  DateRangeFilterPanelComponent,
  DateRangeFilterValue,
} from '@shared/components/filter-panels/date-range-filter-panel.component';

/**
 * Directive for adding date range filter capability to table header cells
 *
 * @example
 * ```html
 * <th mat-header-cell *matHeaderCellDef
 *     [appDateRangeFilter]="'date'"
 *     [filterService]="filterService">
 *   Date
 * </th>
 * ```
 */
@Directive({
  selector: '[appDateRangeFilter]',
  standalone: true,
})
export class DateRangeFilterDirective extends BaseFilterDirective {
  private componentRef: ComponentRef<DateRangeFilterPanelComponent> | null =
    null;

  protected override createFilterPanel(): ComponentPortal<any> {
    return new ComponentPortal(DateRangeFilterPanelComponent);
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
    if (this.columnHeader) {
      this.componentRef.setInput('columnLabel', this.columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter && currentFilter.type === 'dateRange') {
      this.componentRef.setInput('initialValue', {
        start: currentFilter.start,
        end: currentFilter.end,
      });
    }

    // Subscribe to outputs
    this.componentRef.instance.apply.subscribe(
      (value: DateRangeFilterValue) => {
        this.applyFilter({
          type: 'dateRange',
          start: value.start,
          end: value.end,
        });
      }
    );

    this.componentRef.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }

  override ngOnDestroy(): void {
    if (this.componentRef) {
      this.componentRef.destroy();
    }
    super.ngOnDestroy();
  }
}
