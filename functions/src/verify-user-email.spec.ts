import { getAuth } from 'firebase-admin/auth';
import { describe, expect, it } from 'vitest';
import { uniqueId } from './test-fixtures';
import { verifyUserEmail } from './index';

// verifyUserEmail is the emulator-only helper e2e tests use to verify a
// seeded account's email. It only exists when FUNCTIONS_EMULATOR is 'true'
// when index.ts loads (the vitest env sets it).
function call(data: Record<string, unknown>) {
  return Promise.resolve((verifyUserEmail as any).run({ data }));
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('verifyUserEmail', () => {
  it('rejects a call with no uid as invalid-argument', async () => {
    expect(await codeOf(call({}))).toBe('invalid-argument');
  });

  it('rejects an empty uid as invalid-argument', async () => {
    expect(await codeOf(call({ uid: '' }))).toBe('invalid-argument');
  });

  it('marks an existing unverified account email-verified', async () => {
    const uid = uniqueId('u');
    await getAuth().createUser({
      uid,
      email: `${uid}@verify-user-email.test`,
      password: 'password123',
      emailVerified: false,
    });
    expect((await getAuth().getUser(uid)).emailVerified).toBe(false);

    const result = await call({ uid });

    expect(result).toEqual({
      success: true,
      message: `Email verified for user ${uid}`,
    });
    expect((await getAuth().getUser(uid)).emailVerified).toBe(true);
  });

  it('answers an unknown uid with internal, without leaking the cause', async () => {
    const promise = call({ uid: uniqueId('missing') });

    expect(await codeOf(promise)).toBe('internal');
    await expect(promise).rejects.toMatchObject({
      message: 'Error verifying user email',
    });
  });
});
