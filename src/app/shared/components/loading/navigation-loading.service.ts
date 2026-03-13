import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { LoadingService } from './loading.service';

@Injectable({
  providedIn: 'root',
})
export class NavigationLoadingService {
  protected readonly router = inject(Router);
  protected readonly loadingService = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly dialog = inject(MatDialog);

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
          this.dialog
            .open(ConfirmDialogComponent, {
              data: {
                dialogTitle: 'App Update Available',
                confirmationText:
                  'Your app is out of date. Click Ok to update.',
                confirmButtonText: 'Ok',
              },
              disableClose: true,
            })
            .afterClosed()
            .subscribe(() => window.location.reload());
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
