import { ComponentRef, Directive, input } from '@angular/core';
import {
  ToggleFilterPanelComponent,
  ToggleFilterValue,
} from '@components/filter-panels/toggle-filter-panel.component';
import { BaseFilterDirective } from './base-filter.directive';

/**
 * Directive for adding toggle (boolean) filter capability to table header cells
 *
 * @example
 * ```html
 * <th mat-header-cell *matHeaderCellDef
 *     [appToggleFilter]="'paid'"
 *     [filterService]="filterService">
 *   Paid
 * </th>
 * ```
 */
@Directive({
  selector: '[appToggleFilter]',
  standalone: true,
})
export class ToggleFilterDirective extends BaseFilterDirective<ToggleFilterPanelComponent> {
  readonly filterTrueLabel = input('Yes');
  readonly filterFalseLabel = input('No');
  readonly filterAllLabel = input('All');

  protected readonly panelType = ToggleFilterPanelComponent;

  protected override configurePanel(
    panel: ComponentRef<ToggleFilterPanelComponent>
  ): void {
    // Set inputs using setInput for signal-based inputs
    const columnHeader = this.columnHeader();
    if (columnHeader) {
      panel.setInput('columnLabel', columnHeader);
    }

    panel.setInput('trueLabel', this.filterTrueLabel());
    panel.setInput('falseLabel', this.filterFalseLabel());
    panel.setInput('allLabel', this.filterAllLabel());

    const currentFilter = this.getCurrentFilter();
    if (currentFilter?.type === 'toggle') {
      panel.setInput('initialValue', {
        value: currentFilter.value,
      });
    }

    // Subscribe to outputs
    panel.instance.apply.subscribe((value: ToggleFilterValue) => {
      // If value is null, clear the filter instead of applying it
      if (value.value === null) {
        this.clearFilter();
      } else {
        this.applyFilter({
          type: 'toggle',
          value: value.value,
        });
      }
    });

    panel.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }
}
