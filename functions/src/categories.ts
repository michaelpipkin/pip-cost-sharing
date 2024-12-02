import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { decryptApiKey } from './common';

const db = admin.firestore();

export const getCategoriesForGroup = functions.https.onRequest(
  async (request, response) => {
    if (request.method !== 'GET') {
      response.status(405).send('Method Not Allowed');
    }

    const apiKey = request.header('x-api-key');

    if (!apiKey) {
      response.status(403).send('Unauthorized');
    }

    try {
      const apiKeyHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');

      const apiKeySnapshot = await db
        .collection('apiKeys')
        .where('apiKeyHash', '==', apiKeyHash)
        .get();

      if (apiKeySnapshot.empty) {
        response.status(401).send('Unauthorized: Invalid API key');
      }

      let authorized = false;

      for (const apiKeyDoc of apiKeySnapshot.docs) {
        const encryptedApiKey = apiKeyDoc.data().encryptedApiKey;
        const iv = apiKeyDoc.data().iv;

        const decryptedApiKey = await decryptApiKey(encryptedApiKey, iv);

        if (decryptedApiKey === apiKey) {
          authorized = true;
          break; // Exit the loop if a match is found
        }
      }

      if (!authorized) {
        response.status(401).send('Unauthorized: Invalid API key');
      }

      const groupId = request.query.groupId;
      const categoriesSnapshot = await db
        .collection(`groups/${groupId}/categories`)
        .get();
      const categories: any[] = [];
      categoriesSnapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() });
      });
      response.status(200).json(categories);
    } catch (error) {
      functions.logger.error('Error fetching categories:', error);
      response.status(500).send('Error fetching categories');
    }
  }
);
