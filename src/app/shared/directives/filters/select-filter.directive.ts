import { ComponentRef, Directive, input } from '@angular/core';
import {
  SelectFilterPanelComponent,
  SelectFilterValue,
} from '@components/filter-panels/select-filter-panel.component';
import { BaseFilterDirective } from './base-filter.directive';

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
export class SelectFilterDirective extends BaseFilterDirective<SelectFilterPanelComponent> {
  readonly filterOptions = input<any[]>([]);
  readonly filterMultiple = input(false);
  readonly filterLabel = input('Select value');
  readonly displayFn = input<(option: any) => string>(
    (option) => option?.toString() || ''
  );
  readonly trackByFn = input<(_index: number, option: any) => any>(
    (_index, option) => option
  );

  protected readonly panelType = SelectFilterPanelComponent;

  protected override configurePanel(
    panel: ComponentRef<SelectFilterPanelComponent>
  ): void {
    // Set inputs using setInput for signal-based inputs
    panel.setInput('options', this.filterOptions());
    panel.setInput('multiple', this.filterMultiple());
    panel.setInput('label', this.filterLabel());
    panel.setInput('displayFn', this.displayFn());
    panel.setInput('trackByFn', this.trackByFn());

    const columnHeader = this.columnHeader();
    if (columnHeader) {
      panel.setInput('columnLabel', columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter?.type === 'select') {
      panel.setInput('initialValue', {
        value: currentFilter.value,
        multiple: currentFilter.multiple || false,
      });
    }

    // Subscribe to outputs
    panel.instance.apply.subscribe((value: SelectFilterValue) => {
      this.applyFilter({
        type: 'select',
        value: value.value,
        multiple: value.multiple,
      });
    });

    panel.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }
}
