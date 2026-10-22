import { randomUUID } from 'node:crypto';
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPaymentNotificationEmail } from './index';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

// sendPaymentNotificationEmail (the history-created trigger): member payments
// and settle batches. The invalid-stored-address skip is covered in
// settle-email.spec.ts, and the builders and claim helpers there too; this
// spec covers the trigger's own routing, eligibility and outcomes.
//
// The mail collection is shared by every spec, so each address is unique to
// its test and mail is only ever found by `to`.

const db = getFirestore();

afterEach(() => {
  vi.restoreAllMocks();
});

const uniqueEmail = (label: string) =>
  `${label}-${randomUUID()}@payment-email.test`;

interface MailDoc {
  to: string;
  message: { subject: string; text: string; html: string };
}

async function mailTo(to: string): Promise<MailDoc[]> {
  const snap = await db.collection('mail').where('to', '==', to).get();
  return snap.docs.map((d) => d.data() as MailDoc);
}

/**
 * A group member linked to a user. `user` overrides the user doc fields
 * (emailOptOut, payment ids); `email` is the member's own stored address.
 */
async function linkedMember(
  group: DocumentReference,
  displayName: string,
  email: string,
  user: DocumentData = {}
): Promise<DocumentReference> {
  const userRef = db.collection('users').doc(uniqueId('u'));
  await userRef.set({ email: uniqueEmail('user'), emailOptOut: false, ...user });
  return makeMember(group, { displayName, email, userRef });
}

function fire(
  group: DocumentReference,
  history: DocumentData | undefined | null,
  historyId = uniqueId('h')
) {
  return Promise.resolve(
    sendPaymentNotificationEmail.run({
      data: { data: () => history },
      params: { groupId: group.id, historyId },
    } as any)
  );
}

function memberPayment(
  payer: DocumentReference,
  payee: DocumentReference,
  group: DocumentReference,
  overrides: DocumentData = {}
): DocumentData {
  return {
    paidByMemberRef: payer,
    paidToMemberRef: payee,
    totalPaid: 12.5,
    splitsPaid: [group.collection('splits').doc()],
    ...overrides,
  };
}

describe('sendPaymentNotificationEmail: member payment', () => {
  // The handler reads only the event's own snapshot, so with no data there is
  // nothing it could mail (no history doc is looked up): the contract is a quiet
  // no-op, not a throw. A mail assertion here could never fail, so there is none.
  it('returns quietly for an event without data (undefined data and an empty snapshot)', async () => {
    const group = await makeGroup();

    await expect(
      Promise.resolve(
        sendPaymentNotificationEmail.run({
          data: undefined,
          params: { groupId: group.id, historyId: uniqueId('h') },
        } as any)
      )
    ).resolves.toBeUndefined();
    await expect(fire(group, undefined)).resolves.toBeUndefined();
  });

  it('skips a history doc whose splitsPaid is null, with a warning', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', payeeEmail);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const historyId = uniqueId('h');

    await expect(
      fire(group, memberPayment(payer, payee, group, { splitsPaid: null }), historyId)
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(historyId));
    expect(await mailTo(payerEmail)).toHaveLength(0);
    expect(await mailTo(payeeEmail)).toHaveLength(0);
  });

  it('mails payer and payee with the documented subjects and the group-currency amount', async () => {
    const group = await makeGroup({
      name: 'Euro Trip',
      currencyCode: 'EUR',
      currencySymbol: '€',
      decimalPlaces: 2,
    });
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', payeeEmail);

    await fire(group, memberPayment(payer, payee, group, { totalPaid: 1234.5 }));

    const [toPayer] = await mailTo(payerEmail);
    const [toPayee] = await mailTo(payeeEmail);
    expect(await mailTo(payerEmail)).toHaveLength(1);
    expect(await mailTo(payeeEmail)).toHaveLength(1);
    expect(toPayer.message.subject).toBe(
      'A payment from you to Quinn in PipSplit has been marked as complete'
    );
    expect(toPayee.message.subject).toBe(
      'A payment from Pat to you in PipSplit has been marked as complete'
    );
    expect(toPayer.message.text).toContain(
      'A payment of €1,234.50 to Quinn has been recorded in the group Euro Trip.'
    );
    expect(toPayee.message.text).toContain(
      'A payment of €1,234.50 from Pat to you has been recorded in the group Euro Trip.'
    );
    expect(toPayer.message.html).toContain('€1,234.50');
  });

  it.each([
    [1, 'covers 1 shared expense.'],
    [3, 'covers 3 shared expenses.'],
  ])('describes %i split(s) with the right singular/plural', async (count, phrase) => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', uniqueEmail('payee'));
    const splitsPaid = Array.from({ length: count }, () =>
      group.collection('splits').doc()
    );

    await fire(group, memberPayment(payer, payee, group, { splitsPaid }));

    const [mail] = await mailTo(payerEmail);
    expect(mail.message.text).toContain(phrase);
    expect(mail.message.html).toContain(phrase);
  });

  it('sends no mail to an opted-out payer but still mails the payee', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail, {
      emailOptOut: true,
    });
    const payee = await linkedMember(group, 'Quinn', payeeEmail);

    await fire(group, memberPayment(payer, payee, group));

    expect(await mailTo(payerEmail)).toHaveLength(0);
    expect(await mailTo(payeeEmail)).toHaveLength(1);
  });

  it('sends no mail to an opted-out payee but still mails the payer', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', payeeEmail, {
      emailOptOut: true,
    });

    await fire(group, memberPayment(payer, payee, group));

    expect(await mailTo(payerEmail)).toHaveLength(1);
    expect(await mailTo(payeeEmail)).toHaveLength(0);
  });

  it('sends no mail to a payee without a linked user, even with an email', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await makeMember(group, {
      displayName: 'Quinn',
      email: payeeEmail,
      userRef: null,
    });

    await fire(group, memberPayment(payer, payee, group));

    expect(await mailTo(payerEmail)).toHaveLength(1);
    expect(await mailTo(payeeEmail)).toHaveLength(0);
  });

  it('sends no mail to a linked payee who has no email on file', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payerName = `Pat-${randomUUID()}`;
    const payer = await linkedMember(group, payerName, payerEmail);
    const payeeUser = db.collection('users').doc(uniqueId('u'));
    await payeeUser.set({ emailOptOut: false });
    const payee = await makeMember(group, {
      displayName: 'Quinn',
      userRef: payeeUser,
    });

    await fire(group, memberPayment(payer, payee, group));

    expect(await mailTo(payerEmail)).toHaveLength(1);
    // The payee's mail has no address to go to, so none is queued: no mail
    // anywhere carries the subject naming this test's unique payer.
    const payeeSubject = `A payment from ${payerName} to you in PipSplit has been marked as complete`;
    const payeeMail = await db
      .collection('mail')
      .where('message.subject', '==', payeeSubject)
      .get();
    expect(payeeMail.size).toBe(0);
  });

  it.each([
    ['payer', 'paidByMemberRef'],
    ['payee', 'paidToMemberRef'],
  ])('mails nobody and resolves when the %s member doc is missing', async (_who, field) => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', payeeEmail);
    const missing = group.collection('members').doc(uniqueId('gone'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      fire(group, memberPayment(payer, payee, group, { [field]: missing }))
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'handleMemberPaymentEmail: missing payer, payee, or group doc'
    );
    expect(await mailTo(payerEmail)).toHaveLength(0);
    expect(await mailTo(payeeEmail)).toHaveLength(0);
  });

  it('mails nobody and resolves when the group doc is missing', async () => {
    const real = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payeeEmail = uniqueEmail('payee');
    const payer = await linkedMember(real, 'Pat', payerEmail);
    const payee = await linkedMember(real, 'Quinn', payeeEmail);
    const ghostGroup = db.collection('groups').doc(uniqueId('ghost'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      fire(ghostGroup, memberPayment(payer, payee, real))
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'handleMemberPaymentEmail: missing payer, payee, or group doc'
    );
    expect(await mailTo(payerEmail)).toHaveLength(0);
    expect(await mailTo(payeeEmail)).toHaveLength(0);
  });

  it("lists the payee's payment methods in the payer's mail", async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', uniqueEmail('payee'), {
      venmoId: '@quinn-v',
      zelleId: 'quinn@zelle.test',
    });

    await fire(group, memberPayment(payer, payee, group));

    const [mail] = await mailTo(payerEmail);
    expect(mail.message.text).toContain('Venmo: @quinn-v');
    expect(mail.message.text).toContain('Zelle: quinn@zelle.test');
    expect(mail.message.text).not.toContain('(No payment methods on file)');
  });

  it('says "(No payment methods on file)" when the payee has none', async () => {
    const group = await makeGroup();
    const payerEmail = uniqueEmail('payer');
    const payer = await linkedMember(group, 'Pat', payerEmail);
    const payee = await linkedMember(group, 'Quinn', uniqueEmail('payee'));

    await fire(group, memberPayment(payer, payee, group));

    const [mail] = await mailTo(payerEmail);
    expect(mail.message.text).toContain('(No payment methods on file)');
    expect(mail.message.html).toContain('(No payment methods on file)');
  });
});

describe('sendPaymentNotificationEmail: settle batch', () => {
  /** A settle transfer (empty splitsPaid) in a batch. */
  function transfer(
    payer: DocumentReference,
    payee: DocumentReference,
    batchId: string | undefined,
    batchSize: number | undefined,
    totalPaid = 30
  ): DocumentData {
    return {
      paidByMemberRef: payer,
      paidToMemberRef: payee,
      totalPaid,
      splitsPaid: [],
      ...(batchId !== undefined ? { batchId } : {}),
      ...(batchSize !== undefined ? { batchSize } : {}),
    };
  }

  async function seedHistory(
    group: DocumentReference,
    history: DocumentData
  ): Promise<void> {
    await group.collection('history').doc(uniqueId('h')).set(history);
  }

  async function markerExists(
    group: DocumentReference,
    batchId: string
  ): Promise<boolean> {
    return (await group.collection('settleBatches').doc(batchId).get()).exists;
  }

  it.each([
    ['batchId', { batchId: undefined, batchSize: 1 }],
    ['batchSize', { batchId: 'b', batchSize: undefined }],
  ])('skips a settle transfer with no %s', async (_label, ids) => {
    const group = await makeGroup();
    const aEmail = uniqueEmail('a');
    const a = await linkedMember(group, 'Pat', aEmail);
    const b = await linkedMember(group, 'Quinn', uniqueEmail('b'));
    const batchId = ids.batchId === undefined ? undefined : uniqueId('b');
    const history = transfer(a, b, batchId, ids.batchSize);
    await seedHistory(group, history);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fire(group, history)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'handleSettleEmail: missing batchId or batchSize, skipping'
    );
    expect(await mailTo(aEmail)).toHaveLength(0);
    if (batchId) expect(await markerExists(group, batchId)).toBe(false);
  });

  it('waits, without claiming the batch, until every history doc has been written', async () => {
    const group = await makeGroup();
    const aEmail = uniqueEmail('a');
    const a = await linkedMember(group, 'Pat', aEmail);
    const b = await linkedMember(group, 'Quinn', uniqueEmail('b'));
    const batchId = uniqueId('b');
    const history = transfer(a, b, batchId, 2);
    await seedHistory(group, history); // 1 of 2

    await fire(group, history);

    expect(await mailTo(aEmail)).toHaveLength(0);
    expect(await markerExists(group, batchId)).toBe(false);
  });

  it('sends one mail per eligible member of a complete batch, and only once', async () => {
    const group = await makeGroup({ name: 'Cabin Weekend' });
    const aEmail = uniqueEmail('a');
    const bEmail = uniqueEmail('b');
    const optedOutEmail = uniqueEmail('optout');
    const unlinkedEmail = uniqueEmail('unlinked');
    const a = await linkedMember(group, 'Pat', aEmail);
    const b = await linkedMember(group, 'Quinn', bEmail, { venmoId: 'quinn-v' });
    const optedOut = await linkedMember(group, 'Robin', optedOutEmail, {
      emailOptOut: true,
    });
    const unlinked = await makeMember(group, {
      displayName: 'Sam',
      email: unlinkedEmail,
      userRef: null,
    });
    const batchId = uniqueId('b');
    const first = transfer(a, b, batchId, 2, 30);
    const second = transfer(optedOut, unlinked, batchId, 2, 5);
    await seedHistory(group, first);
    await seedHistory(group, second);

    // Both history docs trigger the function; only one run may send.
    await fire(group, first);
    await fire(group, second);

    const toA = await mailTo(aEmail);
    const toB = await mailTo(bEmail);
    expect(toA).toHaveLength(1);
    expect(toB).toHaveLength(1);
    expect(await mailTo(optedOutEmail)).toHaveLength(0);
    expect(await mailTo(unlinkedEmail)).toHaveLength(0);
    expect(toA[0].message.subject).toBe(
      'Group "Cabin Weekend" has been settled in PipSplit'
    );
    expect(toA[0].message.text).toContain('You owe $30.00 to Quinn');
    expect(toA[0].message.text).toContain('Venmo: @quinn-v');
    expect(toB[0].message.text).toContain('Pat owes you $30.00');
    expect(await markerExists(group, batchId)).toBe(true);
  });

  it('mails nobody when the group doc is gone', async () => {
    const real = await makeGroup();
    const aEmail = uniqueEmail('a');
    const a = await linkedMember(real, 'Pat', aEmail);
    const b = await linkedMember(real, 'Quinn', uniqueEmail('b'));
    const ghost = db.collection('groups').doc(uniqueId('ghost'));
    const batchId = uniqueId('b');
    const history = transfer(a, b, batchId, 1);
    await seedHistory(ghost, history);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fire(ghost, history)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      `handleSettleEmail: group ${ghost.id} not found`
    );
    expect(await mailTo(aEmail)).toHaveLength(0);
  });

  // BUG (B9): functions/src/index.ts:1324 - handleSettleEmail claims the batch
  // (claimSettleBatch) BEFORE building and queueing the emails, and nothing
  // releases the claim when a later step throws, so the settle emails are
  // never retried; deferred by owner 2026-10-21. A fix that releases the claim
  // on failure flips this to a normal `it`.
  it.fails('lets a retry send the settle emails after a failure past the claim', async () => {
    const group = await makeGroup();
    const aEmail = uniqueEmail('a');
    const a = await linkedMember(group, 'Pat', aEmail);
    const b = await linkedMember(group, 'Quinn', uniqueEmail('b'));
    const batchId = uniqueId('b');
    const good = transfer(a, b, batchId, 2);
    // The second transfer is corrupt (no payee ref): building the emails
    // throws after the batch has been claimed.
    const corruptRef = group.collection('history').doc(uniqueId('h'));
    await corruptRef.set({ ...transfer(a, b, batchId, 2, 5), paidToMemberRef: null });
    await seedHistory(group, good);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await fire(group, good);
    expect(await mailTo(aEmail)).toHaveLength(0);

    // The data is repaired and the trigger is retried.
    await corruptRef.update({ paidToMemberRef: b });
    await fire(group, good);

    expect(await mailTo(aEmail)).toHaveLength(1);
  });
});
