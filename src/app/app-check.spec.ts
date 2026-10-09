import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import { Capacitor } from '@capacitor/core';
import * as appCheckModule from 'firebase/app-check';
import {
  appCheckTokenReady,
  getAppCheckProviderName,
  initAppCheck,
  resetAppCheckForTesting,
} from './app-check';

describe('app-check', () => {
  beforeEach(() => {
    resetAppCheckForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves ready with not-initialized immediately when App Check was never initialized (SSR/emulator)', async () => {
    const result = await appCheckTokenReady(50);

    expect(result).toEqual({ ready: true, reason: 'not-initialized' });
  });

  describe('provider selection', () => {
    const providerPassedToInit = () =>
      (appCheckModule.initializeAppCheck as any).mock.calls.at(-1)[1].provider;

    beforeEach(() => {
      vi.mocked(appCheckModule.initializeAppCheck).mockClear();
    });

    it('uses reCAPTCHA Enterprise on web', () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
      vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);

      initAppCheck({} as any);

      expect(providerPassedToInit()).toBeInstanceOf(
        appCheckModule.ReCaptchaEnterpriseProvider
      );
      expect(getAppCheckProviderName()).toBe('recaptcha');
    });

    it('falls back to reCAPTCHA Enterprise on an Android build that predates the native plugin', () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);

      initAppCheck({} as any);

      expect(providerPassedToInit()).toBeInstanceOf(
        appCheckModule.ReCaptchaEnterpriseProvider
      );
      expect(getAppCheckProviderName()).toBe('recaptcha');
    });

    it('uses a native Play Integrity provider on Android when the plugin is present', () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);

      initAppCheck({} as any);

      expect(providerPassedToInit()).toBeInstanceOf(
        appCheckModule.CustomProvider
      );
      expect(getAppCheckProviderName()).toBe('play-integrity');
    });

    describe('native Play Integrity provider', () => {
      const getNativeToken = () => {
        vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);
        initAppCheck({} as any);
        return providerPassedToInit().customProviderOptions.getToken();
      };

      beforeEach(() => {
        vi.mocked(FirebaseAppCheck.initialize).mockClear();
        vi.mocked(FirebaseAppCheck.getToken).mockClear();
      });

      it('initializes the native plugin once, then returns its token and expiry', async () => {
        vi.mocked(FirebaseAppCheck.getToken).mockResolvedValue({
          token: 'native-jwt',
          expireTimeMillis: 123456,
        });

        const result = await getNativeToken();
        await providerPassedToInit().customProviderOptions.getToken();

        expect(result).toEqual({ token: 'native-jwt', expireTimeMillis: 123456 });
        expect(FirebaseAppCheck.initialize).toHaveBeenCalledTimes(1);
        expect(FirebaseAppCheck.getToken).toHaveBeenCalledTimes(2);
      });

      it('falls back to a 1h expiry when the plugin does not report one', async () => {
        vi.mocked(FirebaseAppCheck.getToken).mockResolvedValue({
          token: 'native-jwt',
        });
        const before = Date.now();

        const result = await getNativeToken();

        expect(result.expireTimeMillis).toBeGreaterThanOrEqual(
          before + 60 * 60 * 1000
        );
      });

      it('retries native initialization on the next request after it fails', async () => {
        vi.mocked(FirebaseAppCheck.getToken).mockResolvedValue({
          token: 'native-jwt',
          expireTimeMillis: 1,
        });
        vi.mocked(FirebaseAppCheck.initialize).mockRejectedValueOnce(
          new Error('play services unavailable')
        );

        await expect(getNativeToken()).rejects.toThrow(
          'play services unavailable'
        );
        await providerPassedToInit().customProviderOptions.getToken();

        expect(FirebaseAppCheck.initialize).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('after initAppCheck', () => {
    beforeEach(() => {
      initAppCheck({} as any);
    });

    it('resolves ready once a token becomes available', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockResolvedValueOnce({
        token: 'abc',
      } as any);

      const result = await appCheckTokenReady(1000);

      expect(result).toEqual({ ready: true, reason: 'ready' });
    });

    it('resolves not-ready with reason "error" and the rejection detail when the token fetch rejects', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValueOnce(
        new Error('attestation failed')
      );

      const result = await appCheckTokenReady(1000);

      expect(result).toEqual({
        ready: false,
        reason: 'error',
        detail: 'attestation failed',
      });
    });

    it('resolves not-ready with a generic detail when the rejection is not an Error', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValueOnce('boom');

      const result = await appCheckTokenReady(1000);

      expect(result).toEqual({
        ready: false,
        reason: 'error',
        detail: 'Unknown error',
      });
    });

    it('resolves not-ready with reason "timeout" when no token arrives before the timeout', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockReturnValueOnce(
        new Promise(() => {
          // never settles - simulates a token fetch that never completes
        })
      );

      const result = await appCheckTokenReady(20);

      expect(result).toEqual({ ready: false, reason: 'timeout' });
    });
  });
});
