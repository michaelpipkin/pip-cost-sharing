import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import { CustomSnackbarComponent } from '../custom-snackbar/custom-snackbar.component';
import { LoadingService } from './loading.service';

@Injectable({
  providedIn: 'root',
})
export class NavigationLoadingService {
  protected readonly router = inject(Router);
  protected readonly loadingService = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly snackbar = inject(MatSnackBar);

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
        const msg =
          event.error instanceof Error
            ? event.error.message
            : String(event.error);
        if (msg.startsWith('Failed to fetch dynamically imported module')) {
          window.location.reload();
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message: 'Your app has been updated to the latest version.',
            },
          });
        } else {
          this.analytics.logError(
            'Navigation Loading Service',
            'navigation',
            event.url,
            msg
          );
        }
      }
    });
  }
}
