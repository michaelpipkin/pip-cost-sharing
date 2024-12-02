// Ctrl + K, Ctrl + Shift + S to save without formatting
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as express from 'express';
import * as cors from 'cors';

admin.initializeApp();

import { getCategoriesForGroup } from './categories';
import { encryptApiKey } from './common';

const app = express()

const corsOptions = {
  origin: ['https://pip-cost-sharing.web.app', 'http://localhost:4200'],
}

app.use(cors(corsOptions));

app.post('/encryptApiKey', encryptApiKey);
app.get('/getCategoriesForGroup', getCategoriesForGroup);

exports.api = functions.https.onRequest(app);

// exports.getCategoriesForGroup = functions.https.onRequest(getCategoriesForGroup);
// exports.encryptApiKey = functions.https.onRequest(encryptApiKey);