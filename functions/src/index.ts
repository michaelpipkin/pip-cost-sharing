import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getHCaptchaSecret } from './common';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// TODO: Replace with your actual Firebase Auth UIDs
const ADMIN_UID_PROD = 'WUhNUBzjE7TVpU2PgV6ATjsXk9J2';
const ADMIN_UID_EMU = 'cgrizSOG69QiNquzKOA69ls8clFm';

// ---------------------------------------------------------------------------
// Payment Notification Email helpers
// ---------------------------------------------------------------------------

/**
 * Format a monetary amount using the group's currency settings.
 * Falls back to symbol + toFixed for non-ISO codes (OTH, OT2).
 */
function formatAmount(
  amount: number,
  currencyCode: string,
  currencySymbol: string,
  decimalPlaces: number
): string {
  if (currencyCode === 'OTH' || currencyCode === 'OT2') {
    const plain = amount.toFixed(decimalPlaces);
    return currencySymbol ? `${currencySymbol}${plain}` : plain;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(amount);
  } catch {
    const plain = amount.toFixed(decimalPlaces);
    return currencySymbol ? `${currencySymbol}${plain}` : plain;
  }
}

/**
 * Build a newline-separated list of payment method lines for a user.
 * Returns a fallback string if no payment methods are configured.
 */
function buildPaymentMethodLines(
  userData: admin.firestore.DocumentData
): string {
  const methods: string[] = [];
  if (userData['venmoId'])
    methods.push(
      `Venmo: @${(userData['venmoId'] as string).replace(/^@/, '')}`
    );
  if (userData['paypalId']) methods.push(`PayPal: ${userData['paypalId']}`);
  if (userData['cashAppId'])
    methods.push(`Cash App: $${userData['cashAppId']}`);
  if (userData['zelleId']) methods.push(`Zelle: ${userData['zelleId']}`);
  return methods.length > 0
    ? methods.join('\n')
    : '(No payment methods on file)';
}

/**
 * Build a per-category breakdown of a member-to-member payment, matching the
 * "Summary by Category" view in the history detail screen.
 *
 * Amounts are direction-adjusted from the payer's perspective:
 *   positive  → payer owed this split (they are paying it)
 *   negative  → payee owed this split (it offsets what the payer owes)
 *
 * Returns a formatted multi-line string ready to embed in an email, or an
 * empty string if no splits are provided.
 */
async function buildCategoryBreakdown(
  splitRefs: admin.firestore.DocumentReference[],
  payerMemberRef: admin.firestore.DocumentReference,
  currencyCode: string,
  currencySymbol: string,
  decimalPlaces: number
): Promise<string> {
  if (splitRefs.length === 0) return '';

  // Fetch all split docs in parallel
  const splitDocs = await Promise.all(splitRefs.map((ref) => ref.get()));

  // Collect unique category refs
  const categoryRefMap = new Map<string, admin.firestore.DocumentReference>();
  for (const splitDoc of splitDocs) {
    if (!splitDoc.exists) continue;
    const categoryRef = splitDoc.data()!['categoryRef'] as
      | admin.firestore.DocumentReference
      | undefined;
    if (categoryRef) categoryRefMap.set(categoryRef.path, categoryRef);
  }

  // Fetch all category docs in parallel
  const categoryDocs = await Promise.all(
    [...categoryRefMap.values()].map((ref) => ref.get())
  );
  const categoryNameMap = new Map<string, string>();
  for (const categoryDoc of categoryDocs) {
    if (categoryDoc.exists) {
      categoryNameMap.set(
        categoryDoc.ref.path,
        (categoryDoc.data()!['name'] as string | undefined) ?? 'Unknown'
      );
    }
  }

  // Accumulate direction-adjusted totals per category
  const totalsMap = new Map<string, number>();
  for (const splitDoc of splitDocs) {
    if (!splitDoc.exists) continue;
    const splitData = splitDoc.data()!;
    const categoryRef = splitData['categoryRef'] as
      | admin.firestore.DocumentReference
      | undefined;
    const owedByRef = splitData[
      'owedByMemberRef'
    ] as admin.firestore.DocumentReference;
    const allocatedAmount = splitData['allocatedAmount'] as number;

    const categoryName = categoryRef
      ? (categoryNameMap.get(categoryRef.path) ?? 'Unknown')
      : 'Unknown';

    // Positive if the payer owes this split; negative if the payee owes it
    const contribution =
      owedByRef.path === payerMemberRef.path
        ? allocatedAmount
        : -allocatedAmount;

    totalsMap.set(
      categoryName,
      (totalsMap.get(categoryName) ?? 0) + contribution
    );
  }

  // Sort alphabetically and format
  return [...totalsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, amount]) => {
      const formatted = formatAmount(
        amount,
        currencyCode,
        currencySymbol,
        decimalPlaces
      );
      return `  ${category}: ${formatted}`;
    })
    .join('\n');
}

/**
 * Internal function to delete a group and all its associated data.
 * Used by both deleteGroup (for user-initiated deletion) and deleteUserAccount
 * (for orphaned group cleanup).
 */
async function deleteGroupInternal(
  groupRef: admin.firestore.DocumentReference
): Promise<void> {
  const groupId = groupRef.id;
  console.log(`Starting internal deletion of group: ${groupId}`);

  // Define subcollections to delete
  const subcollections = [
    'members',
    'categories',
    'expenses',
    'splits',
    'history',
    'memorized',
    'settleBatches',
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
    console.log(`Cleared defaultGroupRef for ${usersWithDefault.size} users`);
  }

  // Finally, delete the group document itself
  await groupRef.delete();
  console.log(`Deleted group document: ${groupId}`);
}

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
            expense.date &&
            new Date(expense.date) <
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

    // Track groups that need to be deleted (where user is the only active member)
    const groupsToDelete: admin.firestore.DocumentReference[] = [];

    try {
      const groupsSnapshot = await db.collection('groups').get();

      for (const groupDoc of groupsSnapshot.docs) {
        // Get all members for this group
        const membersSnapshot = await groupDoc.ref.collection('members').get();

        // Find if user is a member of this group
        const userMemberDoc = membersSnapshot.docs.find(
          (doc) => doc.data().userRef?.path === userDocRef.path
        );

        // Skip if user is not a member of this group
        if (!userMemberDoc) {
          continue;
        }

        const userMemberData = userMemberDoc.data();
        const allMembers = membersSnapshot.docs;
        const activeMembers = allMembers.filter(
          (doc) => doc.data().active === true
        );

        // Check if user is the only active member
        if (activeMembers.length === 1 && userMemberData.active === true) {
          // User is the only active member - mark group for deletion
          console.log(
            `User is the only active member of group ${groupDoc.id} - marking for deletion`
          );
          groupsToDelete.push(groupDoc.ref);
        } else {
          // Check if user is the only admin
          const admins = allMembers.filter(
            (doc) => doc.data().groupAdmin === true
          );
          const userIsOnlyAdmin =
            admins.length === 1 && userMemberData.groupAdmin === true;

          if (userIsOnlyAdmin && activeMembers.length > 1) {
            // User is the only admin but there are other active members
            // Promote all other active members to admin and demote/anonymize user
            console.log(
              `User is the only admin of group ${groupDoc.id} - promoting other members`
            );

            const batch = db.batch();

            // Promote all other active members to admin
            for (const memberDoc of activeMembers) {
              if (memberDoc.id !== userMemberDoc.id) {
                batch.update(memberDoc.ref, { groupAdmin: true });
                console.log(`Promoting member ${memberDoc.id} to admin`);
              }
            }

            // Demote and anonymize user's member record (keep email)
            batch.update(userMemberDoc.ref, {
              groupAdmin: false,
              userRef: null,
            });
            console.log(`Demoting and anonymizing member: ${userMemberDoc.id}`);

            await batch.commit();
            console.log(`Updated members in group ${groupDoc.id}`);
          } else {
            // User is either not an admin, or there are other admins
            // Just anonymize the user's member record (keep email)
            await userMemberDoc.ref.update({ userRef: null });
            console.log(
              `Anonymizing member document: ${userMemberDoc.ref.path}`
            );
          }
        }
      }

      // Delete orphaned groups (where user was the only active member)
      for (const groupRef of groupsToDelete) {
        try {
          await deleteGroupInternal(groupRef);
          console.log(`Deleted orphaned group: ${groupRef.id}`);
        } catch (error) {
          console.error(`Error deleting orphaned group ${groupRef.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing member documents:', error);
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

    // Use internal function to perform the deletion
    await deleteGroupInternal(groupRef);

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

export const getAdminStatistics = onCall(async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if user is admin
  const isAdmin = uid === ADMIN_UID_PROD || uid === ADMIN_UID_EMU;
  if (!isAdmin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all groups
    const groupsSnapshot = await db.collection('groups').get();
    const totalGroups = groupsSnapshot.size;

    let activeGroups = 0;
    let activeGroupsWithMultipleMembers = 0;
    let activeGroupsWithExpenses = 0;
    let totalMembers = 0;
    let totalActiveMembers = 0;
    let groupsWithRecentActivity = 0;
    let expensesCreatedLast30Days = 0;

    for (const groupDoc of groupsSnapshot.docs) {
      const groupData = groupDoc.data();

      // Count active groups (not archived and active)
      if (groupData.active && !groupData.archived) {
        activeGroups++;

        // Get members for this group
        const membersSnapshot = await groupDoc.ref.collection('members').get();
        const activeMembers = membersSnapshot.docs.filter(
          (m) => m.data().active
        );
        totalMembers += membersSnapshot.size;
        totalActiveMembers += activeMembers.length;

        if (activeMembers.length > 1) {
          activeGroupsWithMultipleMembers++;
        }

        // Get expenses for this group
        const expensesSnapshot = await groupDoc.ref
          .collection('expenses')
          .get();
        const expenseCount = expensesSnapshot.size;

        if (expenseCount > 0) {
          activeGroupsWithExpenses++;

          // Check for recent activity
          let hasRecentExpense = false;
          let recentExpenseCount = 0;

          for (const expenseDoc of expensesSnapshot.docs) {
            const expenseData = expenseDoc.data();
            const expenseDate = expenseData.date
              ? new Date(expenseData.date)
              : null;
            if (expenseDate && expenseDate >= thirtyDaysAgo) {
              hasRecentExpense = true;
              recentExpenseCount++;
            }
          }

          if (hasRecentExpense) {
            groupsWithRecentActivity++;
          }
          expensesCreatedLast30Days += recentExpenseCount;
        }
      }
    }

    // Get total users
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;

    // Calculate averages
    const avgMembersPerActiveGroup =
      activeGroups > 0
        ? Math.round((totalActiveMembers / activeGroups) * 100) / 100
        : 0;

    return {
      totalGroups,
      activeGroups,
      activeGroupsWithMultipleMembers,
      activeGroupsWithExpenses,
      totalUsers,
      totalMembers,
      totalActiveMembers,
      groupsWithRecentActivity,
      expensesCreatedLast30Days,
      avgMembersPerActiveGroup,
      generatedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    console.error('Error getting admin statistics:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError(
      'internal',
      `Error getting statistics: ${errorMessage}`
    );
  }
});

// ---------------------------------------------------------------------------
// Payment notification email trigger
// ---------------------------------------------------------------------------

export const sendPaymentNotificationEmail = onDocumentCreated(
  'groups/{groupId}/history/{historyId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const groupId = event.params['groupId'];
    const splitsPaid: unknown[] = data['splitsPaid'] ?? null;
    const isSettleTransfer =
      Array.isArray(splitsPaid) && splitsPaid.length === 0;
    const isMemberPayment = Array.isArray(splitsPaid) && splitsPaid.length > 0;

    if (!isSettleTransfer && !isMemberPayment) {
      // splitsPaid is null — unexpected state, skip
      console.warn(
        `History doc ${event.params['historyId']} has null splitsPaid, skipping.`
      );
      return;
    }

    const groupRef = db.collection('groups').doc(groupId);

    try {
      if (isMemberPayment) {
        await handleMemberPaymentEmail(data, groupRef, splitsPaid.length);
      } else {
        await handleSettleEmail(data, groupRef, groupId);
      }
    } catch (error) {
      console.error('Error sending payment notification email:', error);
    }
  }
);

async function handleMemberPaymentEmail(
  data: admin.firestore.DocumentData,
  groupRef: admin.firestore.DocumentReference,
  splitCount: number
): Promise<void> {
  const payerMemberRef = data[
    'paidByMemberRef'
  ] as admin.firestore.DocumentReference;
  const payeeMemberRef = data[
    'paidToMemberRef'
  ] as admin.firestore.DocumentReference;
  const totalPaid = data['totalPaid'] as number;

  const [payerDoc, payeeDoc, groupDoc] = await Promise.all([
    payerMemberRef.get(),
    payeeMemberRef.get(),
    groupRef.get(),
  ]);

  if (!payerDoc.exists || !payeeDoc.exists || !groupDoc.exists) {
    console.warn(
      'handleMemberPaymentEmail: missing payer, payee, or group doc'
    );
    return;
  }

  const payerData = payerDoc.data()!;
  const payeeData = payeeDoc.data()!;
  const groupData = groupDoc.data()!;

  const payerName: string = payerData['displayName'] ?? 'Someone';
  const payeeName: string = payeeData['displayName'] ?? 'Someone';
  const payerEmail: string = payerData['email'] ?? '';
  const payeeEmail: string = payeeData['email'] ?? '';
  const groupName: string = groupData['name'] ?? 'your group';
  const currencyCode: string = groupData['currencyCode'] ?? 'USD';
  const currencySymbol: string = groupData['currencySymbol'] ?? '$';
  const decimalPlaces: number = groupData['decimalPlaces'] ?? 2;

  const formattedAmount = formatAmount(
    totalPaid,
    currencyCode,
    currencySymbol,
    decimalPlaces
  );

  const splitRefs =
    (data['splitsPaid'] as admin.firestore.DocumentReference[]) ?? [];

  // Fetch payer/payee user docs and category breakdown in parallel
  const payerUserRef = payerData[
    'userRef'
  ] as admin.firestore.DocumentReference | null;
  const payeeUserRef = payeeData[
    'userRef'
  ] as admin.firestore.DocumentReference | null;
  const [payerUserDoc, payeeUserDoc, categoryBreakdown] = await Promise.all([
    payerUserRef ? payerUserRef.get() : Promise.resolve(null),
    payeeUserRef ? payeeUserRef.get() : Promise.resolve(null),
    buildCategoryBreakdown(
      splitRefs,
      payerMemberRef,
      currencyCode,
      currencySymbol,
      decimalPlaces
    ),
  ]);

  const paymentMethodLines = payeeUserDoc?.exists
    ? buildPaymentMethodLines(payeeUserDoc.data()!)
    : '(No payment methods on file)';

  const expenseWord = splitCount === 1 ? 'expense' : 'expenses';

  const mailWrites: Promise<admin.firestore.DocumentReference>[] = [];

  const payerOptedOut =
    payerUserDoc?.exists && payerUserDoc.data()!['emailOptOut'] === true;
  const payeeOptedOut =
    payeeUserDoc?.exists && payeeUserDoc.data()!['emailOptOut'] === true;

  if (payerEmail && !payerOptedOut) {
    mailWrites.push(
      db.collection('mail').add({
        to: payerEmail,
        message: {
          subject: `A payment from you to ${payeeName} in PipSplit has been marked as complete`,
          text: [
            `Hi ${payerName},`,
            '',
            `A payment of ${formattedAmount} to ${payeeName} has been recorded in the group ${groupName}.`,
            '',
            `Category breakdown:`,
            categoryBreakdown,
            '',
            `If you haven't already sent the money, ${payeeName} is set up on:`,
            paymentMethodLines,
            '',
            `This payment covers ${splitCount} shared ${expenseWord}.`,
          ].join('\n'),
        },
      })
    );
  }

  if (payeeEmail && !payeeOptedOut) {
    mailWrites.push(
      db.collection('mail').add({
        to: payeeEmail,
        message: {
          subject: `A payment from ${payerName} to you in PipSplit has been marked as complete`,
          text: [
            `Hi ${payeeName},`,
            '',
            `A payment of ${formattedAmount} from ${payerName} to you has been recorded in the group ${groupName}.`,
            '',
            `Category breakdown:`,
            categoryBreakdown,
            '',
            `Please be on the lookout for ${formattedAmount} from ${payerName} via your P2P payment provider.`,
            '',
            `This payment covers ${splitCount} shared ${expenseWord}.`,
          ].join('\n'),
        },
      })
    );
  }

  await Promise.all(mailWrites);
  console.log(
    `Member payment emails sent: payer="${payerEmail}", payee="${payeeEmail}"`
  );
}

// ---------------------------------------------------------------------------
// Unpay notification email onCall functions
// ---------------------------------------------------------------------------

export const sendMemberPaymentUnpayNotification = onCall<{
  groupName: string;
  paidByName: string;
  paidByEmail: string;
  paidByMemberRefPath: string | null;
  paidToName: string;
  paidToEmail: string;
  paidToMemberRefPath: string | null;
  formattedAmount: string;
  splitCount: number;
}>(async (request) => {
  const {
    groupName,
    paidByName,
    paidByEmail,
    paidByMemberRefPath,
    paidToName,
    paidToEmail,
    paidToMemberRefPath,
    formattedAmount,
    splitCount,
  } = request.data;

  // Look up opt-out status from user docs via member refs
  const [paidByMemberDoc, paidToMemberDoc] = await Promise.all([
    paidByMemberRefPath
      ? db.doc(paidByMemberRefPath).get()
      : Promise.resolve(null),
    paidToMemberRefPath
      ? db.doc(paidToMemberRefPath).get()
      : Promise.resolve(null),
  ]);
  const [paidByUserDoc, paidToUserDoc] = await Promise.all([
    paidByMemberDoc?.exists
      ? (() => {
          const ref = paidByMemberDoc.data()![
            'userRef'
          ] as admin.firestore.DocumentReference | null;
          return ref ? ref.get() : Promise.resolve(null);
        })()
      : Promise.resolve(null),
    paidToMemberDoc?.exists
      ? (() => {
          const ref = paidToMemberDoc.data()![
            'userRef'
          ] as admin.firestore.DocumentReference | null;
          return ref ? ref.get() : Promise.resolve(null);
        })()
      : Promise.resolve(null),
  ]);
  const paidByOptedOut =
    paidByUserDoc?.exists && paidByUserDoc.data()!['emailOptOut'] === true;
  const paidToOptedOut =
    paidToUserDoc?.exists && paidToUserDoc.data()!['emailOptOut'] === true;

  const expenseWord = splitCount === 1 ? 'expense' : 'expenses';
  const mailWrites: Promise<admin.firestore.DocumentReference>[] = [];

  if (paidByEmail && !paidByOptedOut) {
    mailWrites.push(
      db.collection('mail').add({
        to: paidByEmail,
        message: {
          subject: `A payment from you to ${paidToName} in PipSplit has been reversed`,
          text: [
            `Hi ${paidByName},`,
            '',
            `A payment of ${formattedAmount} from you to ${paidToName} in the group ${groupName} has been reversed in PipSplit.`,
            '',
            `The ${splitCount} shared ${expenseWord} covered by this payment have been marked as unpaid and will appear in your outstanding balance again.`,
          ].join('\n'),
        },
      })
    );
  }

  if (paidToEmail && !paidToOptedOut) {
    mailWrites.push(
      db.collection('mail').add({
        to: paidToEmail,
        message: {
          subject: `A payment from ${paidByName} to you in PipSplit has been reversed`,
          text: [
            `Hi ${paidToName},`,
            '',
            `A payment of ${formattedAmount} from ${paidByName} to you in the group "${groupName}" has been reversed in PipSplit.`,
            '',
            `The ${splitCount} shared ${expenseWord} covered by this payment have been marked as unpaid and will appear in the outstanding balance again.`,
          ].join('\n'),
        },
      })
    );
  }

  await Promise.all(mailWrites);
  console.log(
    `Member payment unpay emails sent: payer="${paidByEmail}", payee="${paidToEmail}"`
  );
});

export const sendGroupSettleUnpayNotification = onCall<{
  groupName: string;
  settleDate: string;
  members: {
    displayName: string;
    email: string;
    memberRefPath: string | null;
  }[];
}>(async (request) => {
  const { groupName, settleDate, members } = request.data;

  // Look up user opt-out status for all members
  const memberDocs = await Promise.all(
    members.map((m) =>
      m.memberRefPath ? db.doc(m.memberRefPath).get() : Promise.resolve(null)
    )
  );
  const userDocs = await Promise.all(
    memberDocs.map((memberDoc) => {
      if (!memberDoc?.exists) return Promise.resolve(null);
      const userRef = memberDoc.data()![
        'userRef'
      ] as admin.firestore.DocumentReference | null;
      return userRef ? userRef.get() : Promise.resolve(null);
    })
  );
  const optedOutSet = new Set<string>();
  members.forEach((m, i) => {
    const userDoc = userDocs[i];
    if (userDoc?.exists && userDoc.data()!['emailOptOut'] === true) {
      optedOutSet.add(m.email);
    }
  });

  const mailWrites = members
    .filter((m) => !!m.email && !optedOutSet.has(m.email))
    .map((m) =>
      db.collection('mail').add({
        to: m.email,
        message: {
          subject: `The group settle for "${groupName}" has been reversed in PipSplit`,
          text: [
            `Hi ${m.displayName},`,
            '',
            `A group admin has reversed the group settlement for "${groupName}" that was recorded on ${settleDate}.`,
            '',
            'All outstanding balances have been restored. Please check your current balance in PipSplit.',
          ].join('\n'),
        },
      })
    );

  await Promise.all(mailWrites);
  console.log(
    `Group settle unpay emails sent for "${groupName}" (${settleDate}): ${mailWrites.length} email(s)`
  );
});

async function handleSettleEmail(
  data: admin.firestore.DocumentData,
  groupRef: admin.firestore.DocumentReference,
  groupId: string
): Promise<void> {
  const batchId: string = data['batchId'];
  const batchSize: number = data['batchSize'];

  if (!batchId || !batchSize) {
    console.warn('handleSettleEmail: missing batchId or batchSize, skipping');
    return;
  }

  // Wait until all history docs for this batch are present
  const historySnap = await groupRef
    .collection('history')
    .where('batchId', '==', batchId)
    .get();

  if (historySnap.size < batchSize) {
    // Not all transfers written yet — another trigger will handle it
    return;
  }

  // Atomically claim responsibility for sending this batch's emails
  const batchMarkerRef = groupRef.collection('settleBatches').doc(batchId);
  let shouldSendEmails = false;
  await db.runTransaction(async (txn) => {
    const markerDoc = await txn.get(batchMarkerRef);
    if (!markerDoc.exists) {
      txn.set(batchMarkerRef, {
        createdAt: FieldValue.serverTimestamp(),
      });
      shouldSendEmails = true;
    }
  });

  if (!shouldSendEmails) {
    // Another function instance already claimed this batch
    return;
  }

  const groupDoc = await groupRef.get();
  if (!groupDoc.exists) {
    console.warn(`handleSettleEmail: group ${groupId} not found`);
    return;
  }
  const groupData = groupDoc.data()!;
  const groupName: string = groupData['name'] ?? 'your group';
  const currencyCode: string = groupData['currencyCode'] ?? 'USD';
  const currencySymbol: string = groupData['currencySymbol'] ?? '$';
  const decimalPlaces: number = groupData['decimalPlaces'] ?? 2;

  // Collect all transfer docs in this batch
  const transfers = historySnap.docs.map((d) => d.data());

  // Collect unique member refs (both sides)
  const memberRefMap = new Map<string, admin.firestore.DocumentReference>();
  for (const transfer of transfers) {
    const payerRef = transfer[
      'paidByMemberRef'
    ] as admin.firestore.DocumentReference;
    const payeeRef = transfer[
      'paidToMemberRef'
    ] as admin.firestore.DocumentReference;
    memberRefMap.set(payerRef.path, payerRef);
    memberRefMap.set(payeeRef.path, payeeRef);
  }

  // Fetch all member docs in parallel
  const memberRefs = [...memberRefMap.values()];
  const memberDocs = await Promise.all(memberRefs.map((ref) => ref.get()));

  // Build a map: path → { doc data }
  const memberDataMap = new Map<string, admin.firestore.DocumentData>();
  for (const memberDoc of memberDocs) {
    if (memberDoc.exists) {
      memberDataMap.set(memberDoc.ref.path, memberDoc.data()!);
    }
  }

  // Fetch user docs for members that have a userRef
  const userRefMap = new Map<string, admin.firestore.DocumentReference>();
  for (const [path, memberData] of memberDataMap.entries()) {
    const userRef = memberData[
      'userRef'
    ] as admin.firestore.DocumentReference | null;
    if (userRef) {
      userRefMap.set(path, userRef);
    }
  }
  const userDocs = await Promise.all(
    [...userRefMap.values()].map((ref) => ref.get())
  );
  const userDataMap = new Map<string, admin.firestore.DocumentData>();
  for (const userDoc of userDocs) {
    if (userDoc.exists) {
      userDataMap.set(userDoc.ref.path, userDoc.data()!);
    }
  }

  // Build per-member email
  const mailWrites: Promise<admin.firestore.DocumentReference>[] = [];

  for (const [memberPath, memberData] of memberDataMap.entries()) {
    const memberEmail: string = memberData['email'] ?? '';
    const memberName: string = memberData['displayName'] ?? 'Member';
    if (!memberEmail) continue;

    const memberUserRef = memberData[
      'userRef'
    ] as admin.firestore.DocumentReference | null;
    const memberUserData = memberUserRef
      ? userDataMap.get(memberUserRef.path)
      : undefined;
    if (memberUserData?.['emailOptOut'] === true) continue;

    // Find transfers this member is involved in
    const owesLines: string[] = [];
    const owedLines: string[] = [];

    for (const transfer of transfers) {
      const payerRef = transfer[
        'paidByMemberRef'
      ] as admin.firestore.DocumentReference;
      const payeeRef = transfer[
        'paidToMemberRef'
      ] as admin.firestore.DocumentReference;
      const amount = transfer['totalPaid'] as number;
      const formattedAmount = formatAmount(
        amount,
        currencyCode,
        currencySymbol,
        decimalPlaces
      );

      if (payerRef.path === memberPath) {
        // This member owes money — include payee's payment methods
        const payeeData = memberDataMap.get(payeeRef.path);
        const payeeName: string =
          payeeData?.['displayName'] ?? 'another member';
        const payeeUserRef = payeeData?.['userRef'] as
          | admin.firestore.DocumentReference
          | null
          | undefined;
        const payeeUserData = payeeUserRef
          ? userDataMap.get(payeeUserRef.path)
          : undefined;
        const paymentMethods = payeeUserData
          ? buildPaymentMethodLines(payeeUserData)
          : '(No payment methods on file)';
        owesLines.push(
          `- You owe ${formattedAmount} to ${payeeName}\n  ${payeeName}'s payment methods:\n  ${paymentMethods.split('\n').join('\n  ')}`
        );
      } else if (payeeRef.path === memberPath) {
        // This member is owed money
        const payerData = memberDataMap.get(payerRef.path);
        const payerName: string =
          payerData?.['displayName'] ?? 'another member';
        owedLines.push(
          `- ${payerName} owes you ${formattedAmount} — be on the lookout for this payment.`
        );
      }
    }

    const transferLines = [...owesLines, ...owedLines].join('\n\n');

    mailWrites.push(
      db.collection('mail').add({
        to: memberEmail,
        message: {
          subject: `Group "${groupName}" has been settled in PipSplit`,
          text: [
            `Hi ${memberName},`,
            '',
            `A group settlement has been recorded for "${groupName}".`,
            '',
            'Your transfers:',
            transferLines,
            '',
            'All outstanding balances in the group have been marked as settled in PipSplit.',
          ].join('\n'),
        },
      })
    );
  }

  await Promise.all(mailWrites);
  console.log(
    `Settle emails sent for batchId=${batchId}: ${mailWrites.length} email(s)`
  );
}
