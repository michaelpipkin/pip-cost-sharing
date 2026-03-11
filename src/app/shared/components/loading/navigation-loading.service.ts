import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from './loading.service';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class NavigationLoadingService {
  protected readonly router = inject(Router);
  protected readonly loadingService = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loadingService.loadingOn('navigation');
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel
      ) {
        this.loadingService.loadingOff('navigation');
      } else if (event instanceof NavigationError) {
        this.loadingService.loadingOff('navigation');
        this.analytics.logEvent('app_error', {
          component: 'NavigationLoadingService',
          action: 'navigation',
          message: event.url,
          error:
            event.error instanceof Error
              ? event.error.message
              : String(event.error),
        });
      }
    });
  }
}
