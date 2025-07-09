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
