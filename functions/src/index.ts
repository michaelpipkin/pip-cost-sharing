import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getHCaptchaSecret } from './common';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

exports.validateHCaptcha = functions.https.onCall(async (request) => {
  const secret = await getHCaptchaSecret();
  const token = request.data.token;
  const formData = new FormData();
  formData.append('secret', secret!);
  formData.append('response', token);

  try {
    const res = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      body: formData,
      redirect: 'follow',
    });

    const data = await res.json();
    if (data.success) {
      return 'Success';
    } else {
      return 'Failed';
    }
  } catch (error) {
    console.error('Error validating hCaptcha:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Error validating hCaptcha'
    );
  }
});

exports.verifyUserEmail = functions.https.onCall(async (request) => {
  const uid = request.data.uid;

  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'UID is required');
  }

  try {
    await admin.auth().updateUser(uid, {
      emailVerified: true,
    });

    console.log(`Successfully verified email for user: ${uid}`);
    return { success: true, message: `Email verified for user ${uid}` };
  } catch (error) {
    console.error(`Error verifying email for user ${uid}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Error verifying user email'
    );
  }
});

export const deleteOldPaidExpenses = functions.scheduler.onSchedule(
  '0 0 * * *',
  async (context) => {
    try {
      const [receipts] = await storage.bucket().getFiles();

      for (const receipt of receipts) {
        try {
          const filePath = receipt.name; // This is the full path to the Firestore document
          const expensePath = filePath.replace('receipts', 'expenses');
          const expenseRef = db.doc(expensePath); // Adjust this to match your Firestore path
          const expenseDoc = await expenseRef.get();

          if (expenseDoc.exists) {
            const expense = expenseDoc.data();

            // Check if the expense is paid and older than 90 days
            if (
              !!expense &&
              expense.paid &&
              expense.date.toDate() <
                new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            ) {
              await receipt.delete();
              console.log(`Successfully deleted file: ${filePath}`);

              // Update the receiptPath property to null
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
  }
);

// Delete user account and all associated data
// Requires user to be authenticated
exports.deleteUserAccount = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to delete account'
    );
  }

  try {
    // Get user email for logging
    const userRecord = await admin.auth().getUser(uid);
    const userEmail = userRecord.email || '';
    console.log(`Authenticated deletion request for UID: ${uid}, email: ${userEmail}`);

    // Start deletion process
    console.log(`Starting account deletion for UID: ${uid}`);

    // 1. Get user document reference directly (document ID is the UID)
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      console.log(`Warning: User document not found for UID: ${uid}`);
      // Continue with deletion even if user document doesn't exist
    } else {
      console.log(`Found user document: ${userDocRef.path}`);
    }

    // 2. Find and update all member documents
    try {
      // Get all groups
      const groupsSnapshot = await db.collection('groups').get();

      for (const groupDoc of groupsSnapshot.docs) {
        // Query members subcollection for this user
        const membersSnapshot = await groupDoc.ref
          .collection('members')
          .where('userRef', '==', userDocRef)
          .get();

        // Update each matching member document
        const batch = db.batch();
        membersSnapshot.docs.forEach((memberDoc) => {
          batch.update(memberDoc.ref, {
            email: '',
            userRef: null,
          });
          console.log(
            `Anonymizing member document: ${memberDoc.ref.path}`
          );
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
      // Log error but continue with deletion
      // The user document and auth account should still be deleted
    }

    // 3. Delete user document if it exists
    if (userDoc.exists) {
      await userDocRef.delete();
      console.log(`Deleted user document: ${userDocRef.path}`);
    }

    // 4. Delete auth account (do this last)
    await admin.auth().deleteUser(uid);
    console.log(`Deleted auth account for UID: ${uid}`);

    return {
      success: true,
      message: 'Account successfully deleted',
    };
  } catch (error: any) {
    console.error('Error deleting user account:', error);

    // Return appropriate error
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Error deleting account: ${error.message}`
    );
  }
});
