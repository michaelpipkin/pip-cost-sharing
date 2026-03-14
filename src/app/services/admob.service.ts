import { inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from './pwa-detection.service';

@Injectable({
  providedIn: 'root',
})
export class AdMobService {
  protected readonly router = inject(Router);
  protected readonly pwaService = inject(PwaDetectionService);
  protected readonly analytics = inject(AnalyticsService);

  // Configuration
  private readonly ADS_FREQUENCY = 5; // Show ad every 5 page navigations
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

      // Set video ads to be muted by default (both methods for maximum compatibility)
      await AdMob.setApplicationMuted({ muted: true });
      await AdMob.setApplicationVolume({ volume: 0.0 });

      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        this.isAdLoaded.set(false);
        this.loadInterstitial();
      });

      // Load the first ad immediately so it's ready
      this.loadInterstitial();
    } catch (error) {
      this.analytics.logError(
        'AdMob Service',
        'initializeAdMob',
        'Failed to initialize AdMob',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private setupAutoAdLogic() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;

      // Skip specific routes where we don't want ads
      if (event.urlAfterRedirects.includes('login')) return;
      if (event.urlAfterRedirects.includes('home')) return;
      if (event.urlAfterRedirects.includes('expenses/')) return;
      if (event.urlAfterRedirects.includes('memorized/')) return;
      if (event.urlAfterRedirects.includes('admin/')) return;

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
        // If ad wasn't ready, reset count and try loading for next cycle
        // to avoid hammering the AdMob server on every subsequent navigation
        this.navigationCount = 0;
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
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (
        !(
          msg.startsWith('Error while connecting to ad server') ||
          msg.startsWith('No fill') ||
          msg.startsWith('Internal error')
        )
      ) {
        this.analytics.logError(
          'AdMob Service',
          'loadInterstitial',
          'Failed to load interstitial ad',
          msg
        );
      }
      this.isAdLoaded.set(false);
    }
  }

  private async showInterstitial() {
    try {
      // Ensure muted state right before showing ad
      await AdMob.setApplicationMuted({ muted: true });
      await AdMob.setApplicationVolume({ volume: 0.0 });

      await AdMob.showInterstitial();

      // Reset count immediately on show
      this.navigationCount = 0;

      // Note: We do NOT call loadInterstitial() here.
      // The 'Dismissed' listener in initializeAdMob() handles it safely.
    } catch (error) {
      this.analytics.logError(
        'AdMob Service',
        'showInterstitial',
        'Failed to show interstitial ad',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
