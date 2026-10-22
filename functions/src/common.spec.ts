import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';

// common.ts builds a Secret Manager client at import time, so it is mocked
// before the module loads: the production branch of getSmtpPassword must
// never reach the real service.
const secretManager = vi.hoisted(() => ({ accessSecretVersion: vi.fn() }));
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class {
    accessSecretVersion = secretManager.accessSecretVersion;
  },
}));

import {
  ADMIN_UID_EMU,
  ADMIN_UID_PROD,
  assertAdmin,
  buildSuccessDelivery,
  callableAppCheck,
  getSmtpPassword,
} from './common';

const asRequest = (auth?: { uid: string }) => ({ auth }) as any;

function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
  secretManager.accessSecretVersion.mockReset();
});

describe('assertAdmin', () => {
  it('rejects a call with no auth as unauthenticated', () => {
    expect(thrownCode(() => assertAdmin(asRequest()))).toBe('unauthenticated');
  });

  it('rejects a call whose auth has an empty uid as unauthenticated', () => {
    expect(thrownCode(() => assertAdmin(asRequest({ uid: '' })))).toBe(
      'unauthenticated'
    );
  });

  it('rejects any other uid as permission-denied', () => {
    expect(thrownCode(() => assertAdmin(asRequest({ uid: 'someone-else' })))).toBe(
      'permission-denied'
    );
  });

  it('returns the uid for the production admin', () => {
    expect(assertAdmin(asRequest({ uid: ADMIN_UID_PROD }))).toBe(ADMIN_UID_PROD);
  });

  it('returns the uid for the emulator admin when running in the emulator', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    expect(assertAdmin(asRequest({ uid: ADMIN_UID_EMU }))).toBe(ADMIN_UID_EMU);
  });

  // BUG (B2): functions/src/common.ts:24 - the emulator admin uid is a
  // fixed, publicly readable constant accepted unconditionally, so anyone who
  // can create that uid in a project's Auth would be an admin in production.
  // It must be accepted only when FUNCTIONS_EMULATOR is 'true'. The module is
  // re-imported under the stubbed env, so the pin flips whether the fix reads
  // the env inside assertAdmin or once at module load (as callableAppCheck does).
  it.fails('rejects the emulator admin uid outside the emulator', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    vi.resetModules();
    const outside = await import('./common');
    expect(
      thrownCode(() => outside.assertAdmin(asRequest({ uid: ADMIN_UID_EMU })))
    ).toBe('permission-denied');
  });

  it('still accepts the production admin uid outside the emulator', () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    expect(assertAdmin(asRequest({ uid: ADMIN_UID_PROD }))).toBe(ADMIN_UID_PROD);
  });
});

describe('buildSuccessDelivery', () => {
  it('builds a one-attempt SUCCESS delivery that keeps the start time and info', () => {
    const startTime = Timestamp.fromMillis(1_700_000_000_000);
    const info = {
      messageId: '<m1@x>',
      accepted: ['a@x.com'],
      rejected: ['b@x.com'],
      response: '250 OK',
    };
    const before = Date.now();
    const delivery = buildSuccessDelivery(startTime, info);
    const after = Date.now();

    expect(delivery.state).toBe('SUCCESS');
    expect(delivery.attempts).toBe(1);
    expect(delivery.startTime).toBe(startTime);
    expect(delivery.info).toEqual(info);
    expect(delivery.endTime).toBeInstanceOf(Timestamp);
    expect(delivery.endTime.toMillis()).toBeGreaterThanOrEqual(before);
    expect(delivery.endTime.toMillis()).toBeLessThanOrEqual(after);
  });
});

describe('getSmtpPassword', () => {
  it('returns SMTP_PASSWORD from the environment in the emulator, without Secret Manager', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true');
    vi.stubEnv('SMTP_PASSWORD', 'emulator-secret');

    expect(await getSmtpPassword()).toBe('emulator-secret');
    expect(secretManager.accessSecretVersion).not.toHaveBeenCalled();
  });

  it('reads the latest smtp-password secret outside the emulator', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    secretManager.accessSecretVersion.mockResolvedValue([
      { payload: { data: Buffer.from('prod-secret') } },
    ]);

    expect(await getSmtpPassword()).toBe('prod-secret');
    expect(secretManager.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/175229019851/secrets/smtp-password/versions/latest',
    });
  });

  it('returns an empty string when the secret has no payload', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    secretManager.accessSecretVersion.mockResolvedValue([{ payload: null }]);

    expect(await getSmtpPassword()).toBe('');
  });
});

describe('callableAppCheck', () => {
  it('is evaluated at import: not enforced under the emulator', () => {
    // The vitest env sets FUNCTIONS_EMULATOR=true before common.ts loads.
    expect(callableAppCheck.enforceAppCheck).toBe(false);
  });
});
