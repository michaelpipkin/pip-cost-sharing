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

  it('resolves true immediately when App Check was never initialized (SSR/emulator)', async () => {
    const result = await appCheckTokenReady(50);

    expect(result).toBe(true);
  });

  describe('after initAppCheck', () => {
    beforeEach(() => {
      initAppCheck({} as any);
    });

    it('resolves true once a token becomes available', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockResolvedValueOnce({
        token: 'abc',
      } as any);

      const result = await appCheckTokenReady(1000);

      expect(result).toBe(true);
    });

    it('resolves false when the token fetch rejects', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValueOnce(
        new Error('attestation failed')
      );

      const result = await appCheckTokenReady(1000);

      expect(result).toBe(false);
    });

    it('resolves false when no token arrives before the timeout', async () => {
      vi.spyOn(appCheckModule, 'getToken').mockReturnValueOnce(
        new Promise(() => {
          // never settles - simulates a token fetch that never completes
        })
      );

      const result = await appCheckTokenReady(20);

      expect(result).toBe(false);
    });
  });
});
