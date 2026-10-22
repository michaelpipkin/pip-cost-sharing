import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callable.
import { sendGroupInvite } from './index';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

// The address/escaping rules for the stored email are in invite-email.spec.ts
// (comma lists, angle brackets, surrounding spaces); this file covers the
// handler's guards, the cooldown and the outcome. Every invitee gets a unique
// address and mail is only ever found by that address.

const db = getFirestore();
const HOUR_MS = 60 * 60 * 1000;

function invite(uid: string | null, data: unknown) {
  return Promise.resolve(
    sendGroupInvite.run({
      auth: uid ? { uid, token: {} } : undefined,
      data,
    } as any)
  );
}

const address = () => `invitee-${uniqueId('x')}@send-invite.test`;

async function mailTo(to: string) {
  return (await db.collection('mail').where('to', '==', to).get()).docs.map(
    (d) => d.data()
  );
}

/** A group whose admin (uid) can invite, plus one unregistered active invitee. */
async function seed(
  opts: {
    email?: string;
    invitee?: Record<string, unknown>;
    admin?: Record<string, unknown>;
    groupName?: string;
  } = {}
) {
  const uid = uniqueId('u');
  const group = await makeGroup({ name: opts.groupName ?? 'Invite Trip' });
  await makeMember(group, {
    userRef: db.collection('users').doc(uid),
    groupAdmin: true,
    displayName: 'Ann Admin',
    ...opts.admin,
  });
  const email = opts.email ?? address();
  const member = await makeMember(group, {
    displayName: 'Invitee',
    email,
    userRef: null,
    ...opts.invitee,
  });
  return { uid, group, member, email };
}

describe('sendGroupInvite: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(
      invite(null, { groupId: 'g', memberId: 'm' })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['no group', { memberId: 'm' }],
    ['no member', { groupId: 'g' }],
    ['no payload', {}],
    ['a null payload', null],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    await expect(invite(uniqueId('u'), data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('refuses a group member who is not an admin and sends nothing', async () => {
    const { group, member, email } = await seed();
    const memberUid = uniqueId('plain');
    await makeMember(group, {
      userRef: db.collection('users').doc(memberUid),
      groupAdmin: false,
    });

    await expect(
      invite(memberUid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(await mailTo(email)).toHaveLength(0);
    expect((await member.get()).data()?.['invite']).toBeUndefined();
  });

  it('refuses an admin of a different group', async () => {
    const { group, member, email } = await seed();
    const { uid: otherAdmin } = await seed();

    await expect(
      invite(otherAdmin, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(await mailTo(email)).toHaveLength(0);
  });

  // BUG (B2): functions/src/index.ts:1661-1666 matches on groupAdmin alone and
  // never checks `active`, so a member who left the group can still send
  // invitations from it.
  it.fails('refuses an inactive admin and sends nothing', async () => {
    const { uid, group, member, email } = await seed({
      admin: { active: false },
    });

    await expect(
      invite(uid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(await mailTo(email)).toHaveLength(0);
  });

  it('reports not-found for a member that does not exist', async () => {
    const { uid, group } = await seed();

    await expect(
      invite(uid, { groupId: group.id, memberId: uniqueId('missing') })
    ).rejects.toMatchObject({ code: 'not-found', message: 'Member not found' });
  });
});

describe('sendGroupInvite: members that cannot be invited', () => {
  it('refuses a member who already has an account', async () => {
    const { uid, group, member, email } = await seed({
      invitee: { userRef: db.collection('users').doc(uniqueId('reg')) },
    });

    await expect(
      invite(uid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(await mailTo(email)).toHaveLength(0);
  });

  it('refuses an inactive member', async () => {
    const { uid, group, member, email } = await seed({
      invitee: { active: false },
    });

    await expect(
      invite(uid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(await mailTo(email)).toHaveLength(0);
  });

  it.each([
    ['an empty email', () => ''],
    ['no @ sign', () => `not-an-email-${uniqueId('x')}`],
    ['no dot in the domain', () => `${uniqueId('a')}@b`],
  ])('refuses a member with %s', async (_label, build) => {
    const stored = build();
    const { uid, group, member } = await seed({ email: stored });

    await expect(
      invite(uid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    expect((await member.get()).data()?.['invite']).toBeUndefined();
    if (stored) expect(await mailTo(stored)).toHaveLength(0);
  });
});

describe('sendGroupInvite: sending', () => {
  it('queues one mail, records the invite and returns the send count', async () => {
    const { uid, group, member, email } = await seed({
      groupName: 'Beach Trip',
    });

    const result = await invite(uid, {
      groupId: group.id,
      memberId: member.id,
    });

    expect(result).toEqual({ success: true, sentTo: email, sendCount: 1 });
    const mail = await mailTo(email);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.['message'].subject).toBe(
      "You're invited to join Beach Trip on PipSplit"
    );
    expect(mail[0]?.['message'].text).toContain(
      'Ann Admin added you to the group "Beach Trip"'
    );
    const recorded = (await member.get()).data()?.['invite'];
    expect(recorded).toMatchObject({ lastSentTo: email, sendCount: 1 });
    expect(recorded.lastSentAt).toBeInstanceOf(Timestamp);
  });

  it('refuses a repeat within 24 hours and sends no second mail', async () => {
    const { uid, group, member, email } = await seed();
    const data = { groupId: group.id, memberId: member.id };
    await invite(uid, data);

    await expect(invite(uid, data)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });

    expect(await mailTo(email)).toHaveLength(1);
    expect((await member.get()).data()?.['invite'].sendCount).toBe(1);
  });

  it('allows a new invite once the cooldown has passed', async () => {
    const { uid, group, member, email } = await seed();
    await member.update({
      invite: {
        lastSentAt: Timestamp.fromMillis(Date.now() - 25 * HOUR_MS),
        lastSentTo: email,
        sendCount: 1,
      },
    });

    const result = await invite(uid, {
      groupId: group.id,
      memberId: member.id,
    });

    expect(result).toEqual({ success: true, sentTo: email, sendCount: 2 });
    expect(await mailTo(email)).toHaveLength(1);
  });

  it('still refuses a repeat just inside the cooldown', async () => {
    const { uid, group, member, email } = await seed();
    await member.update({
      invite: {
        lastSentAt: Timestamp.fromMillis(Date.now() - 23 * HOUR_MS),
        lastSentTo: email,
        sendCount: 1,
      },
    });

    await expect(
      invite(uid, { groupId: group.id, memberId: member.id })
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(await mailTo(email)).toHaveLength(0);
  });

  it('allows an invite to a changed address inside the cooldown', async () => {
    const { uid, group, member, email } = await seed();
    await member.update({
      invite: {
        lastSentAt: Timestamp.fromMillis(Date.now() - HOUR_MS),
        lastSentTo: address(),
        sendCount: 1,
      },
    });

    const result = await invite(uid, {
      groupId: group.id,
      memberId: member.id,
    });

    expect(result).toEqual({ success: true, sentTo: email, sendCount: 2 });
    expect(await mailTo(email)).toHaveLength(1);
    expect((await member.get()).data()?.['invite'].lastSentTo).toBe(email);
  });
});

describe('sendGroupInvite: name fallbacks', () => {
  it('calls the inviter "A group admin" when the admin has no display name', async () => {
    const uid = uniqueId('u');
    const group = await makeGroup();
    // Written directly: makeMember always sets a displayName.
    await group.collection('members').doc(uniqueId('m')).set({
      userRef: db.collection('users').doc(uid),
      groupAdmin: true,
      active: true,
    });
    const email = address();
    const member = await makeMember(group, { email, userRef: null });

    await invite(uid, { groupId: group.id, memberId: member.id });

    const [mail] = await mailTo(email);
    expect(mail?.['message'].text).toContain('A group admin added you to');
  });

  it('calls the group "a PipSplit group" when it has no name', async () => {
    const uid = uniqueId('u');
    const group = db.collection('groups').doc(uniqueId('g'));
    await group.set({ currencyCode: 'USD' });
    await makeMember(group, {
      userRef: db.collection('users').doc(uid),
      groupAdmin: true,
    });
    const email = address();
    const member = await makeMember(group, { email, userRef: null });

    await invite(uid, { groupId: group.id, memberId: member.id });

    const [mail] = await mailTo(email);
    expect(mail?.['message'].subject).toBe(
      "You're invited to join a PipSplit group on PipSplit"
    );
    expect(mail?.['message'].text).toContain('"a PipSplit group"');
  });
});
