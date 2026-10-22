import { randomUUID } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  buildGroupInviteEmail,
  sendGroupInvite,
  shouldThrottleInvite,
} from './index';

describe('buildGroupInviteEmail', () => {
  it('includes the group name in the subject', () => {
    const { subject } = buildGroupInviteEmail({
      memberName: 'Alex',
      groupName: 'Ski Trip',
      inviterName: 'Michael',
    });
    expect(subject).toContain('Ski Trip');
  });

  it('includes the app URL, the Play Store URL, and both names in the text body', () => {
    const { text } = buildGroupInviteEmail({
      memberName: 'Alex',
      groupName: 'Ski Trip',
      inviterName: 'Michael',
    });
    expect(text).toContain('https://pipsplit.com');
    expect(text).toContain(
      'https://play.google.com/store/apps/details?id=com.pipsplit.app'
    );
    expect(text).toContain('Alex');
    expect(text).toContain('Michael');
    expect(text).toContain('Ski Trip');
  });

  it('includes a CTA button linking to the app URL and a Play Store link in the html body', () => {
    const { html } = buildGroupInviteEmail({
      memberName: 'Alex',
      groupName: 'Ski Trip',
      inviterName: 'Michael',
    });
    expect(html).toContain('href="https://pipsplit.com"');
    expect(html).toContain(
      'href="https://play.google.com/store/apps/details?id=com.pipsplit.app"'
    );
    expect(html).toContain('background-color:#105208');
  });

  it('escapes HTML special characters in member, group, and inviter names', () => {
    const { html } = buildGroupInviteEmail({
      memberName: '<script>x</script>',
      groupName: 'Tom & Jerry',
      inviterName: 'Tom & Jerry',
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('uses an invite-specific footer, not the default member-opt-out footer', () => {
    const { html } = buildGroupInviteEmail({
      memberName: 'Alex',
      groupName: 'Ski Trip',
      inviterName: 'Michael',
    });
    expect(html).toContain('invited you to join their group');
    expect(html).not.toContain('member of a PipSplit group');
  });
});

describe('shouldThrottleInvite', () => {
  const email = 'alex@example.com';

  it('does not throttle when there is no existing invite record', () => {
    expect(shouldThrottleInvite(undefined, email, Date.now())).toBe(false);
  });

  it('does not throttle when the invite was sent to a different address', () => {
    const invite = {
      lastSentAt: Timestamp.fromMillis(Date.now()),
      lastSentTo: 'someone-else@example.com',
    };
    expect(shouldThrottleInvite(invite, email, Date.now())).toBe(false);
  });

  it('throttles when the same address was invited less than 24 hours ago', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const invite = {
      lastSentAt: Timestamp.fromMillis(oneHourAgo),
      lastSentTo: email,
    };
    expect(shouldThrottleInvite(invite, email, Date.now())).toBe(true);
  });

  it('does not throttle once 24 hours have passed since the last send to the same address', () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    const invite = {
      lastSentAt: Timestamp.fromMillis(twentyFiveHoursAgo),
      lastSentTo: email,
    };
    expect(shouldThrottleInvite(invite, email, Date.now())).toBe(false);
  });

  it('still throttles when only the casing differs between lastSentTo and email', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const invite = {
      lastSentAt: Timestamp.fromMillis(oneHourAgo),
      lastSentTo: 'Alex@Example.com',
    };
    expect(shouldThrottleInvite(invite, 'alex@example.com', Date.now())).toBe(
      true
    );
  });
});

describe('sendGroupInvite: the invitee address', () => {
  const db = getFirestore();

  /** A group whose admin calls, plus an unregistered active invitee. */
  async function seedInvite(inviteeEmail: string) {
    const adminUid = `u-${randomUUID()}`;
    const groupRef = db.collection('groups').doc(`g-${randomUUID()}`);
    await groupRef.set({ name: 'Invite Trip' });
    await groupRef.collection('members').doc().set({
      displayName: 'Admin',
      userRef: db.collection('users').doc(adminUid),
      groupAdmin: true,
      active: true,
    });
    const inviteeRef = groupRef.collection('members').doc();
    await inviteeRef.set({
      displayName: 'Invitee',
      email: inviteeEmail,
      userRef: null,
      groupAdmin: false,
      active: true,
    });
    return { adminUid, groupRef, inviteeRef };
  }

  function invite(uid: string, groupId: string, memberId: string) {
    return Promise.resolve(
      sendGroupInvite.run({
        auth: { uid, token: {} },
        data: { groupId, memberId },
      } as any)
    );
  }

  async function mailTo(to: string): Promise<number> {
    return (await db.collection('mail').where('to', '==', to).get()).size;
  }

  it('sends to one valid address', async () => {
    const email = `invitee-${randomUUID()}@invite.test`;
    const { adminUid, groupRef, inviteeRef } = await seedInvite(email);

    await expect(invite(adminUid, groupRef.id, inviteeRef.id)).resolves.toMatchObject(
      { success: true, sentTo: email }
    );
    expect(await mailTo(email)).toBe(1);
  });

  // `a@x.com,b` and `a@x.com<b>` passed the old INVITE_EMAIL_PATTERN.
  it.each([
    ['a comma after the domain', (a: string) => `${a},b`],
    ['a comma list', (a: string) => `${a},other@invite.test`],
    ['angle brackets', (a: string) => `${a}<b>`],
    ['no dot in the domain', () => `invitee-${randomUUID()}@invite`],
    // Not trimmed, consistent with the payment/settle and group emails.
    ['surrounding spaces', (a: string) => ` ${a} `],
  ])('refuses %s and sends nothing', async (_label, build) => {
    const valid = `invitee-${randomUUID()}@invite.test`;
    const stored = build(valid);
    const { adminUid, groupRef, inviteeRef } = await seedInvite(stored);

    await expect(invite(adminUid, groupRef.id, inviteeRef.id)).rejects.toMatchObject(
      { code: 'failed-precondition' }
    );
    expect(await mailTo(stored)).toBe(0);
    expect(await mailTo(valid)).toBe(0);
    expect((await inviteeRef.get()).data()?.['invite']).toBeUndefined();
  });
});
