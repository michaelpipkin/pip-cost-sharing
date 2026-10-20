import { expect, test } from '../fixtures';
import { getSeedAdmin } from '../seed/admin';
import { ALL_DATASETS } from '../seed/datasets';
import { SHARED } from '../seed/datasets/shared';
import type { SeedDataset, SeedExpense } from '../seed/types';
import { validateDatasets } from '../seed/validate';
import { signInAs } from '../utils/session';

// The history -> mail -> delivery trigger chain runs on the functions
// emulator, which cold-starts each function on first use; under a busy run
// (dev server compiling, browsers starting) it has taken 20+ s after seeding.
const MAIL_SETTLE_TIMEOUT_MS = 60_000;
// A rejected sign-in must surface well before signInAs's 30 s landing bound.
// Includes the first (cold) load of the login page.
const SIGN_IN_FAIL_FAST_MS = 15_000;

/** A deep copy of ALL_DATASETS that a test can corrupt without side effects. */
function cloneDatasets(): SeedDataset[] {
  return structuredClone(ALL_DATASETS);
}

/**
 * Emails sendPaymentNotificationEmail writes to for the shared payments:
 * each party whose member has an email and is linked to a user who hasn't
 * opted out of email.
 */
function sharedPaymentRecipients(): string[] {
  const members = new Map(SHARED.group.members.map((m) => [m.key, m]));
  const users = new Map(Object.values(SHARED.users).map((u) => [u.key, u]));
  const emails = new Set<string>();
  for (const payment of SHARED.group.payments ?? []) {
    for (const key of [payment.paidByKey, payment.paidToKey]) {
      const member = members.get(key)!;
      const user = member.userKey ? users.get(member.userKey) : undefined;
      if (member.email && user && !user.profile?.emailOptOut) {
        emails.add(member.email);
      }
    }
  }
  return [...emails].sort();
}

function findExpense(datasets: SeedDataset[], key: string): SeedExpense {
  return sharedDataset(datasets).groups[0]!.expenses!.find((e) => e.key === key)!;
}

function sharedDataset(datasets: SeedDataset[]): SeedDataset {
  return datasets.find((d) => d.groups.some((g) => g.key === SHARED.group.key))!;
}

test.describe('seed', { tag: '@infra' }, () => {
  test('validateDatasets accepts ALL_DATASETS', () => {
    expect(() => validateDatasets(ALL_DATASETS)).not.toThrow();
  });

  test('validateDatasets rejects a duplicate user email', () => {
    const datasets = cloneDatasets();
    const shared = sharedDataset(datasets);
    shared.users.push({
      ...SHARED.users.alice,
      key: 'alice-copy',
      uid: 'u-alice-copy',
    });
    expect(() => validateDatasets(datasets)).toThrow(/duplicate.*email/i);
  });

  test('validateDatasets rejects a non-.test email', () => {
    const datasets = cloneDatasets();
    sharedDataset(datasets).users[0]!.email = 'someone@example.com';
    expect(() => validateDatasets(datasets)).toThrow(/pipsplit\.test/);
  });

  test('validateDatasets rejects an unknown member key in a split', () => {
    const datasets = cloneDatasets();
    const group = sharedDataset(datasets).groups[0]!;
    group.expenses![0]!.splits[0]!.owedByKey = 'nobody';
    expect(() => validateDatasets(datasets)).toThrow(/unknown/i);
  });

  test('validateDatasets rejects a group without an owner', () => {
    const datasets = cloneDatasets();
    const group = sharedDataset(datasets).groups[0]!;
    delete (group as { owner?: unknown }).owner;
    expect(() => validateDatasets(datasets)).toThrow(/owner/i);
  });

  test('validateDatasets rejects an amount expense that does not add up', () => {
    const datasets = cloneDatasets();
    const expense = findExpense(datasets, 'e-groceries');
    expense.splits[0]!.assignedAmount = 31; // assigned 91 vs total 90
    expect(() => validateDatasets(datasets)).toThrow(
      /e-groceries.*amount split adds up to 91.*total is 90/
    );
  });

  test('validateDatasets rejects percentages that do not total 100', () => {
    const datasets = cloneDatasets();
    const expense = findExpense(datasets, 'e-rental');
    expense.splits[0]!.percentage = 41; // 41 + 30 + 20 + 10 = 101
    expect(() => validateDatasets(datasets)).toThrow(
      /e-rental.*percentages total 101.*must be 100/
    );
  });

  test('validateDatasets rejects a non-positive share', () => {
    const datasets = cloneDatasets();
    const expense = findExpense(datasets, 'e-dinner');
    expense.splits[1]!.shares = 0;
    expect(() => validateDatasets(datasets)).toThrow(
      /e-dinner.*"bob".*shares must be greater than 0/
    );
  });

  test('validateDatasets rejects split fields that do not match splitMethod', () => {
    const datasets = cloneDatasets();
    const expense = findExpense(datasets, 'e-groceries');
    expense.splits[0]!.percentage = 50; // percentages on an amount expense
    expect(() => validateDatasets(datasets)).toThrow(
      /e-groceries.*"alice".*percentage.*not used by splitMethod 'amount'/
    );
  });

  test('validateDatasets rejects expense-level pools on a percentage expense', () => {
    const datasets = cloneDatasets();
    findExpense(datasets, 'e-rental').sharedAmount = 10;
    expect(() => validateDatasets(datasets)).toThrow(
      /e-rental.*sharedAmount.*only valid for splitMethod 'amount'/
    );
  });

  test('validateDatasets rejects two members sharing an email, ignoring case', () => {
    const datasets = cloneDatasets();
    sharedDataset(datasets).groups[0]!.members.push({
      key: 'bob-two',
      displayName: 'Bob Two',
      email: 'BOB@PipSplit.test',
    });
    expect(() => validateDatasets(datasets)).toThrow(
      /member "bob-two".*duplicate member email/
    );
  });

  test('validateDatasets rejects a linked member whose email differs from its user', () => {
    const datasets = cloneDatasets();
    const bob = sharedDataset(datasets).groups[0]!.members.find(
      (m) => m.key === 'bob'
    )!;
    bob.email = 'not-bob@pipsplit.test';
    expect(() => validateDatasets(datasets)).toThrow(
      /member "bob".*does not match user "bob" email/
    );
  });

  test('validateDatasets rejects a defaultGroupKey the user is not a member of', () => {
    const datasets = cloneDatasets();
    const shared = sharedDataset(datasets);
    shared.groups.push({
      key: 'g-other',
      owner: 'shared',
      name: 'Other group without bob',
      members: [{ key: 'solo', displayName: 'Solo', email: '' }],
      categories: [],
    });
    shared.users.find((u) => u.key === 'bob')!.profile = {
      defaultGroupKey: 'g-other',
    };
    expect(() => validateDatasets(datasets)).toThrow(
      /user "bob".*defaultGroupKey "g-other".*not a member/
    );
  });

  test('validateDatasets rejects group names that differ only by case', () => {
    const datasets = cloneDatasets();
    const shared = sharedDataset(datasets);
    shared.groups.push({
      key: 'g-shouty',
      owner: 'shared',
      name: SHARED.group.name.toUpperCase(),
      members: [],
      categories: [],
    });
    expect(() => validateDatasets(datasets)).toThrow(
      /group "g-shouty".*duplicate group name.*case-insensitive/
    );
  });

  test('seeded users are email-verified', async () => {
    const { auth } = getSeedAdmin();
    const user = await auth.getUserByEmail(SHARED.users.alice.email);
    expect(user.emailVerified).toBe(true);
  });

  test('seeded profile fields survive the sign-up trigger', async () => {
    const { db } = getSeedAdmin();
    const snap = await db.doc(`users/${SHARED.users.alice.uid}`).get();
    expect(snap.get('venmoId')).toBe('alice-venmo');
  });

  test('shared group has derived member UID arrays', async () => {
    const { db } = getSeedAdmin();
    const g = await db.doc(`groups/${SHARED.group.key}`).get();
    const { alice, bob, carol } = SHARED.users;
    expect(new Set(g.get('memberUids'))).toEqual(
      new Set([alice.uid, bob.uid, carol.uid])
    );
    // Linked members only (Dana is a placeholder with no user), and only the
    // active ones, derived from the dataset rather than restated.
    const uidByUserKey = new Map(
      Object.values(SHARED.users).map((u) => [u.key, u.uid])
    );
    const activeLinkedUids = SHARED.group.members
      .filter((m) => m.userKey !== undefined && (m.active ?? true))
      .map((m) => uidByUserKey.get(m.userKey!)!);
    expect(activeLinkedUids.length).toBeGreaterThan(0);
    expect(new Set(g.get('activeMemberUids'))).toEqual(new Set(activeLinkedUids));
    expect(g.get('adminUids')).toEqual([alice.uid]);
  });

  test('mail generated during seeding is suppressed', async () => {
    // The shared SeedPayment (Bob -> Alice) writes a history doc, which fires
    // sendPaymentNotificationEmail -> one mail doc per linked party ->
    // sendMailQueueEmail, which must suppress delivery under demo-* projects.
    // Scoped to the shared payment's recipients: other specs running in
    // parallel create (and are mid-delivery on) their own mail docs.
    test.setTimeout(MAIL_SETTLE_TIMEOUT_MS + 15_000);
    const { db } = getSeedAdmin();
    const recipients = sharedPaymentRecipients();
    expect(recipients.length).toBeGreaterThan(0);
    const seededMail = db.collection('mail').where('to', 'in', recipients);

    await expect
      .poll(
        async () => {
          const snap = await seededMail.get();
          const settled = snap.docs.filter((d) => {
            const state = d.get('delivery.state');
            return state !== undefined && state !== 'PROCESSING';
          });
          return settled.map((d) => d.get('to') as string).sort();
        },
        { timeout: MAIL_SETTLE_TIMEOUT_MS }
      )
      .toEqual(expect.arrayContaining(recipients));

    const mail = await seededMail.get();
    for (const doc of mail.docs) {
      expect(doc.get('delivery.state'), `mail ${doc.id}`).toBe('SUCCESS');
      expect(doc.get('delivery.info.messageId'), `mail ${doc.id}`).toBe(
        'suppressed'
      );
    }
  });

  test('signInAs lands a seeded user on the authenticated app', async ({
    seededPage,
  }) => {
    await signInAs(seededPage, SHARED.users.alice);
    await expect(seededPage.getByTestId('current-group-name')).toHaveText(
      SHARED.group.name
    );
  });

  test('signInAs fails fast on a wrong password', async ({ seededPage }) => {
    const wrongPassword = { ...SHARED.users.bob, password: 'not-the-password' };
    const started = Date.now();
    const email = wrongPassword.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(signInAs(seededPage, wrongPassword)).rejects.toThrow(
      new RegExp(`${email}.*sign-in rejected`)
    );
    expect(Date.now() - started).toBeLessThan(SIGN_IN_FAIL_FAST_MS);
  });
});
