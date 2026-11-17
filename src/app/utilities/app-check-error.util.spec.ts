import {
  appCheckTokenReady,
  initAppCheck,
  resetAppCheckForTesting,
} from '@app/app-check';
import { FirebaseError } from 'firebase/app';
import * as appCheckModule from 'firebase/app-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLikelyAppCheckError } from './app-check-error.util';

describe('isLikelyAppCheckError', () => {
  beforeEach(() => {
    resetAppCheckForTesting();
  });

  afterEach(() => {
    resetAppCheckForTesting();
    vi.restoreAllMocks();
  });

  describe('Firestore permission-denied', () => {
    const denied = () =>
      new FirebaseError(
        'permission-denied',
        'Missing or insufficient permissions.'
      );

    it('is a rules denial while no App Check token check has failed', () => {
      expect(isLikelyAppCheckError(denied())).toBe(false);
    });

    it('is a rules denial when the token check succeeded', async () => {
      initAppCheck({} as any);
      vi.spyOn(appCheckModule, 'getToken').mockResolvedValueOnce({
        token: 'abc',
      } as any);
      await appCheckTokenReady(1000);

      expect(isLikelyAppCheckError(denied())).toBe(false);
    });

    it('is App Check when this session could not get a token', async () => {
      initAppCheck({} as any);
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValueOnce(
        new Error('AppCheck: Requests throttled')
      );
      await appCheckTokenReady(1000);

      expect(isLikelyAppCheckError(denied())).toBe(true);
    });

    it('is App Check while the token is still missing after the wait', async () => {
      initAppCheck({} as any);
      vi.spyOn(appCheckModule, 'getToken').mockReturnValueOnce(
        new Promise(() => {}) as any
      );
      await appCheckTokenReady(10);

      expect(isLikelyAppCheckError(denied())).toBe(true);
    });

    it('is a rules denial again once a late token arrives', async () => {
      initAppCheck({} as any);
      let resolveToken!: (token: { token: string }) => void;
      vi.spyOn(appCheckModule, 'getToken').mockReturnValueOnce(
        new Promise((resolve) => {
          resolveToken = resolve;
        }) as any
      );
      await appCheckTokenReady(10);
      resolveToken({ token: 'abc' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(isLikelyAppCheckError(denied())).toBe(false);
    });
  });

  it('returns false for a Functions permission-denied error', () => {
    const error = new FirebaseError(
      'functions/permission-denied',
      'Verify your login email first.'
    );
    expect(isLikelyAppCheckError(error)).toBe(false);
  });

  it('returns true for a Functions unauthenticated error', () => {
    const error = new FirebaseError('functions/unauthenticated', 'Unauthenticated');
    expect(isLikelyAppCheckError(error)).toBe(true);
  });

  it('returns true for a Storage unauthenticated error', () => {
    const error = new FirebaseError(
      'storage/unauthenticated',
      'Firebase Storage: User is not authenticated, please authenticate using Firebase Authentication and try again.'
    );
    expect(isLikelyAppCheckError(error)).toBe(true);
  });

  it('returns false for an unrelated FirebaseError code', () => {
    const error = new FirebaseError('unavailable', 'The service is currently unavailable.');
    expect(isLikelyAppCheckError(error)).toBe(false);
  });

  it('returns false for a plain Error', () => {
    expect(isLikelyAppCheckError(new Error('boom'))).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isLikelyAppCheckError('some string')).toBe(false);
    expect(isLikelyAppCheckError(null)).toBe(false);
    expect(isLikelyAppCheckError(undefined)).toBe(false);
  });
});
