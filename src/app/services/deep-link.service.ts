import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Injectable({
  providedIn: 'root',
})
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly analytics = inject(getAnalytics);

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

      logEvent(this.analytics, 'deep_link_received', {
        path: path,
        hasOobCode: !!queryParams['oobCode'],
        mode: queryParams['mode'] || 'none',
      });

      // Navigate to the path with query parameters
      this.router.navigate([path], { queryParams });
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'DeepLinkService',
        action: 'handleDeepLink',
        message: error instanceof Error ? error.message : 'Failed to parse deep link',
      });
    }
  }
}
