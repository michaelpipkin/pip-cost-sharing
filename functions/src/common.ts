import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const smsClient = new SecretManagerServiceClient();

export const getHCaptchaSecret = async () => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return process.env.HCAPTCHA_SECRET_KEY;
  } else {
    const name =
      'projects/175229019851/secrets/hcaptcha-secret/versions/latest';
    const [version] = await smsClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() || '';
    return payload;
  }
};
