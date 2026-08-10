import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { CallableOptions } from 'firebase-functions/v2/https';

const smsClient = new SecretManagerServiceClient();

// The Functions emulator rejects a missing X-Firebase-AppCheck header even
// though the client skips App Check init under emulators, so enforcement
// must be conditional rather than a static `true`.
export const callableAppCheck = {
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
} satisfies CallableOptions;

export const getSmtpPassword = async () => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return process.env.SMTP_PASSWORD;
  } else {
    const name = 'projects/175229019851/secrets/smtp-password/versions/latest';
    const [version] = await smsClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() || '';
    return payload;
  }
};
