import { randomUUID } from 'node:crypto';
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  buildMemberTransferBlocks,
  claimSettleBatch,
  collectSettleMemberAndUserData,
  sendPaymentNotificationEmail,
} from './index';

const db = getFirestore();

function fakeRef(path: string): DocumentReference {
  return { path } as unknown as DocumentReference;
}

describe('claimSettleBatch', () => {
  it('returns true and creates the marker doc on the first claim', async () => {
    const groupRef = db.collection('groups').doc();

    const claimed = await claimSettleBatch(groupRef, 'batch1');

    expect(claimed).toBe(true);
    const marker = await groupRef.collection('settleBatches').doc('batch1').get();
    expect(marker.exists).toBe(true);
  });

  it('returns false on a second claim for the same batch', async () => {
    const groupRef = db.collection('groups').doc();
    await claimSettleBatch(groupRef, 'batch1');

    const secondClaim = await claimSettleBatch(groupRef, 'batch1');

    expect(secondClaim).toBe(false);
  });
});

describe('collectSettleMemberAndUserData', () => {
  it('fetches every member doc referenced by transfers and their linked user docs', async () => {
    const groupRef = db.collection('groups').doc();
    const memberARef = groupRef.collection('members').doc();
    const memberBRef = groupRef.collection('members').doc();
    const userARef = db.collection('users').doc();
    await userARef.set({ displayName: 'User A', email: 'a@example.com' });
    await memberARef.set({ displayName: 'Member A', userRef: userARef });
    await memberBRef.set({ displayName: 'Member B', userRef: null });

    const transfers: DocumentData[] = [
      {
        paidByMemberRef: memberARef,
        paidToMemberRef: memberBRef,
        totalPaid: 10,
      },
    ];

    const { memberDataMap, userDataMap } =
      await collectSettleMemberAndUserData(transfers);

    expect(memberDataMap.get(memberARef.path)?.['displayName']).toBe(
      'Member A'
    );
    expect(memberDataMap.get(memberBRef.path)?.['displayName']).toBe(
      'Member B'
    );
    expect(userDataMap.get(userARef.path)?.['displayName']).toBe('User A');
    expect(userDataMap.size).toBe(1); // Member B has no userRef
  });
});

describe('buildMemberTransferBlocks', () => {
  it('builds "you owe" text/HTML including the payee\'s payment methods', () => {
    const payerPath = 'groups/g1/members/payer';
    const payeePath = 'groups/g1/members/payee';
    const memberDataMap = new Map<string, DocumentData>([
      [payeePath, { displayName: 'Payee', userRef: fakeRef('users/u2') }],
    ]);
    const userDataMap = new Map<string, DocumentData>([
      ['users/u2', { venmoId: '@payee' }],
    ]);
    const transfers: DocumentData[] = [
      {
        paidByMemberRef: fakeRef(payerPath),
        paidToMemberRef: fakeRef(payeePath),
        totalPaid: 25,
      },
    ];

    const { transferLines, transferHtmlBlocks } = buildMemberTransferBlocks(
      payerPath,
      transfers,
      memberDataMap,
      userDataMap,
      'USD',
      '$',
      2
    );

    expect(transferLines).toContain('You owe $25.00 to Payee');
    expect(transferLines).toContain('Venmo: @payee');
    expect(transferHtmlBlocks).toContain('You owe');
    expect(transferHtmlBlocks).toContain('Payee');
  });

  it('builds "owed to you" text for the payee\'s perspective', () => {
    const payerPath = 'groups/g1/members/payer';
    const payeePath = 'groups/g1/members/payee';
    const memberDataMap = new Map<string, DocumentData>([
      [payerPath, { displayName: 'Payer' }],
    ]);
    const transfers: DocumentData[] = [
      {
        paidByMemberRef: fakeRef(payerPath),
        paidToMemberRef: fakeRef(payeePath),
        totalPaid: 25,
      },
    ];

    const { transferLines } = buildMemberTransferBlocks(
      payeePath,
      transfers,
      memberDataMap,
      new Map(),
      'USD',
      '$',
      2
    );

    expect(transferLines).toContain('Payer owes you $25.00');
  });

  it('ignores transfers the member is not a party to', () => {
    const memberPath = 'groups/g1/members/bystander';
    const transfers: DocumentData[] = [
      {
        paidByMemberRef: fakeRef('groups/g1/members/a'),
        paidToMemberRef: fakeRef('groups/g1/members/b'),
        totalPaid: 5,
      },
    ];

    const { transferLines, transferHtmlBlocks } = buildMemberTransferBlocks(
      memberPath,
      transfers,
      new Map(),
      new Map(),
      'USD',
      '$',
      2
    );

    expect(transferLines).toBe('');
    expect(transferHtmlBlocks).toBe('');
  });
});

// ---------------------------------------------------------------------------
// sendPaymentNotificationEmail (the history-created trigger): a member whose
// stored email is not exactly one valid address gets no mail; the other
// party still does. The mail collection is global, so every address here is
// unique to its test and mail is only found by `to`.
// ---------------------------------------------------------------------------

describe('sendPaymentNotificationEmail: stored member addresses', () => {
  const uniqueEmail = (label: string) =>
    `${label}-${randomUUID()}@settle-email.test`;

  async function mailTo(to: string): Promise<number> {
    return (await db.collection('mail').where('to', '==', to).get()).size;
  }

  async function seedGroup(): Promise<DocumentReference> {
    const ref = db.collection('groups').doc(`g-${randomUUID()}`);
    await ref.set({
      name: 'Settle Trip',
      currencyCode: 'USD',
      currencySymbol: '$',
      decimalPlaces: 2,
    });
    return ref;
  }

  /** A member linked to a user who has not opted out of email. */
  async function seedLinkedMember(
    groupRef: DocumentReference,
    displayName: string,
    email: string
  ): Promise<DocumentReference> {
    const userRef = db.collection('users').doc(`u-${randomUUID()}`);
    await userRef.set({ email: uniqueEmail('user'), emailOptOut: false });
    const memberRef = groupRef.collection('members').doc();
    await memberRef.set({ displayName, email, userRef, active: true });
    return memberRef;
  }

  function fire(groupRef: DocumentReference, history: DocumentData) {
    return Promise.resolve(
      sendPaymentNotificationEmail.run({
        data: { data: () => history },
        params: { groupId: groupRef.id, historyId: `h-${randomUUID()}` },
      } as any)
    );
  }

  it('mails only the payee of a member payment when the payer email is a comma list', async () => {
    const groupRef = await seedGroup();
    const [listA, listB, payeeEmail] = [
      uniqueEmail('list'),
      uniqueEmail('list'),
      uniqueEmail('payee'),
    ];
    const payerRef = await seedLinkedMember(groupRef, 'Pat', `${listA},${listB}`);
    const payeeRef = await seedLinkedMember(groupRef, 'Quinn', payeeEmail);

    await fire(groupRef, {
      paidByMemberRef: payerRef,
      paidToMemberRef: payeeRef,
      totalPaid: 12,
      splitsPaid: [groupRef.collection('splits').doc()],
    });

    expect(await mailTo(payeeEmail)).toBe(1);
    expect(await mailTo(`${listA},${listB}`)).toBe(0);
    expect(await mailTo(listA)).toBe(0);
    expect(await mailTo(listB)).toBe(0);
  });

  it('mails only the payer of a member payment when the payee email has angle brackets', async () => {
    const groupRef = await seedGroup();
    const payerEmail = uniqueEmail('payer');
    const bad = `${uniqueEmail('bracket')}<b>`;
    const payerRef = await seedLinkedMember(groupRef, 'Pat', payerEmail);
    const payeeRef = await seedLinkedMember(groupRef, 'Quinn', bad);

    await fire(groupRef, {
      paidByMemberRef: payerRef,
      paidToMemberRef: payeeRef,
      totalPaid: 12,
      splitsPaid: [groupRef.collection('splits').doc()],
    });

    expect(await mailTo(payerEmail)).toBe(1);
    expect(await mailTo(bad)).toBe(0);
  });

  it('mails only the members with a valid address in a group settle', async () => {
    const groupRef = await seedGroup();
    const [listA, listB, goodEmail] = [
      uniqueEmail('list'),
      uniqueEmail('list'),
      uniqueEmail('good'),
    ];
    const listRef = await seedLinkedMember(groupRef, 'Pat', `${listA},${listB}`);
    const goodRef = await seedLinkedMember(groupRef, 'Quinn', goodEmail);
    const batchId = `b-${randomUUID()}`;
    const history = {
      paidByMemberRef: listRef,
      paidToMemberRef: goodRef,
      totalPaid: 30,
      splitsPaid: [],
      batchId,
      batchSize: 1,
    };
    // handleSettleEmail waits until every history doc of the batch exists.
    await groupRef.collection('history').doc().set(history);

    await fire(groupRef, history);

    expect(await mailTo(goodEmail)).toBe(1);
    expect(await mailTo(`${listA},${listB}`)).toBe(0);
    expect(await mailTo(listA)).toBe(0);
    expect(await mailTo(listB)).toBe(0);
  });
});
