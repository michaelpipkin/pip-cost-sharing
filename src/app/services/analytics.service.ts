import { inject, Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { Capacitor } from '@capacitor/core';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  protected readonly auth = inject(getAuth);
  protected readonly fns = inject(getFunctions);

  private readonly pendingSnapshotErrors = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  async logEvent(
    name: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    try {
      await FirebaseAnalytics.logEvent({ name, params });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  async logScreenView(screenName: string): Promise<void> {
    try {
      await FirebaseAnalytics.logEvent({
        name: 'screen_view',
        params: { firebase_screen: screenName, firebase_screen_class: screenName },
      });
    } catch (error) {
      console.error('Analytics screen_view error:', error);
    }
  }

  logSnapshotError(
    component: string,
    action: string,
    message: string,
    error?: string
  ): void {
    const isTransient =
      error?.includes('Missing or insufficient permissions') ?? false;

    if (!isTransient) {
      this.logError(component, action, message, error);
      return;
    }

    const key = `${component}|${action}`;
    if (this.pendingSnapshotErrors.has(key)) return;

    const timer = setTimeout(() => {
      this.pendingSnapshotErrors.delete(key);
      if (this.auth.currentUser === null) return;
      this.logError(component, action, message, error);
    }, 10000);

    this.pendingSnapshotErrors.set(key, timer);
  }

  // Device/platform context attached to every logged error - not
  // App Check-specific, just generally useful for telling apart e.g.
  // "Android WebView" from "desktop browser" without guessing from the
  // error message alone (see 2026-08-18 App Check throttle investigation).
  private buildAdditionalInfo(): string {
    const platform = Capacitor.getPlatform();
    const isNative = Capacitor.isNativePlatform();
    return `platform: ${platform}, native: ${isNative}, userAgent: ${navigator.userAgent}`;
  }

  async logError(
    component: string,
    action: string,
    message: string,
    error?: string
  ): Promise<void> {
    const params: Record<string, unknown> = { component, action, message };
    if (error !== undefined) params['error'] = error;
    params['additionalInfo'] = this.buildAdditionalInfo();

    FirebaseAnalytics.logEvent({ name: 'app_error', params }).catch((e: unknown) =>
      console.error('Analytics logError (GA) failed:', e)
    );

    httpsCallable(this.fns, 'logAppError')(params).catch((e: unknown) =>
      console.error('Analytics logError (Firestore) failed:', e)
    );
  }
}
