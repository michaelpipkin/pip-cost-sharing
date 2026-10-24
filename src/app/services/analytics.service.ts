import { inject, Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { environment } from '@env/environment';
import { scrubAnalyticsParams } from '@utils/analytics-privacy.util';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AppCheckTokenResult, getAppCheckProviderName } from '../app-check';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  protected readonly auth = inject(getAuth);
  protected readonly fns = inject(getFunctions);

  // False on emulator builds - both the e2e config's demo project
  // (emulators.projectId set) and the plain dev build (useEmulators, e.g.
  // `pnpm start`): the web Analytics SDK would otherwise call the real
  // Firebase Installations and Google Analytics endpoints with the real app
  // credentials, and local test/dev sessions show up as production users
  // (a 10/19 e2e run looked like a 136-user spike). Omitting measurementId
  // in resolveFirebaseOptions is not enough - the SDK still fetches its
  // config by appId/apiKey.
  protected gaEnabled =
    environment.emulators.projectId === null && !environment.useEmulators;

  private readonly pendingSnapshotErrors = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  async logEvent(
    name: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    if (!this.gaEnabled) return;
    try {
      await FirebaseAnalytics.logEvent({
        name,
        params: params ? scrubAnalyticsParams(params) : undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  async logScreenView(screenName: string): Promise<void> {
    if (!this.gaEnabled) return;
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

  // The installed native app's version, e.g. "1.2.3 (45)" - null on web or
  // if the lookup fails. The Android shell loads the live web bundle, so
  // this is the only way to tell which native build a user is on (it
  // decides who a native-only fix, like Play Integrity, would reach).
  // Cached after the first call: the version can't change mid-session.
  #nativeAppVersion?: Promise<string | null>;

  private getNativeAppVersion(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
    const lookup: Promise<string | null> =
      this.#nativeAppVersion ??
      App.getInfo()
        .then(
          (info: { version: string; build: string }) =>
            `${info.version} (${info.build})`
        )
        .catch(() => null);
    this.#nativeAppVersion = lookup;
    return lookup;
  }

  // One event per signed-in session start, success or failure. app_errors
  // only records failures, so on its own it can't give a failure *rate*;
  // this supplies the denominator, broken down by provider (reCAPTCHA vs
  // Play Integrity), platform and native build. Skipped when App Check was
  // never initialized (emulators/SSR) - nothing to measure there.
  async logAppCheckStatus(result: AppCheckTokenResult): Promise<void> {
    if (result.reason === 'not-initialized') return;
    const appVersion = await this.getNativeAppVersion();
    const params: Record<string, unknown> = {
      provider: getAppCheckProviderName(),
      ready: result.ready ? 'true' : 'false',
      reason: result.reason,
      platform: Capacitor.getPlatform(),
    };
    // Not "app_version": Analytics reserves that name for its own
    // automatically collected parameter.
    if (appVersion) params['native_app_version'] = appVersion;
    // Analytics caps parameter values at 100 characters.
    if (result.detail) params['detail'] = result.detail.slice(0, 100);
    await this.logEvent('app_check_status', params);
  }

  // Device/platform context attached to every logged error - not
  // App Check-specific, just generally useful for telling apart e.g.
  // "Android WebView" from "desktop browser" without guessing from the
  // error message alone (see 2026-08-18 App Check throttle investigation).
  private async buildAdditionalInfo(): Promise<string> {
    const platform = Capacitor.getPlatform();
    const isNative = Capacitor.isNativePlatform();
    const appVersion = await this.getNativeAppVersion();
    const versionInfo = appVersion ? `, appVersion: ${appVersion}` : '';
    return `platform: ${platform}, native: ${isNative}${versionInfo}, appCheck: ${getAppCheckProviderName()}, userAgent: ${navigator.userAgent}`;
  }

  async logError(
    component: string,
    action: string,
    message: string,
    error?: string
  ): Promise<void> {
    const params: Record<string, unknown> = { component, action, message };
    if (error !== undefined) params['error'] = error;
    params['additionalInfo'] = await this.buildAdditionalInfo();

    // Only the Analytics copy is scrubbed of email addresses (see
    // analytics-privacy.util.ts); the Firestore copy below keeps them,
    // which is what makes them useful for matching errors to users.
    if (this.gaEnabled) {
      FirebaseAnalytics.logEvent({
        name: 'app_error',
        params: scrubAnalyticsParams(params),
      }).catch((e: unknown) =>
        console.error('Analytics logError (GA) failed:', e)
      );
    }

    httpsCallable(this.fns, 'logAppError')(params).catch((e: unknown) =>
      console.error('Analytics logError (Firestore) failed:', e)
    );
  }
}
