import { randomUUID } from 'node:crypto';
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callables.
import {
  sendGroupInvite,
  sendPaymentRequests,
  sendPaymentReversalEmails,
  sendSettleReversalEmails,
} from './index';
import {
  deleteExpiredGroupMailLimits,
  GROUP_MAIL_DAILY_LIMIT,
  GROUP_MAIL_LIMIT_REACHED,
  GROUP_MAIL_LIMITS,
  groupMailHour,
  liveGroupMailCount,
} from './mail-allowance';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

// The per-caller group-mail allowance (mail-allowance.ts): every recipient
// the four group-mail callables queue counts against the caller's uid, and a
// call that would pass GROUP_MAIL_DAILY_LIMIT in the rolling window is refused
// whole. Each test has its own caller uid, so the limit docs never collide;
// mail is only ever found by its unique recipient.

const db = getFirestore();
const HOUR_MS = 60 * 60 * 1000;

const uniqueEmail = (label: string) =>
  `${label}-${randomUUID()}@mail-allowance.test`;

type Callable = { run: (request: any) => unknown };

function call(fn: Callable, uid: string, data: unknown): Promise<any> {
  return Promise.resolve(fn.run({ auth: { uid, token: {} }, data } as any));
}

async function mailCount(to: string): Promise<number> {
  return (await db.collection('mail').where('to', '==', to).get()).size;
}

const limitDoc = (uid: string) => db.collection(GROUP_MAIL_LIMITS).doc(uid);

/** The caller's counted recipients right now (0 when no doc). */
async function used(uid: string): Promise<number> {
  const snap = await limitDoc(uid).get();
  return liveGroupMailCount(snap.data(), Date.now());
}

/** Puts `count` recipients in the caller's hour bucket `hoursAgo` ago. */
async function seedUsage(
  uid: string,
  buckets: { hoursAgo: number; count: number }[]
): Promise<void> {
  const nowHour = groupMailHour(Date.now());
  const hours: Record<string, number> = {};
  for (const b of buckets) hours[String(nowHour - b.hoursAgo)] = b.count;
  await limitDoc(uid).set({
    hours,
    expiresAt: Timestamp.fromMillis((nowHour + 25) * HOUR_MS),
  });
}

interface Seeded {
  uid: string;
  groupRef: DocumentReference;
  callerMemberId: string;
  /** Linked, mailable members (not the caller), with their group emails. */
  linked: { id: string; email: string }[];
}

/**
 * A group the caller (uid) is an active admin of, with `linkedCount` other
 * members linked to users who can be mailed, plus anything in `extra`.
 */
async function seedGroup(linkedCount: number): Promise<Seeded> {
  const uid = uniqueId('u');
  const callerUser = db.collection('users').doc(uid);
  await callerUser.set({ email: uniqueEmail('caller'), emailOptOut: false });
  const groupRef = await makeGroup({ name: `Allowance ${randomUUID()}` });
  const callerMember = await makeMember(groupRef, {
    displayName: 'Caller',
    email: uniqueEmail('caller-member'),
    userRef: callerUser,
    groupAdmin: true,
  });
  const batch = db.batch();
  const linked: { id: string; email: string }[] = [];
  for (let i = 0; i < linkedCount; i++) {
    const email = uniqueEmail(`linked-${i}`);
    const userRef = db.collection('users').doc(uniqueId('u'));
    batch.set(userRef, { email, emailOptOut: false });
    const memberRef = groupRef.collection('members').doc(uniqueId('m'));
    batch.set(memberRef, {
      displayName: `Linked ${i}`,
      email,
      emailLower: email,
      userRef,
      active: true,
      groupAdmin: false,
    });
    linked.push({ id: memberRef.id, email });
  }
  await batch.commit();
  return { uid, groupRef, callerMemberId: callerMember.id, linked };
}

function settleReversal(s: Seeded, memberIds: string[]): Promise<any> {
  return call(sendSettleReversalEmails, s.uid, {
    groupId: s.groupRef.id,
    memberIds,
    settleDate: '2026-10-01',
  });
}

function paymentRequests(s: Seeded, owedByIds: string[]): Promise<any> {
  return call(sendPaymentRequests, s.uid, {
    groupId: s.groupRef.id,
    requests: owedByIds.map((id) => ({
      owedByMemberId: id,
      owedToMemberId: s.callerMemberId,
      amount: 10,
    })),
  });
}

function paymentReversal(s: Seeded, a: string, b: string): Promise<any> {
  return call(sendPaymentReversalEmails, s.uid, {
    groupId: s.groupRef.id,
    paidByMemberId: a,
    paidToMemberId: b,
    amount: 10,
    splitCount: 1,
  });
}

/** An unregistered active member of the group, ready to be invited. */
async function invitee(s: Seeded): Promise<{ id: string; email: string }> {
  const email = uniqueEmail('invitee');
  const ref = await makeMember(s.groupRef, {
    displayName: 'Invitee',
    email,
    userRef: null,
  });
  return { id: ref.id, email };
}

function invite(s: Seeded, memberId: string): Promise<any> {
  return call(sendGroupInvite, s.uid, { groupId: s.groupRef.id, memberId });
}

const LIMIT_REFUSAL = {
  code: 'resource-exhausted',
  message: GROUP_MAIL_LIMIT_REACHED,
};

describe('group-mail allowance', () => {
  it('is 100 recipients per caller', () => {
    expect(GROUP_MAIL_DAILY_LIMIT).toBe(100);
  });

  it('counts recipients across all four callables and refuses past the limit', async () => {
    const s = await seedGroup(25);
    const ids = s.linked.map((m) => m.id);

    // 25 + 25 + 25 + 23 + 2 = 100 recipients, through three callables.
    for (let i = 0; i < 3; i++) {
      await expect(settleReversal(s, ids)).resolves.toEqual({ sent: 25 });
    }
    await expect(paymentRequests(s, ids.slice(0, 23))).resolves.toMatchObject({
      results: Array(23).fill('sent'),
    });
    await expect(paymentReversal(s, ids[0]!, ids[1]!)).resolves.toEqual({
      sent: 2,
    });
    expect(await used(s.uid)).toBe(GROUP_MAIL_DAILY_LIMIT);

    // The fourth callable is refused too, and nothing is recorded or queued.
    const inv = await invitee(s);
    await expect(invite(s, inv.id)).rejects.toMatchObject(LIMIT_REFUSAL);
    expect(await mailCount(inv.email)).toBe(0);
    const member = (
      await s.groupRef.collection('members').doc(inv.id).get()
    ).data()!;
    expect(member['invite']).toBeUndefined();

    const last = s.linked[24]!;
    const before = await mailCount(last.email);
    await expect(paymentRequests(s, [last.id])).rejects.toMatchObject(
      LIMIT_REFUSAL
    );
    await expect(paymentReversal(s, ids[0]!, ids[1]!)).rejects.toMatchObject(
      LIMIT_REFUSAL
    );
    await expect(settleReversal(s, [last.id])).rejects.toMatchObject(
      LIMIT_REFUSAL
    );
    expect(await mailCount(last.email)).toBe(before);
    expect(await used(s.uid)).toBe(GROUP_MAIL_DAILY_LIMIT);
  });

  it('counts a sent invite against the same allowance', async () => {
    const s = await seedGroup(0);
    const inv = await invitee(s);
    await expect(invite(s, inv.id)).resolves.toMatchObject({ success: true });
    expect(await used(s.uid)).toBe(1);
  });

  it('refuses a whole call that would pass the limit, queueing none of it', async () => {
    const s = await seedGroup(2);
    await seedUsage(s.uid, [{ hoursAgo: 1, count: GROUP_MAIL_DAILY_LIMIT - 1 }]);
    const [a, b] = s.linked as [
      { id: string; email: string },
      { id: string; email: string },
    ];

    await expect(paymentReversal(s, a.id, b.id)).rejects.toMatchObject(
      LIMIT_REFUSAL
    );
    expect(await mailCount(a.email)).toBe(0);
    expect(await mailCount(b.email)).toBe(0);
    expect(await used(s.uid)).toBe(GROUP_MAIL_DAILY_LIMIT - 1);

    // The one recipient that still fits goes out.
    await expect(settleReversal(s, [a.id])).resolves.toEqual({ sent: 1 });
    expect(await mailCount(a.email)).toBe(1);
    expect(await used(s.uid)).toBe(GROUP_MAIL_DAILY_LIMIT);
  });

  it('does not count skipped recipients', async () => {
    const s = await seedGroup(1);
    const optedOutUser = db.collection('users').doc(uniqueId('u'));
    const optedOutEmail = uniqueEmail('opted-out');
    await optedOutUser.set({ email: optedOutEmail, emailOptOut: true });
    const optedOut = await makeMember(s.groupRef, {
      displayName: 'Opted out',
      email: optedOutEmail,
      emailLower: optedOutEmail,
      userRef: optedOutUser,
    });
    const placeholder = await makeMember(s.groupRef, {
      displayName: 'Placeholder',
      email: uniqueEmail('placeholder'),
      userRef: null,
    });

    await expect(
      settleReversal(s, [s.linked[0]!.id, optedOut.id, placeholder.id])
    ).resolves.toEqual({ sent: 1 });
    await expect(
      paymentRequests(s, [optedOut.id, placeholder.id])
    ).resolves.toEqual({ results: ['opted_out', 'not_registered'] });
    expect(await used(s.uid)).toBe(1);
  });

  it('still answers a call that mails no one when the limit is reached', async () => {
    const s = await seedGroup(0);
    await seedUsage(s.uid, [{ hoursAgo: 0, count: GROUP_MAIL_DAILY_LIMIT }]);
    const placeholder = await makeMember(s.groupRef, {
      displayName: 'Placeholder',
      email: uniqueEmail('placeholder'),
      userRef: null,
    });
    await expect(paymentRequests(s, [placeholder.id])).resolves.toEqual({
      results: ['not_registered'],
    });
  });

  it('rolls over: recipients older than the window stop counting', async () => {
    const s = await seedGroup(1);
    const target = s.linked[0]!;

    // Still inside the window (23 hours ago): refused.
    await seedUsage(s.uid, [{ hoursAgo: 23, count: GROUP_MAIL_DAILY_LIMIT }]);
    await expect(settleReversal(s, [target.id])).rejects.toMatchObject(
      LIMIT_REFUSAL
    );

    // Out of it (26 hours ago), while a recent bucket still counts.
    await seedUsage(s.uid, [
      { hoursAgo: 26, count: GROUP_MAIL_DAILY_LIMIT },
      { hoursAgo: 2, count: GROUP_MAIL_DAILY_LIMIT - 1 },
    ]);
    await expect(settleReversal(s, [target.id])).resolves.toEqual({ sent: 1 });
    expect(await used(s.uid)).toBe(GROUP_MAIL_DAILY_LIMIT);
    // The ended bucket is dropped from the doc.
    const hours = (await limitDoc(s.uid).get()).get('hours') as DocumentData;
    expect(Object.keys(hours)).not.toContain(
      String(groupMailHour(Date.now()) - 26)
    );
  });

  it('keeps an expiresAt past the last counted hour (for a TTL policy)', async () => {
    const s = await seedGroup(1);
    const before = Date.now();
    await settleReversal(s, [s.linked[0]!.id]);
    const expiresAt = (await limitDoc(s.uid).get()).get(
      'expiresAt'
    ) as Timestamp;
    expect(expiresAt.toMillis()).toBeGreaterThanOrEqual(before + 24 * HOUR_MS);
  });
});

describe('liveGroupMailCount', () => {
  const nowMs = Date.UTC(2026, 9, 23, 12, 30);
  const nowHour = groupMailHour(nowMs);

  it('sums the buckets of the last 24 hours, never fewer', () => {
    expect(
      liveGroupMailCount(
        {
          hours: {
            [String(nowHour)]: 3,
            [String(nowHour - 23)]: 4,
            // Up to 25 hours old: a recipient always counts for 24 hours.
            [String(nowHour - 24)]: 5,
            [String(nowHour - 25)]: 50,
          },
        },
        nowMs
      )
    ).toBe(12);
  });

  it('treats a missing or malformed doc as unused', () => {
    expect(liveGroupMailCount(undefined, nowMs)).toBe(0);
    expect(liveGroupMailCount({ hours: 'x' }, nowMs)).toBe(0);
    expect(
      liveGroupMailCount({ hours: { [String(nowHour)]: 'x' } }, nowMs)
    ).toBe(0);
  });
});

describe('deleteExpiredGroupMailLimits', () => {
  it('deletes only the docs whose every bucket has ended', async () => {
    const nowMs = Date.now();
    const ended = limitDoc(uniqueId('u'));
    const live = limitDoc(uniqueId('u'));
    await ended.set({ hours: {}, expiresAt: Timestamp.fromMillis(nowMs - 1) });
    await live.set({
      hours: {},
      expiresAt: Timestamp.fromMillis(nowMs + HOUR_MS),
    });

    const deleted = await deleteExpiredGroupMailLimits(nowMs);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect((await ended.get()).exists).toBe(false);
    expect((await live.get()).exists).toBe(true);
  });
});
