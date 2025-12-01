import { inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { PwaDetectionService } from './pwa-detection.service';

@Injectable({
  providedIn: 'root',
})
export class AdMobService {
  private router = inject(Router);
  private pwaService = inject(PwaDetectionService);
  protected readonly analytics = inject(getAnalytics);

  // Configuration
  private readonly ADS_FREQUENCY = 3; // Show ad every 3 page navigations
  private readonly ANDROID_INTERSTITIAL_ID =
    'ca-app-pub-9151218051877311/2705618600';
  // State
  private navigationCount = 0;
  private isAdLoaded = signal<boolean>(false);
  private isInitialized = false;

  constructor() {
    // Only initialize if we are in an App environment (TWA or Standalone)
    // and not just a regular browser, to comply with policy.
    if (this.pwaService.isRunningAsApp()) {
      this.initializeAdMob();
      this.setupAutoAdLogic();
    }
  }

  private async initializeAdMob() {
    try {
      await AdMob.initialize();
      this.isInitialized = true;

      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        this.isAdLoaded.set(false);
        this.loadInterstitial();
      });

      // Load the first ad immediately so it's ready
      this.loadInterstitial();
    } catch (error) {
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'initialize_admob',
        message: error.message,
      });
    }
  }

  private setupAutoAdLogic() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;

      // Skip specific routes where we don't want ads
      if (event.urlAfterRedirects.includes('login')) return;
      if (event.urlAfterRedirects.includes('home')) return;

      this.navigationCount++;
      this.checkForAutoAd();
    });
  }

  private checkForAutoAd() {
    // Logic: If we hit the frequency threshold AND an ad is ready
    if (this.navigationCount >= this.ADS_FREQUENCY) {
      if (this.isAdLoaded()) {
        this.showInterstitial();
      } else {
        // If ad wasn't ready, try loading one for next time
        // but reset count so we don't spam the user on the very next click
        this.loadInterstitial();
      }
    }
  }

  private async loadInterstitial() {
    if (!this.isInitialized) return;

    try {
      const options = {
        adId: this.ANDROID_INTERSTITIAL_ID,
      };

      await AdMob.prepareInterstitial(options);
      this.isAdLoaded.set(true);
    } catch (error) {
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'load_interstitial',
        message: error.message,
      });
      this.isAdLoaded.set(false);
    }
  }

  private async showInterstitial() {
    try {
      await AdMob.showInterstitial();

      // Reset count immediately on show
      this.navigationCount = 0;

      // Note: We do NOT call loadInterstitial() here.
      // The 'Dismissed' listener in initializeAdMob() handles it safely.
    } catch (error: any) {
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'show_interstitial',
        message: error?.message || 'Show failed',
      });
    }
  }
}
