import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  buildMemberTransferBlocks,
  claimSettleBatch,
  collectSettleMemberAndUserData,
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
