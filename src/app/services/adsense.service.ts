import { inject, Injectable } from '@angular/core';
import { PwaDetectionService } from './pwa-detection.service';

@Injectable({
  providedIn: 'root',
})
export class AdSenseService {
  private pwaService = inject(PwaDetectionService);
  private isLoaded = false;

  constructor() {
    // Only load AdSense for browser users, not native app users
    // Native app users get AdMob ads instead (handled by AdMobService)
    if (this.pwaService.isRunningInBrowser()) {
      this.loadAdSense();
    }
  }

  private loadAdSense(): void {
    if (this.isLoaded) return;

    const script = document.createElement('script');
    script.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9151218051877311';
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    this.isLoaded = true;
  }
}
