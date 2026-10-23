import { createHash, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
// Importing from index both initialises the Admin SDK and proves the
// callables are exported from the functions entry (so they deploy).
import {
  confirmMemberEmailChange,
  deleteExpiredMemberEmailChanges,
  requestMemberEmailChange,
  updateMemberEmails,
} from './index';
import {
  CONFIRM_LINK_INVALID,
  CONFIRM_MEMBER_UNLINKED,
  CONFIRMATION_RECENTLY_SENT,
  CONFIRM_WRONG_ACCOUNT,
  DUPLICATE_MEMBER_EMAIL,
  EMAIL_CHANGE_LIMIT,
  LOGIN_EMAIL_INVALID,
  MEMBER_EMAIL_LIMITS,
  MEMBER_EMAIL_RECIPIENT_COOLDOWNS,
  MEMBER_EMAILS_PER_TXN,
  RECIPIENT_COOLDOWN_MS,
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

  describe('per-recipient cooldown', () => {
    const cooldownDoc = (address: string) =>
      db
        .collection(MEMBER_EMAIL_RECIPIENT_COOLDOWNS)
        .doc(sha256(address.toLowerCase()));
    const COOLDOWN_REFUSAL = {
      code: 'resource-exhausted',
      message: CONFIRMATION_RECENTLY_SENT,
    };

    it('is one confirmation mail per address per hour', () => {
      expect(RECIPIENT_COOLDOWN_MS).toBe(60 * 60 * 1000);
    });

    it('refuses a second confirmation to the same address from another caller', async () => {
      const first = await seedLinkedMember();
      const second = await seedLinkedMember();
      const target = uniqueEmail('target');

      await expect(request(first, target)).resolves.toEqual({
        status: 'pending',
      });
      // Another account, another group, the address in another casing.
      await expect(
        request(second, target.toUpperCase())
      ).rejects.toMatchObject(COOLDOWN_REFUSAL);
      expect(await mailTo(target)).toHaveLength(1);
      expect(await mailTo(target.toUpperCase())).toHaveLength(0);
      // The same caller again is refused the same way.
      await expect(request(first, target)).rejects.toMatchObject(
        COOLDOWN_REFUSAL
      );
      expect(await mailTo(target)).toHaveLength(1);
    });

    it('does not use up the caller’s daily allowance when it refuses', async () => {
      const first = await seedLinkedMember();
      const second = await seedLinkedMember();
      const target = uniqueEmail('target');
      await request(first, target);

      for (let i = 0; i < EMAIL_CHANGE_LIMIT + 1; i++) {
        await expect(request(second, target)).rejects.toMatchObject(
          COOLDOWN_REFUSAL
        );
      }
      expect(
        (await db.collection(MEMBER_EMAIL_LIMITS).doc(second.uid).get()).exists
      ).toBe(false);
      // All of the second caller's requests are still there to use.
      for (let i = 0; i < EMAIL_CHANGE_LIMIT; i++) {
        await expect(
          request(second, uniqueEmail(`after-${i}`))
        ).resolves.toEqual({ status: 'pending' });
      }
    });

    // Review M2: a caller who loses a race for the address (both passed the
    // first read; the winner's transaction committed first) is refused by
    // the transaction's re-check, and gets the request it was charged back.
    it('refunds the allowance of a caller who loses the race for an address', async () => {
      const s = await seedLinkedMember();
      const target = uniqueEmail('raced');
      const runTransaction = db.runTransaction.bind(db);
      // The first transaction is consumeRequestAllowance: the winner's
      // cooldown lands just before it, after the plain read.
      const spy = vi
        .spyOn(db, 'runTransaction')
        .mockImplementationOnce(async (fn: any, options?: any) => {
          await cooldownDoc(target).set({
            sentAt: Timestamp.now(),
            expiresAt: Timestamp.fromMillis(Date.now() + RECIPIENT_COOLDOWN_MS),
          });
          return runTransaction(fn, options);
        });
      try {
        await expect(request(s, target)).rejects.toMatchObject(
          COOLDOWN_REFUSAL
        );
      } finally {
        spy.mockRestore();
      }
      expect(await mailTo(target)).toHaveLength(0);
      const limit = await db.collection(MEMBER_EMAIL_LIMITS).doc(s.uid).get();
      expect(limit.get('count') ?? 0).toBe(0);
    });

    it('stores only a hash of the lowercased address, with an expiry', async () => {
      const s = await seedLinkedMember();
      const target = uniqueEmail('Target');
      const before = Date.now();
      await request(s, target);

      const snap = await cooldownDoc(target).get();
      expect(snap.exists).toBe(true);
      expect(JSON.stringify(snap.data())).not.toContain(target.toLowerCase());
      expect(JSON.stringify(snap.data())).not.toContain(target);
      const expiresAt = (snap.get('expiresAt') as Timestamp).toMillis();
      expect(expiresAt).toBeGreaterThanOrEqual(before + RECIPIENT_COOLDOWN_MS);
      expect(expiresAt).toBeLessThanOrEqual(
        Date.now() + RECIPIENT_COOLDOWN_MS
      );
    });

    it('allows the address again once the hour has passed', async () => {
      const first = await seedLinkedMember();
      const second = await seedLinkedMember();
      const target = uniqueEmail('target');
      await request(first, target);
      await cooldownDoc(target).update({
        expiresAt: Timestamp.fromMillis(Date.now() - 1000),
      });

      await expect(request(second, target)).resolves.toEqual({
        status: 'pending',
      });
      expect(await mailTo(target)).toHaveLength(2);
    });

    it('leaves no cooldown when nothing was mailed', async () => {
      const s = await seedLinkedMember();
      const taken = uniqueEmail('taken');
      await makeMember(s.groupRef, { email: taken, emailLower: taken });
      await expect(request(s, taken)).rejects.toMatchObject({
        code: 'already-exists',
      });
      await expect(request(s, s.loginEmail)).resolves.toEqual({
        status: 'updated',
      });
      expect((await cooldownDoc(taken).get()).exists).toBe(false);
      expect((await cooldownDoc(s.loginEmail).get()).exists).toBe(false);
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

describe('updateMemberEmails', () => {
  interface Linked {
    uid: string;
    loginEmail: string;
    userRef: DocumentReference;
  }

  /**
   * A verified (by default) Auth account and its users doc, no members.
   * `loginEmail` overrides the Auth address; `profileEmail` gives the users
   * doc a different (stale) one.
   */
  async function seedUser(
    options: {
      emailVerified?: boolean;
      auth?: boolean;
      loginEmail?: string;
      profileEmail?: string;
    } = {}
  ): Promise<Linked> {
    const uid = uniqueId('u');
    const loginEmail = options.loginEmail ?? uniqueEmail('login');
    if (options.auth !== false) {
      await getAuth().createUser({
        uid,
        email: loginEmail,
        emailVerified: options.emailVerified ?? true,
      });
    }
    const userRef = db.collection('users').doc(uid);
    const profileEmail = options.profileEmail ?? loginEmail;
    await userRef.set({
      email: profileEmail,
      emailLower: profileEmail.toLowerCase(),
    });
    return { uid, loginEmail, userRef };
  }

  /** A member of a fresh group (or `group`) linked to `user`, on `email`. */
  async function linkedRow(
    user: Linked,
    email: string,
    fields: DocumentData = {},
    group?: DocumentReference
  ): Promise<DocumentReference> {
    const groupRef = group ?? (await makeGroup({ name: `G ${randomUUID()}` }));
    return makeMember(groupRef, {
      email,
      emailLower: email.toLowerCase(),
      userRef: user.userRef,
      ...fields,
    });
  }

  function update(user: Linked | null, data: unknown = {}): Promise<any> {
    return call(updateMemberEmails, user?.uid ?? null, data);
  }

  /** A pending confirmation link for `memberRef`, as edit-member makes one. */
  async function pendingLink(
    user: Linked,
    memberRef: DocumentReference
  ): Promise<string> {
    const to = uniqueEmail('pending');
    await expect(
      call(requestMemberEmailChange, user.uid, {
        groupId: memberRef.parent.parent!.id,
        memberId: memberRef.id,
        email: to,
      })
    ).resolves.toEqual({ status: 'pending' });
    return mailedToken(to);
  }

  const tokenExists = async (token: string) =>
    (await db.collection(MEMBER_EMAIL_TOKENS).doc(sha256(token)).get()).exists;

  it('rejects a signed-out caller', async () => {
    await expect(update(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a caller whose login email is not verified, writing nothing', async () => {
    const unverified = await seedUser({ emailVerified: false });
    const noAuth = await seedUser({ auth: false });
    for (const user of [unverified, noAuth]) {
      const other = uniqueEmail('other');
      const row = await linkedRow(user, other);
      await expect(update(user)).rejects.toMatchObject({
        code: 'permission-denied',
        message: VERIFY_LOGIN_EMAIL,
      });
      expect(await memberEmail(row)).toEqual({
        email: other,
        emailLower: other,
      });
    }
  });

  it('refuses an onlyFromEmail that is not a string', async () => {
    const user = await seedUser();
    const other = uniqueEmail('other');
    const row = await linkedRow(user, other);
    for (const onlyFromEmail of [42, ['a@b.test'], { a: 1 }, 'x'.repeat(1001)]) {
      await expect(update(user, { onlyFromEmail })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
    expect(await memberEmail(row)).toMatchObject({ email: other });
  });

  it('moves every linked row to the verified login email (all mode)', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const custom = uniqueEmail('custom');
    const rows = [
      await linkedRow(user, old),
      await linkedRow(user, custom),
      await linkedRow(user, ''),
    ];

    await expect(update(user)).resolves.toEqual({ updated: 3, conflicts: 0 });

    for (const row of rows) {
      expect(await memberEmail(row)).toEqual({
        email: user.loginEmail,
        emailLower: user.loginEmail,
      });
    }
    // Nothing left to do the second time.
    await expect(update(user)).resolves.toEqual({ updated: 0, conflicts: 0 });
  });

  it('moves only the rows on onlyFromEmail, ignoring case (old-only mode)', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const custom = uniqueEmail('custom');
    const onOld = await linkedRow(user, old);
    const onOldUpper = await linkedRow(user, old.toUpperCase());
    const onCustom = await linkedRow(user, custom);
    const blank = await linkedRow(user, '');

    await expect(
      update(user, { onlyFromEmail: ` ${old.toUpperCase()} ` })
    ).resolves.toEqual({ updated: 2, conflicts: 0 });

    for (const row of [onOld, onOldUpper]) {
      expect(await memberEmail(row)).toEqual({
        email: user.loginEmail,
        emailLower: user.loginEmail,
      });
    }
    expect(await memberEmail(onCustom)).toEqual({
      email: custom,
      emailLower: custom,
    });
    expect(await memberEmail(blank)).toMatchObject({ email: '' });
  });

  it('skips a row already on the login email in another casing, leaving it as is', async () => {
    const user = await seedUser();
    const upper = user.loginEmail.toUpperCase();
    const row = await linkedRow(user, upper);

    await expect(update(user)).resolves.toEqual({ updated: 0, conflicts: 0 });
    await expect(
      update(user, { onlyFromEmail: upper })
    ).resolves.toEqual({ updated: 0, conflicts: 0 });

    expect(await memberEmail(row)).toEqual({
      email: upper,
      emailLower: user.loginEmail,
    });
  });

  // M2: the duplicate check the callables enforce applies here too.
  it('counts a row whose group already has the address as a conflict and leaves it', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const free = await linkedRow(user, old);
    const crowded = await linkedRow(user, old);
    // Someone else in that group already uses the login address.
    await makeMember(crowded.parent.parent!, {
      email: user.loginEmail.toUpperCase(),
      emailLower: user.loginEmail,
    });

    await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 1 });

    expect(await memberEmail(free)).toMatchObject({ email: user.loginEmail });
    expect(await memberEmail(crowded)).toEqual({ email: old, emailLower: old });
  });

  it('gives the address to only one of two rows linked in the same group', async () => {
    const user = await seedUser();
    const group = await makeGroup();
    const a = await linkedRow(user, uniqueEmail('a'), {}, group);
    const b = await linkedRow(user, uniqueEmail('b'), {}, group);

    await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 1 });

    const emails = [(await memberEmail(a)).email, (await memberEmail(b)).email];
    expect(emails.filter((e) => e === user.loginEmail)).toHaveLength(1);
  });

  // M1: an update cancels the row's pending confirmation link, and only the
  // updated rows'.
  it('deletes the pending links of the rows it updates, and only theirs', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const updatedRow = await linkedRow(user, old);
    const keptRow = await linkedRow(user, uniqueEmail('kept'));
    const conflictRow = await linkedRow(user, old);
    await makeMember(conflictRow.parent.parent!, {
      email: user.loginEmail,
      emailLower: user.loginEmail,
    });
    const updatedToken = await pendingLink(user, updatedRow);
    const keptToken = await pendingLink(user, keptRow);
    const conflictToken = await pendingLink(user, conflictRow);

    await expect(update(user, { onlyFromEmail: old })).resolves.toEqual({
      updated: 1,
      conflicts: 1,
    });

    expect(await tokenExists(updatedToken)).toBe(false);
    expect(await tokenExists(keptToken)).toBe(true);
    expect(await tokenExists(conflictToken)).toBe(true);
  });

  it('makes an old confirmation link fail after the update (M1)', async () => {
    const user = await seedUser();
    const row = await linkedRow(user, uniqueEmail('old'));
    const token = await pendingLink(user, row);

    await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 0 });

    await expect(
      call(confirmMemberEmailChange, user.uid, { token })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CONFIRM_LINK_INVALID,
    });
    expect(await memberEmail(row)).toEqual({
      email: user.loginEmail,
      emailLower: user.loginEmail,
    });
  });

  it('leaves rows linked to another user, and unlinked rows, untouched', async () => {
    const user = await seedUser();
    const other = await seedUser();
    const old = uniqueEmail('old');
    const group = await makeGroup();
    const own = await linkedRow(user, old, {}, group);
    const othersRow = await linkedRow(other, old);
    const unlinked = await makeMember(await makeGroup(), {
      email: old,
      emailLower: old,
    });

    await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 0 });

    expect(await memberEmail(own)).toMatchObject({ email: user.loginEmail });
    expect(await memberEmail(othersRow)).toEqual({ email: old, emailLower: old });
    expect(await memberEmail(unlinked)).toEqual({ email: old, emailLower: old });
  });

  // Ruling (T1): the scope is the client's former #linkedMembersQuery, which
  // has no active filter, so inactive and left memberships move too.
  it('includes inactive and left memberships', async () => {
    const user = await seedUser();
    const deactivated = await linkedRow(user, uniqueEmail('d'), {
      active: false,
    });
    const left = await linkedRow(user, uniqueEmail('l'), {
      active: false,
      leftGroup: true,
    });

    await expect(update(user)).resolves.toEqual({ updated: 2, conflicts: 0 });

    for (const row of [deactivated, left]) {
      expect(await memberEmail(row)).toMatchObject({ email: user.loginEmail });
    }
  });

  it('returns zeros for a user with no memberships', async () => {
    const user = await seedUser();
    await expect(update(user)).resolves.toEqual({ updated: 0, conflicts: 0 });
  });

  // A legacy Auth address that fails the single-address rule: no member doc
  // may hold it, and retrying can't help.
  it('refuses a verified login email that is not one valid address, writing nothing', async () => {
    const loginEmail = `login-${randomUUID()}@member_email.test`;
    const user = await seedUser({ loginEmail });
    const other = uniqueEmail('other');
    const row = await linkedRow(user, other);

    await expect(update(user)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: LOGIN_EMAIL_INVALID,
    });

    expect(await memberEmail(row)).toEqual({ email: other, emailLower: other });
  });

  // Fix round 1, Minor 4a: the address is the Auth account's, never the
  // users doc's (which can lag a login-email change).
  it('writes the Auth account’s address even when the users doc is stale', async () => {
    const stale = uniqueEmail('stale-profile');
    const user = await seedUser({ profileEmail: stale });
    const row = await linkedRow(user, uniqueEmail('old'));

    await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 0 });

    expect(await memberEmail(row)).toEqual({
      email: user.loginEmail,
      emailLower: user.loginEmail,
    });
  });

  // Minor 4b: a row unlinked after the query but before the transaction is
  // re-checked inside it and left alone.
  it('skips a row that was unlinked between the query and the transaction', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const kept = await linkedRow(user, old);
    const unlinked = await linkedRow(user, old);
    const runTransaction = db.runTransaction.bind(db);
    const spy = vi
      .spyOn(db, 'runTransaction')
      .mockImplementationOnce(async (fn: any, options?: any) => {
        await unlinked.update({ userRef: null });
        return runTransaction(fn, options);
      });
    try {
      await expect(update(user)).resolves.toEqual({ updated: 1, conflicts: 0 });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    expect(await memberEmail(kept)).toMatchObject({ email: user.loginEmail });
    expect(await memberEmail(unlinked)).toEqual({ email: old, emailLower: old });
  });

  // Minor 4c: more rows than one transaction takes are split across
  // transactions, and every row is still written.
  it('updates more memberships than one transaction holds, in several transactions', async () => {
    const user = await seedUser();
    const old = uniqueEmail('old');
    const count = MEMBER_EMAILS_PER_TXN + 1;
    const rows: DocumentReference[] = [];
    const batch = db.batch();
    for (let i = 0; i < count; i++) {
      const group = db.collection('groups').doc(uniqueId('g-chunk'));
      batch.set(group, { name: `Chunk ${i}` });
      const row = group.collection('members').doc(uniqueId('m'));
      batch.set(row, {
        displayName: 'Member',
        active: true,
        groupAdmin: false,
        email: old,
        emailLower: old,
        userRef: user.userRef,
      });
      rows.push(row);
    }
    await batch.commit();
    const spy = vi.spyOn(db, 'runTransaction');
    try {
      await expect(update(user)).resolves.toEqual({
        updated: count,
        conflicts: 0,
      });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }

    const emails = await Promise.all(
      rows.map(async (row) => (await memberEmail(row)).email)
    );
    expect(new Set(emails)).toEqual(new Set([user.loginEmail]));
  });
});

describe('deleteExpiredMemberEmailChanges', () => {
  it('deletes expired tokens, ended rate-limit windows and cooldowns only', async () => {
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
    const cooldowns = db.collection(MEMBER_EMAIL_RECIPIENT_COOLDOWNS);
    const endedCooldown = cooldowns.doc(sha256(uniqueId('ended')));
    const liveCooldown = cooldowns.doc(sha256(uniqueId('live')));
    await endedCooldown.set({ expiresAt: Timestamp.fromMillis(nowMs - 1000) });
    await liveCooldown.set({ expiresAt: Timestamp.fromMillis(nowMs + 60_000) });

    const deleted = await deleteExpiredMemberEmailChanges(nowMs);

    // Other tests' docs may be deleted too; only this test's are asserted.
    expect(deleted.tokens).toBeGreaterThanOrEqual(1);
    expect(deleted.limits).toBeGreaterThanOrEqual(1);
    expect((await expired.get()).exists).toBe(false);
    expect((await live.get()).exists).toBe(true);
    expect((await oldWindow.get()).exists).toBe(false);
    expect((await currentWindow.get()).exists).toBe(true);
    expect(deleted.cooldowns).toBeGreaterThanOrEqual(1);
    expect((await endedCooldown.get()).exists).toBe(false);
    expect((await liveCooldown.get()).exists).toBe(true);
  });
});
