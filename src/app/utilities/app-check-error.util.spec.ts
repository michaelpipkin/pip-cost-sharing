import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { isLikelyAppCheckError } from './app-check-error.util';

describe('isLikelyAppCheckError', () => {
  it('returns true for a Firestore permission-denied error', () => {
    const error = new FirebaseError(
      'permission-denied',
      'Missing or insufficient permissions.'
    );
    expect(isLikelyAppCheckError(error)).toBe(true);
  });

  it('returns true for a Functions unauthenticated error', () => {
    const error = new FirebaseError('functions/unauthenticated', 'Unauthenticated');
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
