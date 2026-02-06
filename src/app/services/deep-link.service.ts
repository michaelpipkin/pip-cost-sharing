import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AnalyticsService } from '@services/analytics.service';

@Injectable({
  providedIn: 'root',
})
export class DeepLinkService {
  protected readonly router = inject(Router);
  protected readonly analytics = inject(AnalyticsService);

  initialize(): void {
    // Only set up listener on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      this.handleDeepLink(event.url);
    });
  }

  private handleDeepLink(url: string): void {
    try {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      const queryParams: { [key: string]: string } = {};

      parsedUrl.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      this.analytics.logEvent('deep_link_received', {
        path: path,
        hasOobCode: !!queryParams['oobCode'],
        mode: queryParams['mode'] || 'none',
      });

      // Navigate to the path with query parameters
      this.router.navigate([path], { queryParams });
    } catch (error) {
      this.analytics.logEvent('error', {
        service: 'DeepLinkService',
        action: 'handleDeepLink',
        message: error instanceof Error ? error.message : 'Failed to parse deep link',
      });
    }
  }
}
