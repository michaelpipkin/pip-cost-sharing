import { ComponentRef, Directive } from '@angular/core';
import {
  TextFilterPanelComponent,
  TextFilterValue,
} from '@components/filter-panels/text-filter-panel.component';
import { BaseFilterDirective } from './base-filter.directive';

/**
 * Directive for adding text filter capability to table header cells
 *
 * @example
 * ```html
 * <th mat-header-cell *matHeaderCellDef
 *     [appTextFilter]="'description'"
 *     [filterService]="filterService">
 *   Description
 * </th>
 * ```
 */
@Directive({
  selector: '[appTextFilter]',
  standalone: true,
})
export class TextFilterDirective extends BaseFilterDirective<TextFilterPanelComponent> {
  protected readonly panelType = TextFilterPanelComponent;

  protected override configurePanel(
    panel: ComponentRef<TextFilterPanelComponent>
  ): void {
    // Set inputs using setInput for signal-based inputs
    const columnHeader = this.columnHeader();
    if (columnHeader) {
      panel.setInput('columnLabel', columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter?.type === 'text') {
      panel.setInput('initialValue', {
        value: currentFilter.value,
        caseSensitive: currentFilter.caseSensitive || false,
      });
    }

    // Subscribe to outputs
    panel.instance.apply.subscribe((value: TextFilterValue) => {
      this.applyFilter({
        type: 'text',
        value: value.value,
        caseSensitive: value.caseSensitive,
      });
    });

    panel.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }
}
