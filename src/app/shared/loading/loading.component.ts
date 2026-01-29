import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import {
  AfterViewInit,
  ApplicationRef,
  Component,
  effect,
  inject,
  OnDestroy,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from './loading.service';

@Component({
  selector: 'loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  imports: [MatProgressSpinner],
  encapsulation: ViewEncapsulation.None,
})
export class LoadingComponent implements AfterViewInit, OnDestroy {
  protected readonly loadingService = inject(LoadingService);
  private readonly appRef = inject(ApplicationRef);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly analytics = inject(AnalyticsService);

  protected readonly loadingTemplate =
    viewChild<TemplateRef<unknown>>('loadingTemplate');

  private portalOutlet!: DomPortalOutlet;
  private popoverElement = signal<HTMLElement | null>(null);

  constructor() {
    // Effect to show/hide popover based on loading state
    effect(() => {
      const isLoading = this.loadingService.loading();
      const element = this.popoverElement();
      if (element) {
        try {
          if (isLoading) {
            element.showPopover();
          } else {
            element.hidePopover();
          }
        } catch (error) {
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'show_hide_loading_popover',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // Create a portal outlet attached to the document body
    this.portalOutlet = new DomPortalOutlet(document.body, this.appRef);

    // Attach the template portal
    const portal = new TemplatePortal(
      this.loadingTemplate(),
      this.viewContainerRef
    );
    this.portalOutlet.attach(portal);

    // Get reference to the popover element after it's attached to the DOM
    setTimeout(() => {
      const element = document.querySelector(
        '[data-test-id="loading-spinner-container"]'
      ) as HTMLElement;
      if (element) {
        // Setting the signal will trigger the effect
        this.popoverElement.set(element);
      }
    });
  }

  ngOnDestroy(): void {
    this.portalOutlet?.dispose();
  }
}
