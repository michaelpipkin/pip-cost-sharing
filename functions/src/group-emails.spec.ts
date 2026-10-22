import { randomUUID } from 'node:crypto';
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts calls initializeApp() at module scope and re-exports the
// group-email callables, so importing from it both initialises the Admin SDK
// and proves the callables are deployed (exported from the functions entry).
import {
  sendPaymentRequests,
  sendPaymentReversalEmails,
  sendSettleReversalEmails,
} from './index';

const db = getFirestore();

// The mail collection is global and other spec files write to it: every
// recipient below is unique to its test, and mail is only ever found by `to`.
function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@group-emails.test`;
}

interface SeededUser {
  uid: string;
  ref: DocumentReference;
  email: string;
}

async function seedUser(fields: DocumentData = {}): Promise<SeededUser> {
  const uid = `u-${randomUUID()}`;
  const email = uniqueEmail('user');
  const ref = db.collection('users').doc(uid);
  await ref.set({ email, emailOptOut: false, ...fields });
  return { uid, ref, email };
}

async function seedGroup(
  fields: DocumentData = {}
): Promise<DocumentReference> {
  const ref = db.collection('groups').doc(`g-${randomUUID()}`);
  await ref.set({
    name: 'Beach Trip',
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
    ...fields,
  });
  return ref;
}

interface MemberInput {
  displayName: string;
  /** A linked app user; omitted for a placeholder (unregistered) member. */
  user?: SeededUser;
  /** Defaults to the user's email, or '' for a placeholder. */
  email?: string;
  active?: boolean;
  groupAdmin?: boolean;
}

async function seedMember(
  groupRef: DocumentReference,
  input: MemberInput
): Promise<DocumentReference> {
  const ref = groupRef.collection('members').doc(`m-${randomUUID()}`);
  await ref.set({
    displayName: input.displayName,
    email: input.email ?? input.user?.email ?? '',
    userRef: input.user?.ref ?? null,
    active: input.active ?? true,
    groupAdmin: input.groupAdmin ?? false,
  });
  return ref;
}

/** A group whose caller is an active member (an admin unless told otherwise). */
async function seedCallerGroup(
  options: { groupFields?: DocumentData; callerAdmin?: boolean } = {}
): Promise<{ groupRef: DocumentReference; caller: SeededUser }> {
  const groupRef = await seedGroup(options.groupFields);
  const caller = await seedUser();
  await seedMember(groupRef, {
    displayName: 'Caller',
    user: caller,
    groupAdmin: options.callerAdmin ?? true,
  });
  return { groupRef, caller };
}

/**
 * Stored member emails that are not exactly one valid address. Each is built
 * from fresh unique addresses (returned in `parts`) so a test can check that
 * none of them got mail.
 */
function badAddresses(): { label: string; email: unknown; parts: string[] }[] {
  const fresh = () => uniqueEmail('list');
  const [a1, b1, a2, b2, a3, b3, a4, a5] = Array.from({ length: 8 }, fresh) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return [
    { label: 'a comma list', email: `${a1},${b1}`, parts: [a1, b1] },
    { label: 'a semicolon list', email: `${a2}; ${b2}`, parts: [a2, b2] },
    { label: 'an array', email: [a3, b3], parts: [a3, b3] },
    { label: 'an inner space', email: a4.replace('@', ' @'), parts: [a4] },
    { label: 'a comma after the domain', email: `${a5},x`, parts: [a5] },
    { label: 'no @', email: 'not-an-email', parts: [] },
  ];
}

async function expectNoMailToAny(addresses: unknown[]): Promise<void> {
  for (const address of addresses) {
    if (typeof address !== 'string') continue;
    expect(await mailTo(address)).toHaveLength(0);
  }
}

// `any`: each callable's run() takes its own CallableRequest<T>.
type Callable = { run: (request: any) => unknown };

function call(fn: Callable, uid: string | null, data: unknown): Promise<any> {
  return Promise.resolve(
    fn.run({ auth: uid ? { uid, token: {} } : undefined, data } as any)
  );
}

async function expectCode(
  promise: Promise<unknown>,
  code: string
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

async function mailTo(to: string): Promise<MailMessage[]> {
  const snap = await db.collection('mail').where('to', '==', to).get();
  return snap.docs.map((d) => d.data()['message'] as MailMessage);
}

/** Exactly one mail went to `to`; returns it. */
async function onlyMailTo(to: string): Promise<MailMessage> {
  const mails = await mailTo(to);
  expect(mails).toHaveLength(1);
  return mails[0]!;
}

// ---------------------------------------------------------------------------
// sendPaymentRequests
// ---------------------------------------------------------------------------

describe('sendPaymentRequests', () => {
  /** Caller (Owen, the payee, with Venmo + Zelle) and Pat, who owes him. */
  async function seedRequestGroup(groupFields: DocumentData = {}) {
    const groupRef = await seedGroup(groupFields);
    const owen = await seedUser({ venmoId: '@owen-v', zelleId: 'owen@zelle' });
    const pat = await seedUser();
    const owenRef = await seedMember(groupRef, {
      displayName: 'Owen',
      user: owen,
    });
    const patRef = await seedMember(groupRef, {
      displayName: 'Pat',
      user: pat,
    });
    return { groupRef, owen, pat, owenRef, patRef };
  }

  it('rejects an unauthenticated caller', async () => {
    const { groupRef, owenRef, patRef } = await seedRequestGroup();
    await expectCode(
      call(sendPaymentRequests, null, {
        groupId: groupRef.id,
        requests: [
          { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
        ],
      }),
      'unauthenticated'
    );
  });

  const valid = { owedByMemberId: 'a', owedToMemberId: 'b', amount: 5 };
  it.each([
    ['no data', undefined],
    ['a missing groupId', { requests: [valid] }],
    ['a blank groupId', { groupId: '', requests: [valid] }],
    ['a groupId with a slash', { groupId: 'a/b', requests: [valid] }],
    ['a reserved groupId (..)', { groupId: '..', requests: [valid] }],
    [
      'a reserved member id (__x__)',
      { groupId: 'g', requests: [{ ...valid, owedByMemberId: '__x__' }] },
    ],
    [
      'a reserved member id (.)',
      { groupId: 'g', requests: [{ ...valid, owedToMemberId: '.' }] },
    ],
    ['requests that are not an array', { groupId: 'g', requests: valid }],
    ['no requests', { groupId: 'g', requests: [] }],
    [
      'more than 100 requests',
      { groupId: 'g', requests: Array.from({ length: 101 }, () => valid) },
    ],
    ['a request that is not an object', { groupId: 'g', requests: ['x'] }],
    [
      'a missing owedByMemberId',
      { groupId: 'g', requests: [{ ...valid, owedByMemberId: undefined }] },
    ],
    [
      'a missing owedToMemberId',
      { groupId: 'g', requests: [{ ...valid, owedToMemberId: '' }] },
    ],
    ['a zero amount', { groupId: 'g', requests: [{ ...valid, amount: 0 }] }],
    [
      'a negative amount',
      { groupId: 'g', requests: [{ ...valid, amount: -1 }] },
    ],
    [
      'a string amount',
      { groupId: 'g', requests: [{ ...valid, amount: '5' }] },
    ],
    [
      'an infinite amount',
      { groupId: 'g', requests: [{ ...valid, amount: Infinity }] },
    ],
    ['a NaN amount', { groupId: 'g', requests: [{ ...valid, amount: NaN }] }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    const caller = await seedUser();
    await expectCode(
      call(sendPaymentRequests, caller.uid, data),
      'invalid-argument'
    );
  });

  it('rejects a caller who is not a member of the group', async () => {
    const { groupRef, owenRef, patRef } = await seedRequestGroup();
    const outsider = await seedUser();
    await expectCode(
      call(sendPaymentRequests, outsider.uid, {
        groupId: groupRef.id,
        requests: [
          { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
        ],
      }),
      'permission-denied'
    );
    expect(await mailTo((await patRef.get()).data()!['email'])).toHaveLength(0);
  });

  it('rejects a caller whose membership is inactive', async () => {
    const { groupRef, owenRef, patRef, pat } = await seedRequestGroup();
    const former = await seedUser();
    await seedMember(groupRef, {
      displayName: 'Former',
      user: former,
      active: false,
    });
    await expectCode(
      call(sendPaymentRequests, former.uid, {
        groupId: groupRef.id,
        requests: [
          { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
        ],
      }),
      'permission-denied'
    );
    expect(await mailTo(pat.email)).toHaveLength(0);
  });

  it('rejects a member id that is not in the group, sending nothing', async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup();
    await expectCode(
      call(sendPaymentRequests, owen.uid, {
        groupId: groupRef.id,
        requests: [
          { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
          {
            owedByMemberId: 'm-missing',
            owedToMemberId: owenRef.id,
            amount: 5,
          },
        ],
      }),
      'not-found'
    );
    expect(await mailTo(pat.email)).toHaveLength(0);
  });

  it('rejects a member of a different group', async () => {
    const { groupRef, owen, owenRef } = await seedRequestGroup();
    const otherGroup = await seedGroup();
    const stranger = await seedUser();
    const strangerRef = await seedMember(otherGroup, {
      displayName: 'Stranger',
      user: stranger,
    });
    await expectCode(
      call(sendPaymentRequests, owen.uid, {
        groupId: groupRef.id,
        requests: [
          {
            owedByMemberId: strangerRef.id,
            owedToMemberId: owenRef.id,
            amount: 5,
          },
        ],
      }),
      'not-found'
    );
    expect(await mailTo(stranger.email)).toHaveLength(0);
  });

  it("emails the owing member's stored address with the payee's payment methods", async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup();

    const result = await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: [
        {
          owedByMemberId: patRef.id,
          owedToMemberId: owenRef.id,
          amount: 1234.5,
        },
      ],
    });

    expect(result).toEqual({ results: ['sent'] });
    const mail = await onlyMailTo(pat.email);
    expect(mail.subject).toBe(
      'Payment request from Owen for group "Beach Trip" in PipSplit'
    );
    expect(mail.text).toBe(
      [
        'Hi Pat,',
        '',
        'Owen is requesting payment of $1,234.50 in the "Beach Trip" group via PipSplit.',
        '',
        'Please log in to PipSplit to mark this balance as paid, or send the payment directly to Owen using one of the following:',
        'Venmo: @owen-v\nZelle: owen@zelle',
      ].join('\n')
    );
    expect(mail.html).toContain(
      '<h2 style="color:#105208;margin:0 0 20px 0;">Payment Request</h2>'
    );
    expect(mail.html).toContain('>$1,234.50</span>');
    expect(mail.html).toContain('<p style="margin:2px 0;">Venmo: @owen-v</p>');
    expect(mail.html).toContain(
      '<p style="margin:2px 0;">Zelle: owen@zelle</p>'
    );
    expect(mail.html).toContain(
      'You received this email because you are a member of a PipSplit group.'
    );
    // Nothing went to the payee.
    expect(await mailTo(owen.email)).toHaveLength(0);
  });

  it('ignores any recipient, subject or html the caller adds to the request', async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup();
    const attacker = uniqueEmail('attacker');

    await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      to: attacker,
      subject: 'Injected',
      html: '<b>injected</b>',
      requests: [
        {
          owedByMemberId: patRef.id,
          owedToMemberId: owenRef.id,
          amount: 5,
          to: attacker,
          email: attacker,
          subject: 'Injected',
          html: '<b>injected</b>',
        },
      ],
    });

    expect(await mailTo(attacker)).toHaveLength(0);
    const mail = await onlyMailTo(pat.email);
    expect(mail.subject).not.toContain('Injected');
    expect(mail.html).not.toContain('injected');
  });

  it('formats the amount in the group currency, including 0-decimal currencies', async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup({
      currencyCode: 'JPY',
      currencySymbol: '¥',
      decimalPlaces: 0,
    });

    await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: [
        { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 1234 },
      ],
    });

    const mail = await onlyMailTo(pat.email);
    expect(mail.text).toContain('requesting payment of ¥1,234 in');
    expect(mail.html).toContain('>¥1,234</span>');
  });

  it('formats EUR with its own symbol', async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup({
      currencyCode: 'EUR',
      currencySymbol: '€',
      decimalPlaces: 2,
    });

    await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: [
        { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 7.5 },
      ],
    });

    expect((await onlyMailTo(pat.email)).text).toContain('payment of €7.50 in');
  });

  it('says "(No payment methods on file)" when the payee has none or no account', async () => {
    const groupRef = await seedGroup();
    const caller = await seedUser();
    const pat = await seedUser();
    await seedMember(groupRef, { displayName: 'Caller', user: caller });
    const patRef = await seedMember(groupRef, {
      displayName: 'Pat',
      user: pat,
    });
    const placeholderRef = await seedMember(groupRef, { displayName: 'Ivo' });

    await call(sendPaymentRequests, caller.uid, {
      groupId: groupRef.id,
      requests: [
        {
          owedByMemberId: patRef.id,
          owedToMemberId: placeholderRef.id,
          amount: 3,
        },
      ],
    });

    const mail = await onlyMailTo(pat.email);
    expect(
      mail.text.endsWith('one of the following:\n(No payment methods on file)')
    ).toBe(true);
    expect(mail.html).toContain(
      '<p style="color:#5b6058;margin:0;font-style:italic;">(No payment methods on file)</p>'
    );
  });

  it('returns not_registered and opted_out in request order, mailing only the eligible member', async () => {
    const { groupRef, owen, owenRef, patRef, pat } = await seedRequestGroup();
    const placeholderEmail = uniqueEmail('placeholder');
    const placeholderRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      email: placeholderEmail,
    });
    const optedOut = await seedUser({ emailOptOut: true });
    const optedOutRef = await seedMember(groupRef, {
      displayName: 'Quinn',
      user: optedOut,
    });

    const result = await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: [
        {
          owedByMemberId: placeholderRef.id,
          owedToMemberId: owenRef.id,
          amount: 4,
        },
        { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
        {
          owedByMemberId: optedOutRef.id,
          owedToMemberId: owenRef.id,
          amount: 6,
        },
      ],
    });

    expect(result).toEqual({
      results: ['not_registered', 'sent', 'opted_out'],
    });
    expect(await mailTo(placeholderEmail)).toHaveLength(0);
    expect(await mailTo(optedOut.email)).toHaveLength(0);
    expect((await onlyMailTo(pat.email)).text).toContain('payment of $5.00 in');
  });

  it('treats a stored email that is not one valid address as not_registered', async () => {
    const { groupRef, owen, owenRef } = await seedRequestGroup();
    const cases = badAddresses();
    const memberIds: string[] = [];
    for (const c of cases) {
      const user = await seedUser();
      const ref = groupRef.collection('members').doc(`m-${randomUUID()}`);
      await ref.set({
        displayName: c.label,
        email: c.email,
        userRef: user.ref,
        active: true,
        groupAdmin: false,
      });
      memberIds.push(ref.id);
    }

    const result = await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: memberIds.map((id) => ({
        owedByMemberId: id,
        owedToMemberId: owenRef.id,
        amount: 5,
      })),
    });

    expect(result).toEqual({ results: cases.map(() => 'not_registered') });
    await expectNoMailToAny(cases.flatMap((c) => [c.email, ...c.parts]));
  });

  it('treats a linked member with no stored email as not_registered', async () => {
    const { groupRef, owen, owenRef } = await seedRequestGroup();
    const noEmail = await seedUser();
    const noEmailRef = await seedMember(groupRef, {
      displayName: 'Nell',
      user: noEmail,
      email: '',
    });

    const result = await call(sendPaymentRequests, owen.uid, {
      groupId: groupRef.id,
      requests: [
        {
          owedByMemberId: noEmailRef.id,
          owedToMemberId: owenRef.id,
          amount: 5,
        },
      ],
    });

    expect(result).toEqual({ results: ['not_registered'] });
    expect(await mailTo(noEmail.email)).toHaveLength(0);
  });

  it('lets any active member send, not just the payee or an admin (mirrors Summary)', async () => {
    const { groupRef, owenRef, patRef, pat } = await seedRequestGroup();
    const bystander = await seedUser();
    await seedMember(groupRef, {
      displayName: 'Bystander',
      user: bystander,
      groupAdmin: false,
    });

    const result = await call(sendPaymentRequests, bystander.uid, {
      groupId: groupRef.id,
      requests: [
        { owedByMemberId: patRef.id, owedToMemberId: owenRef.id, amount: 5 },
      ],
    });

    expect(result).toEqual({ results: ['sent'] });
    expect(await mailTo(pat.email)).toHaveLength(1);
  });

  it('HTML-escapes member and group names and keeps them raw in the text', async () => {
    const groupRef = await seedGroup({ name: 'Tom & "Jerry"' });
    const caller = await seedUser();
    const victim = await seedUser();
    const callerRef = await seedMember(groupRef, {
      displayName: '<script>alert(1)</script>',
      user: caller,
    });
    const victimRef = await seedMember(groupRef, {
      displayName: '<img src=x onerror=alert(2)>',
      user: victim,
    });

    await call(sendPaymentRequests, caller.uid, {
      groupId: groupRef.id,
      requests: [
        {
          owedByMemberId: victimRef.id,
          owedToMemberId: callerRef.id,
          amount: 5,
        },
      ],
    });

    const mail = await onlyMailTo(victim.email);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(mail.html).toContain('Tom &amp; &quot;Jerry&quot;');
    expect(mail.subject).toBe(
      'Payment request from <script>alert(1)</script> for group "Tom & "Jerry"" in PipSplit'
    );
  });
});

// ---------------------------------------------------------------------------
// sendPaymentReversalEmails
// ---------------------------------------------------------------------------

describe('sendPaymentReversalEmails', () => {
  async function seedPaymentGroup() {
    const { groupRef, caller } = await seedCallerGroup();
    const payer = await seedUser();
    const payee = await seedUser();
    const payerRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: payer,
    });
    const payeeRef = await seedMember(groupRef, {
      displayName: 'Hana',
      user: payee,
    });
    return { groupRef, caller, payer, payee, payerRef, payeeRef };
  }

  it('rejects an unauthenticated caller', async () => {
    const { groupRef, payerRef, payeeRef } = await seedPaymentGroup();
    await expectCode(
      call(sendPaymentReversalEmails, null, {
        groupId: groupRef.id,
        paidByMemberId: payerRef.id,
        paidToMemberId: payeeRef.id,
        amount: 30,
        splitCount: 1,
      }),
      'unauthenticated'
    );
  });

  const valid = {
    groupId: 'g',
    paidByMemberId: 'a',
    paidToMemberId: 'b',
    amount: 30,
    splitCount: 1,
  };
  it.each([
    ['no data', undefined],
    ['a missing groupId', { ...valid, groupId: undefined }],
    ['a missing paidByMemberId', { ...valid, paidByMemberId: undefined }],
    ['a blank paidToMemberId', { ...valid, paidToMemberId: '' }],
    ['a zero amount', { ...valid, amount: 0 }],
    ['a string amount', { ...valid, amount: '30' }],
    ['an infinite amount', { ...valid, amount: Infinity }],
    ['a negative splitCount', { ...valid, splitCount: -1 }],
    ['a fractional splitCount', { ...valid, splitCount: 1.5 }],
    ['a missing splitCount', { ...valid, splitCount: undefined }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    const caller = await seedUser();
    await expectCode(
      call(sendPaymentReversalEmails, caller.uid, data),
      'invalid-argument'
    );
  });

  it('rejects a caller who is not a member of the group', async () => {
    const { groupRef, payerRef, payeeRef, payer } = await seedPaymentGroup();
    const outsider = await seedUser();
    await expectCode(
      call(sendPaymentReversalEmails, outsider.uid, {
        groupId: groupRef.id,
        paidByMemberId: payerRef.id,
        paidToMemberId: payeeRef.id,
        amount: 30,
        splitCount: 1,
      }),
      'permission-denied'
    );
    expect(await mailTo(payer.email)).toHaveLength(0);
  });

  it('rejects a caller whose (admin) membership is inactive', async () => {
    const { groupRef, payerRef, payeeRef, payer } = await seedPaymentGroup();
    const former = await seedUser();
    await seedMember(groupRef, {
      displayName: 'Former',
      user: former,
      active: false,
      groupAdmin: true,
    });
    await expectCode(
      call(sendPaymentReversalEmails, former.uid, {
        groupId: groupRef.id,
        paidByMemberId: payerRef.id,
        paidToMemberId: payeeRef.id,
        amount: 30,
        splitCount: 1,
      }),
      'permission-denied'
    );
    expect(await mailTo(payer.email)).toHaveLength(0);
  });

  it('rejects an active member who is not a group admin (only admins can unpay)', async () => {
    const { groupRef, payerRef, payeeRef, payer } = await seedPaymentGroup();
    const nonAdmin = await seedUser();
    await seedMember(groupRef, {
      displayName: 'Plain',
      user: nonAdmin,
      groupAdmin: false,
    });
    await expectCode(
      call(sendPaymentReversalEmails, nonAdmin.uid, {
        groupId: groupRef.id,
        paidByMemberId: payerRef.id,
        paidToMemberId: payeeRef.id,
        amount: 30,
        splitCount: 1,
      }),
      'permission-denied'
    );
    expect(await mailTo(payer.email)).toHaveLength(0);
  });

  it('rejects a member id that is not in the group, sending nothing', async () => {
    const { groupRef, caller, payerRef, payer } = await seedPaymentGroup();
    await expectCode(
      call(sendPaymentReversalEmails, caller.uid, {
        groupId: groupRef.id,
        paidByMemberId: payerRef.id,
        paidToMemberId: 'm-missing',
        amount: 30,
        splitCount: 1,
      }),
      'not-found'
    );
    expect(await mailTo(payer.email)).toHaveLength(0);
  });

  it("emails both members with today's reversal copy", async () => {
    const { groupRef, caller, payer, payee, payerRef, payeeRef } =
      await seedPaymentGroup();

    const result = await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: payerRef.id,
      paidToMemberId: payeeRef.id,
      amount: 30,
      splitCount: 2,
    });

    expect(result).toEqual({ sent: 2 });
    const payerMail = await onlyMailTo(payer.email);
    expect(payerMail.subject).toBe(
      'A payment from you to Hana in PipSplit has been reversed'
    );
    expect(payerMail.text).toBe(
      [
        'Hi Ivo,',
        '',
        'A payment of $30.00 from you to Hana in the group "Beach Trip" has been reversed in PipSplit.',
        '',
        'The 2 shared expenses covered by this payment have been marked as unpaid and will appear in your outstanding balance again.',
      ].join('\n')
    );
    expect(payerMail.html).toContain(
      '<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Payment Reversed</h2>'
    );
    expect(payerMail.html).toContain('<strong>$30.00</strong>');

    const payeeMail = await onlyMailTo(payee.email);
    expect(payeeMail.subject).toBe(
      'A payment from Ivo to you in PipSplit has been reversed'
    );
    expect(payeeMail.text).toBe(
      [
        'Hi Hana,',
        '',
        'A payment of $30.00 from Ivo to you in the group "Beach Trip" has been reversed in PipSplit.',
        '',
        'The 2 shared expenses covered by this payment have been marked as unpaid and will appear in the outstanding balance again.',
      ].join('\n')
    );
  });

  it('uses the singular "expense" for one split', async () => {
    const { groupRef, caller, payer, payerRef, payeeRef } =
      await seedPaymentGroup();

    await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: payerRef.id,
      paidToMemberId: payeeRef.id,
      amount: 30,
      splitCount: 1,
    });

    expect((await onlyMailTo(payer.email)).text).toContain(
      'The 1 shared expense covered'
    );
  });

  it('skips opted-out and unregistered members and counts only what it sent', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const optedOut = await seedUser({ emailOptOut: true });
    const optedOutRef = await seedMember(groupRef, {
      displayName: 'Quinn',
      user: optedOut,
    });
    const placeholderEmail = uniqueEmail('placeholder');
    const placeholderRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      email: placeholderEmail,
    });

    const result = await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: optedOutRef.id,
      paidToMemberId: placeholderRef.id,
      amount: 30,
      splitCount: 1,
    });

    expect(result).toEqual({ sent: 0 });
    expect(await mailTo(optedOut.email)).toHaveLength(0);
    expect(await mailTo(placeholderEmail)).toHaveLength(0);
  });

  it('skips a member whose stored email is a list, still mailing the other', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const payee = await seedUser();
    const payeeRef = await seedMember(groupRef, {
      displayName: 'Hana',
      user: payee,
    });
    const listUser = await seedUser();
    const [a, b] = [uniqueEmail('list'), uniqueEmail('list')];
    const listRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: listUser,
      email: `${a},${b}`,
    });

    const result = await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: listRef.id,
      paidToMemberId: payeeRef.id,
      amount: 30,
      splitCount: 1,
    });

    expect(result).toEqual({ sent: 1 });
    await expectNoMailToAny([a, b, `${a},${b}`]);
    expect((await onlyMailTo(payee.email)).subject).toBe(
      'A payment from Ivo to you in PipSplit has been reversed'
    );
  });

  it('still mails the other member when one side is skipped', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const payee = await seedUser();
    const payeeRef = await seedMember(groupRef, {
      displayName: 'Hana',
      user: payee,
    });
    const placeholderRef = await seedMember(groupRef, { displayName: 'Ivo' });

    const result = await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: placeholderRef.id,
      paidToMemberId: payeeRef.id,
      amount: 30,
      splitCount: 1,
    });

    expect(result).toEqual({ sent: 1 });
    expect((await onlyMailTo(payee.email)).subject).toBe(
      'A payment from Ivo to you in PipSplit has been reversed'
    );
  });

  it('HTML-escapes names and the group name', async () => {
    const { groupRef, caller } = await seedCallerGroup({
      groupFields: { name: 'A & B' },
    });
    const payer = await seedUser();
    const payerRef = await seedMember(groupRef, {
      displayName: '<script>x</script>',
      user: payer,
    });
    const payeeRef = await seedMember(groupRef, { displayName: '<b>Hana</b>' });

    await call(sendPaymentReversalEmails, caller.uid, {
      groupId: groupRef.id,
      paidByMemberId: payerRef.id,
      paidToMemberId: payeeRef.id,
      amount: 30,
      splitCount: 1,
    });

    const mail = await onlyMailTo(payer.email);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Hana</b>');
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(mail.html).toContain('&lt;b&gt;Hana&lt;/b&gt;');
    expect(mail.html).toContain('A &amp; B');
  });
});

// ---------------------------------------------------------------------------
// sendSettleReversalEmails
// ---------------------------------------------------------------------------

describe('sendSettleReversalEmails', () => {
  it('rejects an unauthenticated caller', async () => {
    const { groupRef } = await seedCallerGroup();
    const member = await seedMember(groupRef, { displayName: 'Ivo' });
    await expectCode(
      call(sendSettleReversalEmails, null, {
        groupId: groupRef.id,
        memberIds: [member.id],
        settleDate: '2026-10-21',
      }),
      'unauthenticated'
    );
  });

  const valid = { groupId: 'g', memberIds: ['a'], settleDate: '2026-10-21' };
  it.each([
    ['no data', undefined],
    ['a missing groupId', { ...valid, groupId: undefined }],
    ['memberIds that are not an array', { ...valid, memberIds: 'a' }],
    ['no memberIds', { ...valid, memberIds: [] }],
    [
      'more than 100 memberIds',
      { ...valid, memberIds: Array.from({ length: 101 }, (_, i) => `m${i}`) },
    ],
    ['a blank member id', { ...valid, memberIds: ['a', ''] }],
    ['a reserved member id (..)', { ...valid, memberIds: ['..'] }],
    ['a non-string member id', { ...valid, memberIds: [7] }],
    ['a missing settleDate', { ...valid, settleDate: undefined }],
    ['a US-format settleDate', { ...valid, settleDate: '10/21/2026' }],
    ['an impossible settleDate', { ...valid, settleDate: '2026-02-30' }],
    ['a settleDate with a time', { ...valid, settleDate: '2026-10-21T00:00' }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    const caller = await seedUser();
    await expectCode(
      call(sendSettleReversalEmails, caller.uid, data),
      'invalid-argument'
    );
  });

  it('rejects a caller who is not a member of the group', async () => {
    const { groupRef } = await seedCallerGroup();
    const target = await seedUser();
    const targetRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: target,
    });
    const outsider = await seedUser();
    await expectCode(
      call(sendSettleReversalEmails, outsider.uid, {
        groupId: groupRef.id,
        memberIds: [targetRef.id],
        settleDate: '2026-10-21',
      }),
      'permission-denied'
    );
    expect(await mailTo(target.email)).toHaveLength(0);
  });

  it('rejects a caller whose (admin) membership is inactive', async () => {
    const { groupRef } = await seedCallerGroup();
    const target = await seedUser();
    const targetRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: target,
    });
    const former = await seedUser();
    await seedMember(groupRef, {
      displayName: 'Former',
      user: former,
      active: false,
      groupAdmin: true,
    });
    await expectCode(
      call(sendSettleReversalEmails, former.uid, {
        groupId: groupRef.id,
        memberIds: [targetRef.id],
        settleDate: '2026-10-21',
      }),
      'permission-denied'
    );
    expect(await mailTo(target.email)).toHaveLength(0);
  });

  it('rejects an active member who is not a group admin (only admins can unpay)', async () => {
    const { groupRef, caller } = await seedCallerGroup({ callerAdmin: false });
    const target = await seedUser();
    const targetRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: target,
    });
    await expectCode(
      call(sendSettleReversalEmails, caller.uid, {
        groupId: groupRef.id,
        memberIds: [targetRef.id],
        settleDate: '2026-10-21',
      }),
      'permission-denied'
    );
    expect(await mailTo(target.email)).toHaveLength(0);
  });

  it('rejects a member id that is not in the group, sending nothing', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const target = await seedUser();
    const targetRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: target,
    });
    await expectCode(
      call(sendSettleReversalEmails, caller.uid, {
        groupId: groupRef.id,
        memberIds: [targetRef.id, 'm-missing'],
        settleDate: '2026-10-21',
      }),
      'not-found'
    );
    expect(await mailTo(target.email)).toHaveLength(0);
  });

  it('mails each eligible member once, skipping opted-out and unregistered ones', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const ivo = await seedUser();
    const ivoRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: ivo,
    });
    const hana = await seedUser();
    const hanaRef = await seedMember(groupRef, {
      displayName: 'Hana',
      user: hana,
    });
    const optedOut = await seedUser({ emailOptOut: true });
    const optedOutRef = await seedMember(groupRef, {
      displayName: 'Quinn',
      user: optedOut,
    });
    const placeholderEmail = uniqueEmail('placeholder');
    const placeholderRef = await seedMember(groupRef, {
      displayName: 'Kai',
      email: placeholderEmail,
    });

    const listUser = await seedUser();
    const [listA, listB] = [uniqueEmail('list'), uniqueEmail('list')];
    const listRef = await seedMember(groupRef, {
      displayName: 'Lex',
      user: listUser,
      email: `${listA};${listB}`,
    });

    const result = await call(sendSettleReversalEmails, caller.uid, {
      groupId: groupRef.id,
      memberIds: [
        ivoRef.id,
        optedOutRef.id,
        hanaRef.id,
        placeholderRef.id,
        listRef.id,
        ivoRef.id,
      ],
      settleDate: '2026-10-21',
    });

    expect(result).toEqual({ sent: 2 });
    expect(await mailTo(optedOut.email)).toHaveLength(0);
    expect(await mailTo(placeholderEmail)).toHaveLength(0);
    await expectNoMailToAny([listA, listB, `${listA};${listB}`]);
    expect(await onlyMailTo(hana.email)).toBeDefined();

    const mail = await onlyMailTo(ivo.email);
    expect(mail.subject).toBe(
      'The group settle for "Beach Trip" has been reversed in PipSplit'
    );
    expect(mail.text).toBe(
      [
        'Hi Ivo,',
        '',
        'A group admin has reversed the group settlement for "Beach Trip" that was recorded on 2026-10-21.',
        '',
        'All outstanding balances have been restored. Please check your current balance in PipSplit.',
      ].join('\n')
    );
    expect(mail.html).toContain(
      '<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Group Settlement Reversed</h2>'
    );
    expect(mail.html).toContain('recorded on <strong>2026-10-21</strong>');
  });

  it('prints the settle date as ISO yyyy-MM-dd, unchanged', async () => {
    const { groupRef, caller } = await seedCallerGroup();
    const ivo = await seedUser();
    const ivoRef = await seedMember(groupRef, {
      displayName: 'Ivo',
      user: ivo,
    });

    await call(sendSettleReversalEmails, caller.uid, {
      groupId: groupRef.id,
      memberIds: [ivoRef.id],
      settleDate: '2026-03-07',
    });

    const mail = await onlyMailTo(ivo.email);
    expect(mail.text).toContain('recorded on 2026-03-07.');
    expect(mail.html).toContain('recorded on <strong>2026-03-07</strong>');
  });

  it('HTML-escapes names and the group name', async () => {
    const { groupRef, caller } = await seedCallerGroup({
      groupFields: { name: '<i>Trip</i>' },
    });
    const ivo = await seedUser();
    const ivoRef = await seedMember(groupRef, {
      displayName: '<script>x</script>',
      user: ivo,
    });

    await call(sendSettleReversalEmails, caller.uid, {
      groupId: groupRef.id,
      memberIds: [ivoRef.id],
      settleDate: '2026-10-21',
    });

    const mail = await onlyMailTo(ivo.email);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<i>Trip</i>');
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(mail.html).toContain('&lt;i&gt;Trip&lt;/i&gt;');
  });
});
