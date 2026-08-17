import type { FirebaseApp } from 'firebase/app';
import {
  AppCheck,
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { appCheckConfig } from './firebase.config';

let appCheck: AppCheck | null = null;

// Registers App Check on the given FirebaseApp and captures the instance so
// appCheckTokenReady() below can await its first token. Call at most once,
// at module scope alongside the other Firebase service initialization in
// app.config.ts - initializeAppCheck must run before any other service
// issues its first request.
export const initAppCheck = (app: FirebaseApp): void => {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckConfig.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
};

// 'timeout' vs 'error' distinguishes a token that was still in flight when
// the caller gave up (a startup-race symptom, fixable by waiting longer or
// starting the fetch earlier) from one that was actively rejected (e.g.
// reCAPTCHA scoring, fixable only by addressing attestation itself, not by
// waiting longer) - both looked identical (plain `false`) before this
// distinction was added, which made the two failure modes impossible to
// tell apart from the error log alone. `detail` carries getToken()'s actual
// rejection message when reason is 'error' - the specific Firebase/reCAPTCHA
// error (e.g. a low bot score, a network failure, a misconfigured domain)
// rather than just knowing that *some* rejection happened.
export type AppCheckTokenResult = {
  ready: boolean;
  reason: 'ready' | 'timeout' | 'error' | 'not-initialized';
  detail?: string;
};

// Resolves once an App Check token is available, or after timeoutMs elapses.
// The Firebase SDK does not block enforced callable requests on App Check
// readiness - it soft-fails and sends the request with no token if one
// isn't available yet, which is what causes early-boot callables to get
// rejected. Callers to an enforced callable should await this first.
//
// Resolves { ready: true, reason: 'not-initialized' } immediately when App
// Check was never initialized (SSR/prerender or environment.useEmulators
// both skip it in app.config.ts) - there is no token to wait for, so the
// gate must not block.
export const appCheckTokenReady = async (
  timeoutMs = 10_000
): Promise<AppCheckTokenResult> => {
  if (!appCheck) return { ready: true, reason: 'not-initialized' };

  const tokenReady: Promise<AppCheckTokenResult> = getToken(appCheck)
    .then((): AppCheckTokenResult => ({ ready: true, reason: 'ready' }))
    .catch(
      (error: unknown): AppCheckTokenResult => ({
        ready: false,
        reason: 'error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      })
    );

  let timer: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<AppCheckTokenResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ready: false, reason: 'timeout' }),
      timeoutMs
    );
  });

  const result = await Promise.race([tokenReady, timedOut]);
  clearTimeout(timer!);
  return result;
};

// Test-only. This module's state is a singleton shared for the lifetime of
// the process, including across spec files in the same Vitest worker (this
// project runs with isolate: false) - specs exercising the "never
// initialized" path must reset it first rather than relying on file load
// order.
export const resetAppCheckForTesting = (): void => {
  appCheck = null;
};
