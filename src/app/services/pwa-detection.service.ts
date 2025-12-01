import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

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
    // 1. ROBUST CHECK: Are we running in a Capacitor Native Shell?
    // This returns true ONLY for Android/iOS apps, and false for Web/PWA.
    if (Capacitor.isNativePlatform()) {
      // We map 'native' to 'twa' to keep your existing app logic working
      // without renaming the type everywhere.
      this.displayMode.set('twa');
      return;
    }

    // 2. Check for Standard PWA (Installed to Home Screen from Browser)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone; // iOS Safari

    if (isStandalone) {
      this.displayMode.set('standalone');
      return;
    }

    // 3. Default to standard browser
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
