import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getHCaptchaSecret } from './common';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

export const validateHCaptcha = onCall(async (request) => {
  const token = request.data.token;

  // Validate token presence before making network request
  if (!token) {
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with a "token".'
    );
  }

  const secret = await getHCaptchaSecret();
  if (!secret) {
    throw new HttpsError('internal', 'hCaptcha secret is not configured.');
  }

  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);

  try {
    const res = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new HttpsError('unavailable', 'hCaptcha server is unreachable.');
    }

    const data = await res.json();

    if (!data.success) {
      console.warn('hCaptcha validation failed:', data['error-codes']);
      throw new HttpsError(
        'permission-denied',
        'Captcha validation failed. Please try again.'
      );
    }

    return { status: 'verified' };
  } catch (error) {
    // Re-throw HttpsErrors as-is
    if (error instanceof HttpsError) {
      throw error;
    }

    console.error('Error validating hCaptcha:', error);
    throw new HttpsError(
      'internal',
      'An unexpected error occurred during validation.'
    );
  }
});

export const verifyUserEmail = onCall(async (request) => {
  const uid = request.data.uid;

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID is required');
  }

  try {
    await admin.auth().updateUser(uid, {
      emailVerified: true,
    });

    console.log(`Successfully verified email for user: ${uid}`);
    return { success: true, message: `Email verified for user ${uid}` };
  } catch (error) {
    console.error(`Error verifying email for user ${uid}:`, error);
    throw new HttpsError('internal', 'Error verifying user email');
  }
});

export const deleteOldPaidExpenses = onSchedule('0 0 * * *', async () => {
  try {
    const [receipts] = await storage.bucket().getFiles();

    for (const receipt of receipts) {
      try {
        const filePath = receipt.name;
        const expensePath = filePath.replace('receipts', 'expenses');
        const expenseRef = db.doc(expensePath);
        const expenseDoc = await expenseRef.get();

        if (expenseDoc.exists) {
          const expense = expenseDoc.data();

          if (
            !!expense &&
            expense.paid &&
            expense.date.toDate() <
              new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          ) {
            await receipt.delete();
            console.log(`Successfully deleted file: ${filePath}`);

            await expenseRef.update({ receiptPath: null });
            console.log(
              `Updated receiptPath to null for expense: ${expensePath}`
            );
          }
        } else {
          console.log(`Expense document not found for file: ${expensePath}`);
        }
      } catch (error) {
        console.error(`Error processing file ${receipt.name}: `, error);
      }
    }
  } catch (error) {
    console.error('Error fetching files from storage: ', error);
  }
});

export const deleteUserAccount = onCall(async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'User must be authenticated to delete account'
    );
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    const userEmail = userRecord.email || '';
    console.log(
      `Authenticated deletion request for UID: ${uid}, email: ${userEmail}`
    );

    console.log(`Starting account deletion for UID: ${uid}`);

    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      console.log(`Warning: User document not found for UID: ${uid}`);
    } else {
      console.log(`Found user document: ${userDocRef.path}`);
    }

    try {
      const groupsSnapshot = await db.collection('groups').get();

      for (const groupDoc of groupsSnapshot.docs) {
        const membersSnapshot = await groupDoc.ref
          .collection('members')
          .where('userRef', '==', userDocRef)
          .get();

        const batch = db.batch();
        membersSnapshot.docs.forEach((memberDoc) => {
          batch.update(memberDoc.ref, {
            email: '',
            userRef: null,
          });
          console.log(`Anonymizing member document: ${memberDoc.ref.path}`);
        });

        if (membersSnapshot.size > 0) {
          await batch.commit();
          console.log(
            `Updated ${membersSnapshot.size} member(s) in group ${groupDoc.id}`
          );
        }
      }
    } catch (error) {
      console.error('Error updating member documents:', error);
    }

    if (userDoc.exists) {
      await userDocRef.delete();
      console.log(`Deleted user document: ${userDocRef.path}`);
    }

    await admin.auth().deleteUser(uid);
    console.log(`Deleted auth account for UID: ${uid}`);

    return {
      success: true,
      message: 'Account successfully deleted',
    };
  } catch (error: unknown) {
    console.error('Error deleting user account:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Error deleting account: ${errorMessage}`);
  }
});

export const deleteGroup = onCall(async (request) => {
  const uid = request.auth?.uid;
  const groupId = request.data.groupId;

  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'User must be authenticated to delete a group'
    );
  }

  if (!groupId) {
    throw new HttpsError('invalid-argument', 'Group ID is required');
  }

  try {
    // Verify the user is an admin of the group
    const groupRef = db.collection('groups').doc(groupId);
    const membersSnapshot = await groupRef
      .collection('members')
      .where('userRef', '==', db.collection('users').doc(uid))
      .where('groupAdmin', '==', true)
      .get();

    if (membersSnapshot.empty) {
      throw new HttpsError(
        'permission-denied',
        'User must be an admin of the group to delete it'
      );
    }

    console.log(`Starting deletion of group: ${groupId} by user: ${uid}`);

    // Define subcollections to delete
    const subcollections = [
      'members',
      'categories',
      'expenses',
      'splits',
      'history',
      'memorized',
    ];

    // Delete all documents in each subcollection
    for (const subcollection of subcollections) {
      const snapshot = await groupRef.collection(subcollection).get();
      if (!snapshot.empty) {
        const batchSize = 500;
        let batch = db.batch();
        let count = 0;

        for (const doc of snapshot.docs) {
          batch.delete(doc.ref);
          count++;

          if (count >= batchSize) {
            await batch.commit();
            batch = db.batch();
            count = 0;
          }
        }

        if (count > 0) {
          await batch.commit();
        }

        console.log(
          `Deleted ${snapshot.size} documents from ${subcollection} subcollection`
        );
      }
    }

    // Delete receipts from storage
    try {
      const bucket = storage.bucket();
      const [files] = await bucket.getFiles({
        prefix: `groups/${groupId}/receipts/`,
      });

      for (const file of files) {
        await file.delete();
        console.log(`Deleted receipt file: ${file.name}`);
      }

      console.log(`Deleted ${files.length} receipt files`);
    } catch (storageError) {
      console.warn('Error deleting receipt files (may not exist):', storageError);
    }

    // Clear this group as default for any users who have it set
    const usersWithDefault = await db
      .collection('users')
      .where('defaultGroupRef', '==', groupRef)
      .get();

    if (!usersWithDefault.empty) {
      const batch = db.batch();
      usersWithDefault.docs.forEach((userDoc) => {
        batch.update(userDoc.ref, { defaultGroupRef: null });
      });
      await batch.commit();
      console.log(
        `Cleared defaultGroupRef for ${usersWithDefault.size} users`
      );
    }

    // Finally, delete the group document itself
    await groupRef.delete();
    console.log(`Deleted group document: ${groupId}`);

    return {
      success: true,
      message: 'Group and all associated data successfully deleted',
    };
  } catch (error: unknown) {
    console.error('Error deleting group:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Error deleting group: ${errorMessage}`);
  }
});

export const syncAuthEmailsToUsers = onCall(async (request) => {
  console.log('syncAuthEmailsToUsers called');

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  console.log('User authenticated:', request.auth.uid);

  const results: { synced: number; skipped: number; errors: string[] } = {
    synced: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const usersSnapshot = await db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} user documents to process`);

    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const authUser = await admin.auth().getUser(userDoc.id);
        if (authUser.email) {
          batch.update(userDoc.ref, { email: authUser.email });
          batchCount++;
          results.synced++;

          if (batchCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        } else {
          results.skipped++;
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.log(`Could not get auth for ${userDoc.id}: ${errorMessage}`);
        results.errors.push(`${userDoc.id}: ${errorMessage}`);
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(
      `Sync complete: ${results.synced} synced, ${results.skipped} skipped, ${results.errors.length} errors`
    );
    return results;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Error syncing emails:', error);
    throw new HttpsError('internal', `Error syncing emails: ${errorMessage}`);
  }
});
