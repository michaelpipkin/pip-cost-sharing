import { ComponentRef, Directive } from '@angular/core';
import {
  DateRangeFilterPanelComponent,
  DateRangeFilterValue,
} from '@components/filter-panels/date-range-filter-panel.component';
import { BaseFilterDirective } from './base-filter.directive';

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
export class DateRangeFilterDirective extends BaseFilterDirective<DateRangeFilterPanelComponent> {
  protected readonly panelType = DateRangeFilterPanelComponent;

  protected override configurePanel(
    panel: ComponentRef<DateRangeFilterPanelComponent>
  ): void {
    // Set inputs using setInput for signal-based inputs
    const columnHeader = this.columnHeader();
    if (columnHeader) {
      panel.setInput('columnLabel', columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter?.type === 'dateRange') {
      panel.setInput('initialValue', {
        start: currentFilter.start,
        end: currentFilter.end,
      });
    }

    // Subscribe to outputs
    panel.instance.apply.subscribe((value: DateRangeFilterValue) => {
      this.applyFilter({
        type: 'dateRange',
        start: value.start,
        end: value.end,
      });
    });

    panel.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }
}
