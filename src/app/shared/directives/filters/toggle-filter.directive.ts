import { Directive, ComponentRef, Input } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { BaseFilterDirective } from './base-filter.directive';
import {
  ToggleFilterPanelComponent,
  ToggleFilterValue,
} from '@shared/components/filter-panels/toggle-filter-panel.component';

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
export class ToggleFilterDirective extends BaseFilterDirective {
  @Input() filterTrueLabel = 'Yes';
  @Input() filterFalseLabel = 'No';
  @Input() filterAllLabel = 'All';

  private componentRef: ComponentRef<ToggleFilterPanelComponent> | null = null;

  protected override createFilterPanel(): ComponentPortal<any> {
    return new ComponentPortal(ToggleFilterPanelComponent);
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

    this.componentRef.setInput('trueLabel', this.filterTrueLabel);
    this.componentRef.setInput('falseLabel', this.filterFalseLabel);
    this.componentRef.setInput('allLabel', this.filterAllLabel);

    const currentFilter = this.getCurrentFilter();
    if (currentFilter && currentFilter.type === 'toggle') {
      this.componentRef.setInput('initialValue', {
        value: currentFilter.value,
      });
    }

    // Subscribe to outputs
    this.componentRef.instance.apply.subscribe((value: ToggleFilterValue) => {
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
