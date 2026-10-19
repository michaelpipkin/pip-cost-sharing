import { describe, expect, it } from 'vitest';
import { firebaseConfig } from './firebase.config';
import { resolveFirebaseOptions } from './firebase-options';

describe('resolveFirebaseOptions', () => {
  it('returns the real config when no emulator project is set', () =>
    expect(resolveFirebaseOptions(null)).toEqual(firebaseConfig));

  it('swaps in the demo project and its bucket', () => {
    const o = resolveFirebaseOptions('demo-pipsplit-test');
    expect(o.projectId).toBe('demo-pipsplit-test');
    expect(o.storageBucket).toBe('demo-pipsplit-test.appspot.com');
    expect(o.apiKey).toBe(firebaseConfig.apiKey);
  });
});
