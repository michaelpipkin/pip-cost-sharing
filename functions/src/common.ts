import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';

const smsClient = new SecretManagerServiceClient();

export const getEncryptionKey = async () => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return process.env.ENCRYPTION_KEY || '';
  } else {
    const name = 'projects/175229019851/secrets/encryption-key/versions/latest';
    const [version] = await smsClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() || '';
    return payload;
  }
};

export const encryptApiKey = functions.https.onRequest(
  async (request, response) => {
    const apiKey: string = request.body.apiKey;
    const encryptionKey = await getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey, 'base64'),
      iv
    );
    let encryptedApiKey = cipher.update(apiKey, 'utf8', 'base64');
    encryptedApiKey += cipher.final('base64');

    response.status(200).send({ encryptedApiKey, iv: iv.toString('base64') });
  }
);

export const decryptApiKey = async (encryptedApiKey: string, iv: string) => {
  const encryptionKey = await getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(encryptionKey, 'base64'),
    Buffer.from(iv, 'base64')
  );

  let decryptedApiKey = decipher.update(encryptedApiKey, 'base64', 'utf8');
  decryptedApiKey += decipher.final('utf8');

  return decryptedApiKey;
};
