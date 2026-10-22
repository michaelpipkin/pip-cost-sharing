import { createHash, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// Importing from index both initialises the Admin SDK and proves the
// callables are exported from the functions entry (so they deploy).
import {
  confirmMemberEmailChange,
  deleteExpiredMemberEmailChanges,
  requestMemberEmailChange,
} from './index';
import {
  CONFIRM_LINK_INVALID,
  CONFIRM_MEMBER_UNLINKED,
  CONFIRM_WRONG_ACCOUNT,
  DUPLICATE_MEMBER_EMAIL,
  EMAIL_CHANGE_LIMIT,
  MEMBER_EMAIL_LIMITS,
  MEMBER_EMAIL_TOKENS,
  NOT_ACTIVE_MEMBER,
  VERIFY_LOGIN_EMAIL,
} from './member-email';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

const db = getFirestore();

// The mail collection is shared with other spec files: every address here is
// unique to its test, and mail is only ever found by `to`.
function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@member-email.test`;
}

type Callable = { run: (request: any) => unknown };

function call(fn: Callable, uid: string | null, data: unknown): Promise<any> {
  return Promise.resolve(
    fn.run({ auth: uid ? { uid, token: {} } : undefined, data } as any)
  );
}

interface Seeded {
  uid: string;
  loginEmail: string;
  groupRef: DocumentReference;
  memberRef: DocumentReference;
  memberEmail: string;
}

/**
 * A user (Auth account + users doc) linked to a member of a fresh group.
 * The group name, display name and member email are distinctive so a test
 * can prove none of them reaches the confirmation mail.
 */
async function seedLinkedMember(
  options: { emailVerified?: boolean; auth?: boolean } = {}
): Promise<Seeded> {
  const uid = uniqueId('u');
  const loginEmail = uniqueEmail('login');
  if (options.auth !== false) {
    await getAuth().createUser({
      uid,
      email: loginEmail,
      emailVerified: options.emailVerified ?? true,
    });
  }
  const userRef = db.collection('users').doc(uid);
  await userRef.set({ email: loginEmail, emailLower: loginEmail });
  const groupRef = await makeGroup({ name: `Group ${randomUUID()}` });
  const memberEmail = uniqueEmail('member');
  const memberRef = await makeMember(groupRef, {
    displayName: `Name ${randomUUID()}`,
    email: memberEmail,
    emailLower: memberEmail,
    userRef,
  });
  return { uid, loginEmail, groupRef, memberRef, memberEmail };
}

function request(s: Seeded, email: string): Promise<any> {
  return call(requestMemberEmailChange, s.uid, {
    groupId: s.groupRef.id,
    memberId: s.memberRef.id,
    email,
  });
}

async function mailTo(to: string): Promise<DocumentData[]> {
  const snap = await db.collection('mail').where('to', '==', to).get();
  return snap.docs.map((d) => d.data());
}

/** The token in the one confirmation mail sent to `to`. */
async function mailedToken(to: string): Promise<string> {
  const mails = await mailTo(to);
  expect(mails).toHaveLength(1);
  const match = /\/auth\/confirm-group-email\?token=([^\s"&<]+)/.exec(
    mails[0]!['message']['text']
  );
  expect(match).not.toBeNull();
  return decodeURIComponent(match![1]!);
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function memberEmail(ref: DocumentReference) {
  const data = (await ref.get()).data()!;
  return { email: data['email'], emailLower: data['emailLower'] };
}

describe('requestMemberEmailChange', () => {
  it('rejects a signed-out caller', async () => {
    const s = await seedLinkedMember();
    await expect(
      call(requestMemberEmailChange, null, {
        groupId: s.groupRef.id,
        memberId: s.memberRef.id,
        email: uniqueEmail('new'),
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects anything but one valid address', async () => {
    const s = await seedLinkedMember();
    for (const email of [
      '',
      'not-an-email',
      `${uniqueEmail('a')},${uniqueEmail('b')}`,
      [uniqueEmail('a')],
      undefined,
    ]) {
      await expect(request(s, email as string)).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
    expect(await memberEmail(s.memberRef)).toMatchObject({
      email: s.memberEmail,
    });
  });

  it('refuses a member doc that is not linked to the caller', async () => {
    const s = await seedLinkedMember();
    const other = await seedLinkedMember();
    const unlinkedRef = await makeMember(s.groupRef, {
      email: uniqueEmail('unlinked'),
    });
    const newEmail = uniqueEmail('new');
    for (const memberId of [
      other.memberRef.id,
      unlinkedRef.id,
      uniqueId('missing'),
    ]) {
      await expect(
        call(requestMemberEmailChange, s.uid, {
          groupId: s.groupRef.id,
          memberId,
          email: newEmail,
        })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
    // Another user's member, named under its own group.
    await expect(
      call(requestMemberEmailChange, s.uid, {
        groupId: other.groupRef.id,
        memberId: other.memberRef.id,
        email: newEmail,
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await mailTo(newEmail)).toHaveLength(0);
  });

  it('returns unchanged for the current address in any casing', async () => {
    const s = await seedLinkedMember();
    await expect(request(s, s.memberEmail.toUpperCase())).resolves.toEqual({
      status: 'unchanged',
    });
    expect(await mailTo(s.memberEmail.toUpperCase())).toHaveLength(0);
  });

  it('applies the verified sign-in address at once, with no mail', async () => {
    const s = await seedLinkedMember();
    await expect(request(s, s.loginEmail.toUpperCase())).resolves.toEqual({
      status: 'updated',
    });
    expect(await memberEmail(s.memberRef)).toEqual({
      email: s.loginEmail.toUpperCase(),
      emailLower: s.loginEmail,
    });
    expect(await mailTo(s.loginEmail.toUpperCase())).toHaveLength(0);
  });

  // Fix round 1, I1: uids are free, so an unverified account must not be
  // able to mail anyone (the per-uid limit would not bound it).
  it('refuses a caller whose login email is not verified, mailing nothing', async () => {
    const unverified = await seedLinkedMember({ emailVerified: false });
    const noAuth = await seedLinkedMember({ auth: false });
    for (const s of [unverified, noAuth]) {
      const newEmail = uniqueEmail('new');
      await expect(request(s, newEmail)).rejects.toMatchObject({
        code: 'permission-denied',
        message: VERIFY_LOGIN_EMAIL,
      });
      expect(await mailTo(newEmail)).toHaveLength(0);
    }
    await expect(
      request(unverified, unverified.loginEmail)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await mailTo(unverified.loginEmail)).toHaveLength(0);
    expect(await memberEmail(unverified.memberRef)).toMatchObject({
      email: unverified.memberEmail,
    });
  });

  // M2: someone who left the group can't use it (nor probe its addresses).
  it('refuses a member who is no longer active in the group', async () => {
    const s = await seedLinkedMember();
    await s.memberRef.update({ active: false, leftGroup: true });
    const newEmail = uniqueEmail('new');
    await expect(request(s, newEmail)).rejects.toMatchObject({
      code: 'permission-denied',
      message: NOT_ACTIVE_MEMBER,
    });
    expect(await mailTo(newEmail)).toHaveLength(0);
  });

  it('mails a one-time link to the new address and changes nothing yet', async () => {
    const s = await seedLinkedMember();
    const newEmail = uniqueEmail('new');

    await expect(request(s, newEmail)).resolves.toEqual({ status: 'pending' });

    expect(await memberEmail(s.memberRef)).toEqual({
      email: s.memberEmail,
      emailLower: s.memberEmail,
    });
    const token = await mailedToken(newEmail);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    const tokenSnap = await db
      .collection(MEMBER_EMAIL_TOKENS)
      .doc(sha256(token))
      .get();
    expect(tokenSnap.exists).toBe(true);
    const stored = tokenSnap.data()!;
    expect(stored).toMatchObject({
      uid: s.uid,
      email: newEmail,
      emailLower: newEmail.toLowerCase(),
    });
    expect((stored['memberRef'] as DocumentReference).path).toBe(
      s.memberRef.path
    );
    const ttl =
      (stored['expiresAt'] as Timestamp).toMillis() -
      (stored['createdAt'] as Timestamp).toMillis();
    expect(ttl).toBe(24 * 60 * 60 * 1000);
    // The token itself is never stored.
    expect(JSON.stringify(stored)).not.toContain(token);

    // R18: no user-controlled text in the mail but the recipient's address.
    const [mail] = await mailTo(newEmail);
    const message = mail!['message'];
    expect(message.subject).toBe('Confirm your email address for PipSplit');
    expect(message.text).toContain(
      'Someone asked to use this address for a group on PipSplit. If that was you, confirm it here:'
    );
    expect(message.text).toContain(
      'If not, ignore this email; nothing will change.'
    );
    expect(message.text).toContain(
      `https://pipsplit.com/auth/confirm-group-email?token=${token}`
    );
    const group = (await s.groupRef.get()).data()!;
    const member = (await s.memberRef.get()).data()!;
    for (const part of [message.subject, message.text, message.html]) {
      expect(part).not.toContain(group['name']);
      expect(part).not.toContain(member['displayName']);
      expect(part).not.toContain(s.memberEmail);
      expect(part).not.toContain(s.loginEmail);
    }
  });

  it('replaces the member’s earlier pending link', async () => {
    const s = await seedLinkedMember();
    const first = uniqueEmail('first');
    const second = uniqueEmail('second');
    await request(s, first);
    const firstToken = await mailedToken(first);
    await request(s, second);
    const secondToken = await mailedToken(second);

    const tokens = db.collection(MEMBER_EMAIL_TOKENS);
    expect((await tokens.doc(sha256(firstToken)).get()).exists).toBe(false);
    expect((await tokens.doc(sha256(secondToken)).get()).exists).toBe(true);
    await expect(
      call(confirmMemberEmailChange, s.uid, { token: firstToken })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_LINK_INVALID,
    });
  });

  it(`allows ${EMAIL_CHANGE_LIMIT} mailed requests per day, then refuses`, async () => {
    const s = await seedLinkedMember();
    for (let i = 0; i < EMAIL_CHANGE_LIMIT; i++) {
      await expect(request(s, uniqueEmail(`limit-${i}`))).resolves.toEqual({
        status: 'pending',
      });
    }
    const over = uniqueEmail('over');
    await expect(request(s, over)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(await mailTo(over)).toHaveLength(0);
    // Requests that mail nothing are not counted or refused.
    await expect(request(s, s.loginEmail)).resolves.toEqual({
      status: 'updated',
    });

    // A window that ended starts a new one.
    await db
      .collection(MEMBER_EMAIL_LIMITS)
      .doc(s.uid)
      .update({
        windowStart: Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
      });
    await expect(request(s, uniqueEmail('next-day'))).resolves.toEqual({
      status: 'pending',
    });
  });

  it('refuses an address another member of the group already has', async () => {
    const s = await seedLinkedMember();
    const taken = uniqueEmail('taken');
    await makeMember(s.groupRef, { email: taken, emailLower: taken });
    await expect(request(s, taken.toUpperCase())).rejects.toMatchObject({
      code: 'already-exists',
      message: DUPLICATE_MEMBER_EMAIL,
    });
    expect(await mailTo(taken.toUpperCase())).toHaveLength(0);
  });

  // M2: the duplicate check runs after the allowance, so probing for
  // addresses costs requests like any other attempt.
  it('counts a refused duplicate against the daily limit', async () => {
    const s = await seedLinkedMember();
    const taken = uniqueEmail('taken');
    await makeMember(s.groupRef, { email: taken, emailLower: taken });
    for (let i = 0; i < EMAIL_CHANGE_LIMIT; i++) {
      await expect(request(s, taken)).rejects.toMatchObject({
        code: 'already-exists',
      });
    }
    await expect(request(s, taken)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });

  // M1: an address applied at once cancels any link still pending.
  it('cancels an earlier pending link when the verified address is applied', async () => {
    const s = await seedLinkedMember();
    const first = uniqueEmail('first');
    await request(s, first);
    const firstToken = await mailedToken(first);

    await expect(request(s, s.loginEmail)).resolves.toEqual({
      status: 'updated',
    });

    expect(
      (await db.collection(MEMBER_EMAIL_TOKENS).doc(sha256(firstToken)).get())
        .exists
    ).toBe(false);
    await expect(
      call(confirmMemberEmailChange, s.uid, { token: firstToken })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_LINK_INVALID,
    });
    expect(await memberEmail(s.memberRef)).toMatchObject({
      email: s.loginEmail,
    });
  });
});

describe('confirmMemberEmailChange', () => {
  async function pending(): Promise<Seeded & { newEmail: string; token: string }> {
    const s = await seedLinkedMember();
    const newEmail = uniqueEmail('New');
    await request(s, newEmail);
    return { ...s, newEmail, token: await mailedToken(newEmail) };
  }

  it('rejects a signed-out caller', async () => {
    const p = await pending();
    await expect(
      call(confirmMemberEmailChange, null, { token: p.token })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('applies the address once and deletes the token', async () => {
    const p = await pending();

    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).resolves.toEqual({ groupId: p.groupRef.id, email: p.newEmail });
    expect(await memberEmail(p.memberRef)).toEqual({
      email: p.newEmail,
      emailLower: p.newEmail.toLowerCase(),
    });
    expect(
      (await db.collection(MEMBER_EMAIL_TOKENS).doc(sha256(p.token)).get())
        .exists
    ).toBe(false);

    // Single use.
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_LINK_INVALID,
    });
  });

  it('refuses an unknown or malformed token', async () => {
    const s = await seedLinkedMember();
    for (const token of ['', randomUUID(), 42, undefined]) {
      await expect(
        call(confirmMemberEmailChange, s.uid, { token })
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        message: CONFIRM_LINK_INVALID,
      });
    }
  });

  it('refuses an expired token, changing nothing', async () => {
    const p = await pending();
    await db
      .collection(MEMBER_EMAIL_TOKENS)
      .doc(sha256(p.token))
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_LINK_INVALID,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
  });

  it('refuses another account, keeping the link for the right one', async () => {
    const p = await pending();
    const other = await seedLinkedMember();
    await expect(
      call(confirmMemberEmailChange, other.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: CONFIRM_WRONG_ACCOUNT,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).resolves.toMatchObject({ email: p.newEmail });
  });

  it('refuses a caller whose login email is no longer verified', async () => {
    const p = await pending();
    await getAuth().updateUser(p.uid, { emailVerified: false });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: VERIFY_LOGIN_EMAIL,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
  });

  it('refuses when the member left the group meanwhile', async () => {
    const p = await pending();
    await p.memberRef.update({ active: false, leftGroup: true });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: NOT_ACTIVE_MEMBER,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
  });

  it('refuses when the member was unlinked meanwhile', async () => {
    const p = await pending();
    await p.memberRef.update({ userRef: null });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_MEMBER_UNLINKED,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
  });

  it('refuses when another member took the address meanwhile', async () => {
    const p = await pending();
    const lower = p.newEmail.toLowerCase();
    await makeMember(p.groupRef, { email: lower, emailLower: lower });
    await expect(
      call(confirmMemberEmailChange, p.uid, { token: p.token })
    ).rejects.toMatchObject({
      code: 'already-exists',
      message: DUPLICATE_MEMBER_EMAIL,
    });
    expect(await memberEmail(p.memberRef)).toMatchObject({
      email: p.memberEmail,
    });
  });
});

describe('deleteExpiredMemberEmailChanges', () => {
  it('deletes expired tokens and ended rate-limit windows only', async () => {
    const nowMs = Date.now();
    const tokens = db.collection(MEMBER_EMAIL_TOKENS);
    const limits = db.collection(MEMBER_EMAIL_LIMITS);
    const expired = tokens.doc(uniqueId('expired'));
    const live = tokens.doc(uniqueId('live'));
    const oldWindow = limits.doc(uniqueId('u-old'));
    const currentWindow = limits.doc(uniqueId('u-current'));
    await expired.set({ expiresAt: Timestamp.fromMillis(nowMs - 1000) });
    await live.set({ expiresAt: Timestamp.fromMillis(nowMs + 60_000) });
    await oldWindow.set({
      windowStart: Timestamp.fromMillis(nowMs - 25 * 60 * 60 * 1000),
      count: 5,
    });
    await currentWindow.set({
      windowStart: Timestamp.fromMillis(nowMs - 60_000),
      count: 5,
    });

    const deleted = await deleteExpiredMemberEmailChanges(nowMs);

    // Other tests' docs may be deleted too; only this test's are asserted.
    expect(deleted.tokens).toBeGreaterThanOrEqual(1);
    expect(deleted.limits).toBeGreaterThanOrEqual(1);
    expect((await expired.get()).exists).toBe(false);
    expect((await live.get()).exists).toBe(true);
    expect((await oldWindow.get()).exists).toBe(false);
    expect((await currentWindow.get()).exists).toBe(true);
  });
});
