import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { validateApiKey } from './common';

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

    const isApiKeyValid = await validateApiKey(apiKey);
    if (!isApiKeyValid) {
      response.status(401).send('Unauthorized: Invalid API key');
    }

    try {
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
