import {
  DocumentData,
  DocumentReference,
  Firestore,
  getFirestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { callableAppCheck } from './common';
import {
  buildEmailHtml,
  buildPaymentMethodLines,
  buildPaymentMethodsHtml,
  escapeHtml,
  formatAmount,
} from './email-builders';
import { memberRecipient, type MemberRecipient } from './group-mail-recipient';

// ---------------------------------------------------------------------------
// Group emails the app sends on a member's behalf: payment requests (Summary)
// and payment / group-settle reversal notices (History detail). These replace
// the old generic `sendEmail` callable, which wrote whatever recipient,
// subject and HTML the client sent and so worked as an open relay from
// PipSplit's address. Here the client sends only ids and numbers; the server
// checks the caller's membership and builds the content itself.
//
// Recipients are only ever linked app users who haven't opted out, mailed at
// their GROUP email (the member doc's `email`), through the one recipient
// rule every group mail shares (group-mail-recipient.ts, Plan 4 B19). A
// linked member's email is always an address its user proved they own:
// firestore.rules refuses any other value on a linked member doc (so an
// admin can no longer pair a victim's userRef with an address of their
// choosing, final review I2), and a new address is applied only once
// confirmed through a link mailed to it (member-email.ts). The member-id
// cap (MAX_BATCH) and the membership checks below still bound who can be
// mailed and how often.
//
// getFirestore() is called inside each handler rather than at module scope:
// index.ts imports (and so evaluates) this module before it calls
// initializeApp(), the same constraint as receipt-ocr.ts.
// ---------------------------------------------------------------------------

/**
 * Request and member-id lists are capped so one call can't fan out widely.
 * 25 covers every real call: Request All sends one request per settlement
 * transfer, and the least-transfers settlement has at most n - 1 transfers
 * for n members; a settle reversal names each member of the settle batch
 * once. So one call serves a group of up to 26 (Request All) or 25 members
 * (reversal). The client splits a longer list into several calls
 * (user.service.ts GROUP_EMAIL_BATCH, which must not exceed this), so the cap
 * bounds one invocation's work and mail, not the group size.
 */
const MAX_BATCH = 25;

const NO_PAYMENT_METHODS = '(No payment methods on file)';

export type PaymentRequestResult = 'sent' | 'not_registered' | 'opted_out';

export interface PaymentRequestItem {
  owedByMemberId: string;
  owedToMemberId: string;
  amount: number;
}

export interface SendPaymentRequestsData {
  groupId: string;
  requests: PaymentRequestItem[];
}

export interface SendPaymentReversalEmailsData {
  groupId: string;
  paidByMemberId: string;
  paidToMemberId: string;
  amount: number;
  splitCount: number;
}

export interface SendSettleReversalEmailsData {
  groupId: string;
  memberIds: string[];
  /** ISO `YYYY-MM-DD`. */
  settleDate: string;
}

interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A string usable as a single Firestore document id: no `/`, and not one of
 * the reserved ids (`.`, `..`, `__x__`) the backend would reject as an
 * `internal` error.
 */
function isDocId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1500 &&
    !value.includes('/') &&
    !/^\.\.?$|^__.*__$/.test(value)
  );
}

function requireDocId(value: unknown, field: string): string {
  if (!isDocId(value)) invalid(`${field} is required`);
  return value;
}

function requireAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    invalid('amount must be a number greater than 0');
  }
  return value;
}

function requireIdList(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${field} must be a non-empty array`);
  }
  if (value.length > MAX_BATCH) {
    invalid(`${field} may hold at most ${MAX_BATCH} entries`);
  }
  return value;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The validated date, printed as is: emails show dates as ISO `YYYY-MM-DD`
 * (owner decision). It must be a real calendar date (no 2026-02-30).
 */
function requireIsoDate(value: unknown): string {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) invalid('settleDate must be a YYYY-MM-DD date');
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalid('settleDate must be a YYYY-MM-DD date');
  }
  return value as string;
}

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  return uid;
}

// ---------------------------------------------------------------------------
// Firestore reads
// ---------------------------------------------------------------------------

/**
 * The caller's own active member doc in the group, or permission-denied.
 * Same query shape as scanReceipt's membership check. A missing group has no
 * members, so it is denied the same way.
 */
async function requireActiveMember(
  db: Firestore,
  groupRef: DocumentReference,
  uid: string,
  options: { admin: boolean }
): Promise<void> {
  const membership = await groupRef
    .collection('members')
    .where('userRef', '==', db.collection('users').doc(uid))
    .where('active', '==', true)
    .limit(1)
    .get();
  if (membership.empty) {
    throw new HttpsError(
      'permission-denied',
      'User must be an active member of the group'
    );
  }
  if (options.admin && membership.docs[0]!.data()['groupAdmin'] !== true) {
    throw new HttpsError('permission-denied', 'Only a group admin can do this');
  }
}

/** Member docs by id (de-duplicated), or not-found if any id is unknown. */
async function getMembers(
  db: Firestore,
  groupRef: DocumentReference,
  memberIds: string[]
): Promise<Map<string, DocumentData>> {
  const uniqueIds = [...new Set(memberIds)];
  const snaps = await db.getAll(
    ...uniqueIds.map((id) => groupRef.collection('members').doc(id))
  );
  const members = new Map<string, DocumentData>();
  for (const snap of snaps) {
    if (!snap.exists) {
      throw new HttpsError('not-found', `Member ${snap.id} not found in group`);
    }
    members.set(snap.id, snap.data()!);
  }
  return members;
}

/** Linked user docs for the given members, keyed by user doc path. */
async function getLinkedUsers(
  db: Firestore,
  members: Iterable<DocumentData>
): Promise<Map<string, DocumentData>> {
  const refs = new Map<string, DocumentReference>();
  for (const member of members) {
    const userRef = member['userRef'] as DocumentReference | null | undefined;
    if (userRef) refs.set(userRef.path, userRef);
  }
  const users = new Map<string, DocumentData>();
  if (refs.size === 0) return users;
  const snaps = await db.getAll(...refs.values());
  for (const snap of snaps) {
    if (snap.exists) users.set(snap.ref.path, snap.data()!);
  }
  return users;
}

function linkedUser(
  member: DocumentData,
  users: Map<string, DocumentData>
): DocumentData | undefined {
  const userRef = member['userRef'] as DocumentReference | null | undefined;
  return userRef ? users.get(userRef.path) : undefined;
}

/**
 * Whether and where a member can be emailed (memberRecipient: linked, the
 * users doc exists, not opted out, and the member's group email is one
 * valid address). A placeholder, a userRef with no user doc or an empty or
 * invalid group email is not_registered.
 */
function recipient(
  member: DocumentData,
  users: Map<string, DocumentData>
): MemberRecipient {
  return memberRecipient(member, linkedUser(member, users));
}

interface GroupFormat {
  groupName: string;
  money: (amount: number) => string;
}

async function getGroupFormat(
  groupRef: DocumentReference
): Promise<GroupFormat> {
  const groupData = (await groupRef.get()).data() ?? {};
  const currencyCode: string = groupData['currencyCode'] ?? 'USD';
  const currencySymbol: string = groupData['currencySymbol'] ?? '$';
  const decimalPlaces: number = groupData['decimalPlaces'] ?? 2;
  return {
    groupName: groupData['name'] ?? 'your group',
    money: (amount) =>
      formatAmount(amount, currencyCode, currencySymbol, decimalPlaces),
  };
}

function displayName(member: DocumentData): string {
  return member['displayName'] ?? 'Someone';
}

/** Queue a mail doc in the shape sendMailQueueEmail delivers. */
async function queueMail(
  db: Firestore,
  to: string,
  message: MailMessage
): Promise<void> {
  await db.collection('mail').add({ to, message });
}

// ---------------------------------------------------------------------------
// Content (the copy the client used to build, unchanged)
// ---------------------------------------------------------------------------

function buildPaymentRequestEmail(params: {
  owedByName: string;
  owedToName: string;
  groupName: string;
  formattedAmount: string;
  paymentMethodLines: string;
}): MailMessage {
  const { owedByName, owedToName, groupName, formattedAmount } = params;
  const subject = `Payment request from ${owedToName} for group "${groupName}" in PipSplit`;
  const text = [
    `Hi ${owedByName},`,
    '',
    `${owedToName} is requesting payment of ${formattedAmount} in the "${groupName}" group via PipSplit.`,
    '',
    `Please log in to PipSplit to mark this balance as paid, or send the payment directly to ${owedToName} using one of the following:`,
    params.paymentMethodLines,
  ].join('\n');
  const pmHtml = buildPaymentMethodsHtml(params.paymentMethodLines);
  const html = buildEmailHtml(
    `<h2 style="color:#105208;margin:0 0 20px 0;">Payment Request</h2>` +
      `<p style="margin:0 0 16px 0;">Hi <strong>${escapeHtml(owedByName)}</strong>,</p>` +
      `<p style="margin:0 0 16px 0;"><strong>${escapeHtml(owedToName)}</strong> is requesting payment of:</p>` +
      `<div style="background-color:#cdebbf;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px 0;"><span style="font-size:28px;font-weight:bold;color:#105208;">${escapeHtml(formattedAmount)}</span></div>` +
      `<p style="margin:0 0 16px 0;">in the <strong>&ldquo;${escapeHtml(groupName)}&rdquo;</strong> group via PipSplit.</p>` +
      `<p style="margin:0 0 16px 0;">Please log in to PipSplit to mark this balance as paid, or send the payment directly to <strong>${escapeHtml(owedToName)}</strong> using one of the following:</p>` +
      `<div style="background-color:#f7fbf0;border:1px solid #c4c8be;border-radius:8px;padding:16px;">${pmHtml}</div>`
  );
  return { subject, text, html };
}

function buildPaymentReversalEmail(params: {
  recipientName: string;
  /** The payer's view ("from you to X") or the payee's ("from X to you"). */
  side: 'payer' | 'payee';
  otherName: string;
  groupName: string;
  formattedAmount: string;
  splitCount: number;
}): MailMessage {
  const { recipientName, otherName, groupName, formattedAmount, splitCount } =
    params;
  const expenseWord = splitCount === 1 ? 'expense' : 'expenses';
  const isPayer = params.side === 'payer';
  const subject = isPayer
    ? `A payment from you to ${otherName} in PipSplit has been reversed`
    : `A payment from ${otherName} to you in PipSplit has been reversed`;
  const fromTo = isPayer
    ? `from you to ${otherName}`
    : `from ${otherName} to you`;
  const fromToHtml = isPayer
    ? `from you to <strong>${escapeHtml(otherName)}</strong>`
    : `from <strong>${escapeHtml(otherName)}</strong> to you`;
  const balance = isPayer
    ? 'your outstanding balance'
    : 'the outstanding balance';
  const text = [
    `Hi ${recipientName},`,
    '',
    `A payment of ${formattedAmount} ${fromTo} in the group "${groupName}" has been reversed in PipSplit.`,
    '',
    `The ${splitCount} shared ${expenseWord} covered by this payment have been marked as unpaid and will appear in ${balance} again.`,
  ].join('\n');
  const html = buildEmailHtml(
    `<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Payment Reversed</h2>` +
      `<p style="margin:0 0 16px 0;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>` +
      `<p style="margin:0 0 16px 0;">A payment of <strong>${escapeHtml(formattedAmount)}</strong> ${fromToHtml} in the <strong>&ldquo;${escapeHtml(groupName)}&rdquo;</strong> group has been reversed in PipSplit.</p>` +
      `<p style="margin:0;">The ${splitCount} shared ${escapeHtml(expenseWord)} covered by this payment have been marked as unpaid and will appear in ${balance} again.</p>`
  );
  return { subject, text, html };
}

function buildSettleReversalEmail(params: {
  recipientName: string;
  groupName: string;
  settleDate: string;
}): MailMessage {
  const { recipientName, groupName, settleDate } = params;
  const subject = `The group settle for "${groupName}" has been reversed in PipSplit`;
  const text = [
    `Hi ${recipientName},`,
    '',
    `A group admin has reversed the group settlement for "${groupName}" that was recorded on ${settleDate}.`,
    '',
    'All outstanding balances have been restored. Please check your current balance in PipSplit.',
  ].join('\n');
  const html = buildEmailHtml(
    `<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Group Settlement Reversed</h2>` +
      `<p style="margin:0 0 16px 0;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>` +
      `<p style="margin:0 0 16px 0;">A group admin has reversed the group settlement for <strong>&ldquo;${escapeHtml(groupName)}&rdquo;</strong> that was recorded on <strong>${escapeHtml(settleDate)}</strong>.</p>` +
      `<p style="margin:0;">All outstanding balances have been restored. Please check your current balance in PipSplit.</p>`
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

/**
 * Summary's Request Payment (one request) and Request All Payments (one per
 * settlement transfer). Any active member may send, as on Summary. Returns
 * one result per request, in request order.
 */
export const sendPaymentRequests = onCall<SendPaymentRequestsData>(
  callableAppCheck,
  async (request): Promise<{ results: PaymentRequestResult[] }> => {
    const uid = requireUid(request);
    const data: unknown = request.data;
    if (!isRecord(data)) invalid('Request data is required');
    const groupId = requireDocId(data['groupId'], 'groupId');
    const requests = requireIdList(data['requests'], 'requests').map(
      (item): PaymentRequestItem => {
        if (!isRecord(item)) invalid('Each request must be an object');
        return {
          owedByMemberId: requireDocId(
            item['owedByMemberId'],
            'owedByMemberId'
          ),
          owedToMemberId: requireDocId(
            item['owedToMemberId'],
            'owedToMemberId'
          ),
          amount: requireAmount(item['amount']),
        };
      }
    );

    const db = getFirestore();
    const groupRef = db.collection('groups').doc(groupId);
    await requireActiveMember(db, groupRef, uid, { admin: false });

    const members = await getMembers(
      db,
      groupRef,
      requests.flatMap((r) => [r.owedByMemberId, r.owedToMemberId])
    );
    const [users, format] = await Promise.all([
      getLinkedUsers(db, members.values()),
      getGroupFormat(groupRef),
    ]);

    const recipients = requests.map((r) =>
      recipient(members.get(r.owedByMemberId)!, users)
    );
    await Promise.all(
      requests.map((r, i) => {
        const owedByRecipient = recipients[i]!;
        if (owedByRecipient.result !== 'sent') return Promise.resolve();
        const owedBy = members.get(r.owedByMemberId)!;
        const owedTo = members.get(r.owedToMemberId)!;
        const owedToUser = linkedUser(owedTo, users);
        return queueMail(
          db,
          owedByRecipient.to,
          buildPaymentRequestEmail({
            owedByName: displayName(owedBy),
            owedToName: displayName(owedTo),
            groupName: format.groupName,
            formattedAmount: format.money(r.amount),
            paymentMethodLines: owedToUser
              ? buildPaymentMethodLines(owedToUser)
              : NO_PAYMENT_METHODS,
          })
        );
      })
    );
    return { results: recipients.map((r) => r.result) };
  }
);

/**
 * History detail's Unpay Payment: tells the payer and the payee that the
 * payment was reversed. Group admins only, as in the UI.
 */
export const sendPaymentReversalEmails = onCall<SendPaymentReversalEmailsData>(
  callableAppCheck,
  async (request): Promise<{ sent: number }> => {
    const uid = requireUid(request);
    const data: unknown = request.data;
    if (!isRecord(data)) invalid('Request data is required');
    const groupId = requireDocId(data['groupId'], 'groupId');
    const paidByMemberId = requireDocId(
      data['paidByMemberId'],
      'paidByMemberId'
    );
    const paidToMemberId = requireDocId(
      data['paidToMemberId'],
      'paidToMemberId'
    );
    const amount = requireAmount(data['amount']);
    const splitCount = data['splitCount'];
    if (!Number.isInteger(splitCount) || (splitCount as number) < 0) {
      invalid('splitCount must be a non-negative integer');
    }

    const db = getFirestore();
    const groupRef = db.collection('groups').doc(groupId);
    await requireActiveMember(db, groupRef, uid, { admin: true });

    const members = await getMembers(db, groupRef, [
      paidByMemberId,
      paidToMemberId,
    ]);
    const [users, format] = await Promise.all([
      getLinkedUsers(db, members.values()),
      getGroupFormat(groupRef),
    ]);
    const paidBy = members.get(paidByMemberId)!;
    const paidTo = members.get(paidToMemberId)!;
    const shared = {
      groupName: format.groupName,
      formattedAmount: format.money(amount),
      splitCount: splitCount as number,
    };

    const mails: { to: string; message: MailMessage }[] = [];
    const paidByRecipient = recipient(paidBy, users);
    if (paidByRecipient.result === 'sent') {
      mails.push({
        to: paidByRecipient.to,
        message: buildPaymentReversalEmail({
          ...shared,
          recipientName: displayName(paidBy),
          side: 'payer',
          otherName: displayName(paidTo),
        }),
      });
    }
    const paidToRecipient = recipient(paidTo, users);
    if (paidToRecipient.result === 'sent') {
      mails.push({
        to: paidToRecipient.to,
        message: buildPaymentReversalEmail({
          ...shared,
          recipientName: displayName(paidTo),
          side: 'payee',
          otherName: displayName(paidBy),
        }),
      });
    }
    await Promise.all(mails.map((m) => queueMail(db, m.to, m.message)));
    return { sent: mails.length };
  }
);

/**
 * History detail's Unpay Group Settle: tells each member in the settle batch
 * that it was reversed. Group admins only, as in the UI.
 */
export const sendSettleReversalEmails = onCall<SendSettleReversalEmailsData>(
  callableAppCheck,
  async (request): Promise<{ sent: number }> => {
    const uid = requireUid(request);
    const data: unknown = request.data;
    if (!isRecord(data)) invalid('Request data is required');
    const groupId = requireDocId(data['groupId'], 'groupId');
    const memberIds = requireIdList(data['memberIds'], 'memberIds').map((id) =>
      requireDocId(id, 'memberIds')
    );
    const settleDate = requireIsoDate(data['settleDate']);

    const db = getFirestore();
    const groupRef = db.collection('groups').doc(groupId);
    await requireActiveMember(db, groupRef, uid, { admin: true });

    const members = await getMembers(db, groupRef, memberIds);
    const [users, format] = await Promise.all([
      getLinkedUsers(db, members.values()),
      getGroupFormat(groupRef),
    ]);

    const mails = [...members.values()].flatMap((member) => {
      const r = recipient(member, users);
      return r.result === 'sent' ? [{ member, to: r.to }] : [];
    });
    await Promise.all(
      mails.map(({ member, to }) =>
        queueMail(
          db,
          to,
          buildSettleReversalEmail({
            recipientName: displayName(member),
            groupName: format.groupName,
            settleDate,
          })
        )
      )
    );
    return { sent: mails.length };
  }
);
