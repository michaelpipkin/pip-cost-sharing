import type { Auth } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import { verifiedTokenEmail } from './verified-token-email.util';

function authWith(claims: Record<string, unknown> | null) {
  const getIdTokenResult = vi.fn(async () => ({ claims }));
  return {
    auth: {
      currentUser: claims === null ? null : { getIdTokenResult },
    } as unknown as Auth,
    getIdTokenResult,
  };
}

describe('verifiedTokenEmail', () => {
  it('returns the refreshed token address when it is verified', async () => {
    const { auth, getIdTokenResult } = authWith({
      email: 'me@test.com',
      email_verified: true,
    });

    expect(await verifiedTokenEmail(auth)).toBe('me@test.com');
    expect(getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it.each([
    ['unverified', { email: 'me@test.com', email_verified: false }],
    ['missing the verified claim', { email: 'me@test.com' }],
    ['not one valid address', { email: 'me@my_domain.com', email_verified: true }],
    ['two addresses', { email: 'a@test.com, b@test.com', email_verified: true }],
    ['without an address', { email_verified: true }],
  ])('returns an empty string when the address is %s', async (_label, claims) => {
    const { auth } = authWith(claims);

    expect(await verifiedTokenEmail(auth)).toBe('');
  });

  it('returns an empty string when nobody is signed in', async () => {
    const { auth } = authWith(null);

    expect(await verifiedTokenEmail(auth)).toBe('');
  });

  it('lets a failed token refresh reject', async () => {
    const auth = {
      currentUser: {
        getIdTokenResult: vi.fn().mockRejectedValue(new Error('network')),
      },
    } as unknown as Auth;

    await expect(verifiedTokenEmail(auth)).rejects.toThrow('network');
  });
});
