import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// Importing from index both initialises the Admin SDK and proves the
// callable is exported from the functions entry (so it deploys).
import { getMemberPaymentMethods } from './index';
import { NOT_ACTIVE_MEMBER, VERIFY_LOGIN_EMAIL } from './member-email';
import {
  PAYMENT_LOOKUP_DAILY_LIMIT,
  PAYMENT_LOOKUP_LIMIT_REACHED,
  PAYMENT_LOOKUP_LIMITS,
} from './payment-methods';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

const db = getFirestore();

type Callable = { run: (request: any) => unknown };

function call(fn: Callable, uid: string | null, data: unknown): Promise<any> {
  return Promise.resolve(
    fn.run({ auth: uid ? { uid, token: {} } : undefined, data } as any)
  );
}

const HANDLES = {
  venmoId: '@venmo-handle',
  paypalId: 'paypal-handle',
  cashAppId: '$cashapp-handle',
  zelleId: 'zelle@handle.test',
};
const NO_HANDLES = { venmoId: '', paypalId: '', cashAppId: '', zelleId: '' };

interface Setup {
  caller: string;
  groupRef: DocumentReference;
  payeeRef: DocumentReference;
}

/** A verified caller who is an active member of a fresh group with one payee row. */
async function setup(
  payeeFields: (payeeUid: string) => Promise<Record<string, unknown>>
): Promise<Setup> {
  const caller = uniqueId('caller');
  await getAuth().createUser({
    uid: caller,
    email: `${caller}@payment-methods.test`,
    emailVerified: true,
  });
  const payeeUid = uniqueId('payee');
  const groupRef = await makeGroup({ activeMemberUids: [caller, payeeUid] });
  const payeeRef = await makeMember(groupRef, await payeeFields(payeeUid));
  return { caller, groupRef, payeeRef };
}

/** A payee row linked to a users doc holding `userFields` (no doc when null). */
function linkedPayee(
  rowFields: Record<string, unknown> = {},
  userFields: Record<string, unknown> | null = {
    ...HANDLES,
    email: 'payee-private@payment-methods.test',
    emailOptOut: true,
  }
): Promise<Setup> {
  return setup(async (payeeUid) => {
    const userRef = db.collection('users').doc(payeeUid);
    if (userFields) await userRef.set(userFields);
    return { userRef, ...rowFields };
  });
}

const limitDoc = (uid: string) => db.collection(PAYMENT_LOOKUP_LIMITS).doc(uid);

function lookup(s: Setup): Promise<any> {
  return call(getMemberPaymentMethods, s.caller, {
    groupId: s.groupRef.id,
    memberId: s.payeeRef.id,
  });
}

describe('getMemberPaymentMethods refusals', () => {
  it('refuses a signed-out caller', async () => {
    const s = await linkedPayee();
    await expect(
      call(getMemberPaymentMethods, null, {
        groupId: s.groupRef.id,
        memberId: s.payeeRef.id,
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['groupId with a slash', { groupId: 'a/b' }],
    ['groupId that is not a string', { groupId: 5 }],
    ['empty groupId', { groupId: '' }],
    ['memberId with a slash', { memberId: 'a/b' }],
    ['missing memberId', { memberId: undefined }],
    ['reserved memberId', { memberId: '..' }],
  ])('refuses a bad id: %s', async (_name, override) => {
    const s = await linkedPayee();
    await expect(
      call(getMemberPaymentMethods, s.caller, {
        groupId: s.groupRef.id,
        memberId: s.payeeRef.id,
        ...override,
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses an unverified caller', async () => {
    const s = await linkedPayee();
    await getAuth().updateUser(s.caller, { emailVerified: false });
    await expect(lookup(s)).rejects.toMatchObject({
      code: 'permission-denied',
      message: VERIFY_LOGIN_EMAIL,
    });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses a caller who is not in the group', async () => {
    const s = await linkedPayee();
    await s.groupRef.update({ activeMemberUids: [uniqueId('someone-else')] });
    await expect(lookup(s)).rejects.toMatchObject({
      code: 'permission-denied',
      message: NOT_ACTIVE_MEMBER,
    });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses a caller who left the group', async () => {
    const s = await linkedPayee();
    await s.groupRef.update({ activeMemberUids: [] });
    await makeMember(s.groupRef, {
      userRef: db.collection('users').doc(s.caller),
      active: false,
    });
    await expect(lookup(s)).rejects.toMatchObject({
      code: 'permission-denied',
      message: NOT_ACTIVE_MEMBER,
    });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses a group that does not exist', async () => {
    const s = await linkedPayee();
    await expect(
      call(getMemberPaymentMethods, s.caller, {
        groupId: uniqueId('missing'),
        memberId: s.payeeRef.id,
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: NOT_ACTIVE_MEMBER,
    });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses a member id from another group', async () => {
    const s = await linkedPayee();
    const other = await linkedPayee();
    await expect(
      call(getMemberPaymentMethods, s.caller, {
        groupId: s.groupRef.id,
        memberId: other.payeeRef.id,
      })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });

  it('refuses a missing member id', async () => {
    const s = await linkedPayee();
    await expect(
      call(getMemberPaymentMethods, s.caller, {
        groupId: s.groupRef.id,
        memberId: uniqueId('missing'),
      })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect((await limitDoc(s.caller).get()).exists).toBe(false);
  });
});

describe('getMemberPaymentMethods results', () => {
  it('returns exactly the four handles of a linked payee', async () => {
    const s = await linkedPayee();
    const result = await lookup(s);
    expect(result).toEqual(HANDLES);
    expect(Object.keys(result).sort()).toEqual([
      'cashAppId',
      'paypalId',
      'venmoId',
      'zelleId',
    ]);
  });

  it('returns each missing handle as an empty string', async () => {
    const s = await linkedPayee({}, { venmoId: '@only-venmo' });
    expect(await lookup(s)).toEqual({ ...NO_HANDLES, venmoId: '@only-venmo' });
  });

  it('still returns the handles of an inactive payee row', async () => {
    const s = await linkedPayee({ active: false });
    expect(await lookup(s)).toEqual(HANDLES);
  });

  it('returns empty handles for an unlinked payee', async () => {
    const s = await setup(async () => ({ userRef: null }));
    expect(await lookup(s)).toEqual(NO_HANDLES);
  });

  it('returns empty handles when the linked users doc is gone', async () => {
    const s = await linkedPayee({}, null);
    expect(await lookup(s)).toEqual(NO_HANDLES);
  });
});

describe('getMemberPaymentMethods limit', () => {
  it(`refuses the ${PAYMENT_LOOKUP_DAILY_LIMIT + 1}st call in a window, and allows the next window`, async () => {
    const s = await linkedPayee();
    await limitDoc(s.caller).set({
      windowStart: Timestamp.fromMillis(Date.now() - 1000),
      count: PAYMENT_LOOKUP_DAILY_LIMIT - 1,
    });
    await expect(lookup(s)).resolves.toEqual(HANDLES);
    expect((await limitDoc(s.caller).get()).get('count')).toBe(
      PAYMENT_LOOKUP_DAILY_LIMIT
    );
    await expect(lookup(s)).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: PAYMENT_LOOKUP_LIMIT_REACHED,
    });
    expect((await limitDoc(s.caller).get()).get('count')).toBe(
      PAYMENT_LOOKUP_DAILY_LIMIT
    );

    // A window that ended starts a new one.
    await limitDoc(s.caller).update({
      windowStart: Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
    });
    await expect(lookup(s)).resolves.toEqual(HANDLES);
    expect((await limitDoc(s.caller).get()).get('count')).toBe(1);
  });

  it('uses the documented collection, limit and message', () => {
    expect(PAYMENT_LOOKUP_LIMITS).toBe('paymentLookupLimits');
    expect(PAYMENT_LOOKUP_DAILY_LIMIT).toBe(100);
    expect(PAYMENT_LOOKUP_LIMIT_REACHED).toBe(
      "You've looked up too many payment details today. Try again tomorrow."
    );
  });
});
