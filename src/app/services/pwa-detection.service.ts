import { Injectable, signal } from '@angular/core';

export type DisplayMode = 'browser' | 'standalone' | 'twa';

@Injectable({
  providedIn: 'root',
})
export class PwaDetectionService {
  private displayMode = signal<DisplayMode>('browser');

  constructor() {
    this.detectDisplayMode();
  }

  private detectDisplayMode(): void {
    // Check if running as TWA (Trusted Web Activity) - Android app
    const isTwa =
      document.referrer.includes('android-app://') ||
      (window.matchMedia('(display-mode: standalone)').matches &&
        navigator.userAgent.includes('wv')); // 'wv' indicates WebView

    if (isTwa) {
      this.displayMode.set('twa');
      return;
    }

    // Check if running as PWA (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone || // iOS
      document.referrer.includes('android-app://');

    if (isStandalone) {
      this.displayMode.set('standalone');
      return;
    }

    // Default to browser
    this.displayMode.set('browser');
  }

  getDisplayMode() {
    return this.displayMode.asReadonly();
  }

  isRunningInBrowser(): boolean {
    return this.displayMode() === 'browser';
  }

  isRunningAsApp(): boolean {
    return this.displayMode() === 'standalone' || this.displayMode() === 'twa';
  }
}
