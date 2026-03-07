import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { LoadingService } from './loading.service';

@Injectable({
  providedIn: 'root',
})
export class NavigationLoadingService {
  protected readonly router = inject(Router);
  protected readonly loadingService = inject(LoadingService);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loadingService.loadingOn('navigation');
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loadingService.loadingOff('navigation');
      }
    });
  }
}
