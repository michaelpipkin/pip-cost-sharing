import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as appCheckModule from 'firebase/app-check';
import {
  appCheckTokenReady,
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

    it('resolves not-ready with reason "error" when the token fetch rejects', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValueOnce(
        new Error('attestation failed')
      );

      const result = await appCheckTokenReady(1000);

      expect(result).toEqual({ ready: false, reason: 'error' });
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
