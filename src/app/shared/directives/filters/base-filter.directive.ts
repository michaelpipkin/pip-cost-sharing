import {
  Directive,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  ViewContainerRef,
  inject,
  Renderer2,
  effect,
} from '@angular/core';
import {
  Overlay,
  OverlayRef,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  TableFilterService,
  FilterValue,
} from '@shared/services/table-filter.service';

/**
 * Base directive for all table filter directives
 * Handles CDK Overlay, icon injection, and common filter logic
 *
 * @abstract
 * Subclasses must implement:
 * - createFilterPanel(): ComponentPortal for the filter UI
 */
@Directive({
  standalone: true,
})
export abstract class BaseFilterDirective implements OnInit, OnDestroy {
  protected elementRef = inject(ElementRef);
  protected renderer = inject(Renderer2);
  protected overlay = inject(Overlay);
  protected viewContainerRef = inject(ViewContainerRef);

  /**
   * The property key to filter on (e.g., 'date', 'paidBy', 'description')
   */
  @Input({ required: true }) filterKey!: string;

  /**
   * The filter service instance to use for state management
   */
  @Input({ required: true }) filterService!: TableFilterService<any>;

  /**
   * The column header text to display in the filter panel (e.g., 'Date', 'Paid By')
   */
  @Input() columnHeader?: string;

  protected overlayRef: OverlayRef | null = null;
  protected filterIcon: HTMLElement | null = null;
  protected isFilterActive = false;

  constructor() {
    // Watch for filter changes to update icon state
    effect(() => {
      if (this.filterService) {
        const hasFilter = this.filterService.hasFilter(this.filterKey);
        this.updateIconState(hasFilter);
      }
    });
  }

  ngOnInit(): void {
    this.injectFilterIcon();
  }

  ngOnDestroy(): void {
    this.closeFilterPanel();
    if (this.filterIcon) {
      this.filterIcon.remove();
    }
  }

  /**
   * Injects the filter icon into the header cell
   */
  protected injectFilterIcon(): void {
    const headerCell = this.elementRef.nativeElement as HTMLElement;

    // Create filter icon
    this.filterIcon = this.renderer.createElement('mat-icon');
    this.renderer.addClass(this.filterIcon, 'material-icons');
    this.renderer.addClass(this.filterIcon, 'filter-icon');
    this.renderer.setProperty(this.filterIcon, 'textContent', 'filter_alt');

    // Add click listener
    this.renderer.listen(this.filterIcon, 'click', (event: Event) => {
      event.stopPropagation();
      this.toggleFilterPanel();
    });

    // If mat-sort-header is present, append to its content wrapper
    // Otherwise append directly to header cell
    const sortHeaderContent =
      headerCell.querySelector('.mat-sort-header-content');
    const targetElement = sortHeaderContent || headerCell;
    this.renderer.appendChild(targetElement, this.filterIcon);

    // Update initial state
    const hasFilter = this.filterService.hasFilter(this.filterKey);
    this.updateIconState(hasFilter);
  }

  /**
   * Updates the filter icon appearance based on whether a filter is active
   */
  protected updateIconState(isActive: boolean): void {
    if (!this.filterIcon) return;

    this.isFilterActive = isActive;

    if (isActive) {
      this.renderer.addClass(this.filterIcon, 'filter-active');
    } else {
      this.renderer.removeClass(this.filterIcon, 'filter-active');
    }
  }

  /**
   * Toggles the filter panel overlay
   */
  protected toggleFilterPanel(): void {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      this.closeFilterPanel();
    } else {
      this.openFilterPanel();
    }
  }

  /**
   * Opens the filter panel overlay
   */
  protected openFilterPanel(): void {
    if (!this.overlayRef) {
      this.overlayRef = this.createOverlay();
    }

    const portal = this.createFilterPanel();
    this.overlayRef.attach(portal);

    // Close on backdrop click
    this.overlayRef.backdropClick().subscribe(() => {
      this.closeFilterPanel();
    });
  }

  /**
   * Closes the filter panel overlay
   */
  protected closeFilterPanel(): void {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      this.overlayRef.detach();
    }
  }

  /**
   * Creates the CDK overlay with positioning strategy
   */
  protected createOverlay(): OverlayRef {
    const positionStrategy = this.getPositionStrategy();

    return this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
  }

  /**
   * Gets the position strategy for the overlay
   * Positions the panel below the header cell with fallback positions
   */
  protected getPositionStrategy(): FlexibleConnectedPositionStrategy {
    return this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 8,
        },
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'bottom',
          offsetY: -8,
        },
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'end',
          overlayY: 'top',
          offsetY: 8,
        },
      ])
      .withFlexibleDimensions(true)
      .withPush(false);
  }

  /**
   * Applies the current filter value to the service
   */
  protected applyFilter(value: FilterValue): void {
    this.filterService.setFilter(this.filterKey, value);
    this.closeFilterPanel();
  }

  /**
   * Clears the filter for this column
   */
  protected clearFilter(): void {
    this.filterService.clearFilter(this.filterKey);
    this.closeFilterPanel();
  }

  /**
   * Gets the current filter value from the service
   */
  protected getCurrentFilter(): FilterValue | undefined {
    return this.filterService.getFilter(this.filterKey);
  }

  /**
   * Abstract method to create the filter panel content
   * Must be implemented by subclasses
   */
  protected abstract createFilterPanel(): ComponentPortal<any>;
}
