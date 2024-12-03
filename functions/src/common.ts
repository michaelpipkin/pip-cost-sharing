import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();
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
    const userName: string = request.body.userName;
    const apiKey: string = crypto.randomUUID().toString();
    const encryptionKey = await getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey, 'base64'),
      iv
    );
    let encryptedApiKey = cipher.update(apiKey, 'utf8', 'base64');
    encryptedApiKey += cipher.final('base64');

    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const apiKeyHash = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const apiKeyCollection = db.collection('apiKeys');
    await apiKeyCollection.add({
      encryptedApiKey,
      apiKeyHash,
      iv: iv.toString('base64'),
      userName,
      dateCreated: new Date(),
    });

    response.status(200).send({ apiKey });
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

export const validateApiKey = async (apiKey: string) => {
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const apiKeySnapshot = await db
    .collection('apiKeys')
    .where('apiKeyHash', '==', apiKeyHash)
    .get();

  if (apiKeySnapshot.empty) {
    return false;
  }

  let authorized = false;

  for (const apiKeyDoc of apiKeySnapshot.docs) {
    const encryptedApiKey = apiKeyDoc.data().encryptedApiKey;
    const iv = apiKeyDoc.data().iv;

    const decryptedApiKey = await decryptApiKey(encryptedApiKey, iv);

    if (decryptedApiKey === apiKey) {
      authorized = true;
      break;
    }
  }

  return authorized;
};
