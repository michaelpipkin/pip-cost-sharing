import { ComponentRef, DestroyRef, Directive, inject } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { BaseFilterDirective } from './base-filter.directive';
import {
  TextFilterPanelComponent,
  TextFilterValue,
} from '@shared/components/filter-panels/text-filter-panel.component';

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
export class TextFilterDirective extends BaseFilterDirective {
  readonly #destroyRef = inject(DestroyRef);
  private componentRef: ComponentRef<TextFilterPanelComponent> | null = null;

  constructor() {
    super();
    this.#destroyRef.onDestroy(() => {
      if (this.componentRef) {
        this.componentRef.destroy();
      }
    });
  }

  protected override createFilterPanel(): ComponentPortal<any> {
    const portal = new ComponentPortal(TextFilterPanelComponent);

    // We need to attach the portal and configure the component after attachment
    // This happens in openFilterPanel after attach() is called
    setTimeout(() => {
      if (this.overlayRef && this.overlayRef.hasAttached()) {
        this.componentRef =
          this.overlayRef.overlayElement.querySelector('app-text-filter-panel')
            ? (this.overlayRef as any)._attachedPortal?.componentRef
            : null;

        if (this.componentRef) {
          this.setupComponent();
        }
      }
    });

    return portal;
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
    const columnHeader = this.columnHeader();
    if (columnHeader) {
      this.componentRef.setInput('columnLabel', columnHeader);
    }

    const currentFilter = this.getCurrentFilter();
    if (currentFilter && currentFilter.type === 'text') {
      this.componentRef.setInput('initialValue', {
        value: currentFilter.value,
        caseSensitive: currentFilter.caseSensitive || false,
      });
    }

    // Subscribe to outputs
    this.componentRef.instance.apply.subscribe((value: TextFilterValue) => {
      this.applyFilter({
        type: 'text',
        value: value.value,
        caseSensitive: value.caseSensitive,
      });
    });

    this.componentRef.instance.clear.subscribe(() => {
      this.clearFilter();
    });
  }
}
