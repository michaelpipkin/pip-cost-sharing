import { expect, test } from '../fixtures';
import { getSeedAdmin } from '../seed/admin';
import { ALL_DATASETS } from '../seed/datasets';
import { ACCOUNT_ACTION } from '../seed/datasets/account-action';
import { INFRA } from '../seed/datasets/infra';
import { SHARED } from '../seed/datasets/shared';
import { storageObjectExists } from '../seed/storage';
import type { SeedDataset, SeedExpense, SeedGroup } from '../seed/types';
import { validateDatasets } from '../seed/validate';
import { signInAs } from '../utils/session';

// The history -> mail -> delivery trigger chain runs on the functions
// emulator, which cold-starts each function on first use; under a busy run
// (dev server compiling, browsers starting) it has taken 20+ s after seeding.
const MAIL_SETTLE_TIMEOUT_MS = 60_000;
// A rejected sign-in must surface well before signInAs's 30 s landing bound.
// Includes the first (cold) load of the login page.
const SIGN_IN_FAIL_FAST_MS = 15_000;

const INFRA_DATASET_NAME = 'infra';
const INFRA_GROUP_PATH = `groups/${INFRA.group.key}`;

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

function infraDataset(datasets: SeedDataset[]): SeedDataset {
  return datasets.find((d) => d.name === INFRA_DATASET_NAME)!;
}

function infraGroup(datasets: SeedDataset[]): SeedGroup {
  return infraDataset(datasets).groups[0]!;
}

function findInfraExpense(group: SeedGroup, key: string): SeedExpense {
  return group.expenses!.find((e) => e.key === key)!;
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

  test('a user seeded with emailVerified false is unverified', async () => {
    // account-action's resend user is never verified by its test.
    const { auth } = getSeedAdmin();
    const user = await auth.getUserByEmail(ACCOUNT_ACTION.users.resend.email);
    expect(user.emailVerified).toBe(false);
  });

  test('validateDatasets rejects a non-boolean emailVerified', () => {
    const datasets = cloneDatasets();
    const shared = sharedDataset(datasets);
    (shared.users[0] as { emailVerified?: unknown }).emailVerified = 'yes';
    expect(() => validateDatasets(datasets)).toThrow(
      /emailVerified must be a boolean/
    );
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

  // -------------------------------------------------------------------------
  // Memorized, rental, receipt, member state, mail and app-error rules
  // -------------------------------------------------------------------------

  test('validateDatasets rejects memorized splits that do not reconcile to the total', () => {
    const datasets = cloneDatasets();
    infraGroup(datasets).memorized![0]!.splits[0]!.assignedAmount = 21; // 21 + 20 vs 40
    expect(() => validateDatasets(datasets)).toThrow(
      /memorized "m-lunch".*amount split adds up to 41.*total is 40/
    );
  });

  test('validateDatasets rejects a rental on a non-shares expense', () => {
    const datasets = cloneDatasets();
    findInfraExpense(infraGroup(datasets), 'x-receipt').rental = {
      nightCount: 1,
      stays: [{ memberKey: 'ivy', nights: [0] }],
    };
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-receipt".*rental is only valid for splitMethod 'shares' \(this is 'amount'\)/
    );
  });

  test("validateDatasets rejects a rental stay's member who is not in the group", () => {
    const datasets = cloneDatasets();
    findInfraExpense(infraGroup(datasets), 'x-rental').rental!.stays[0]!.memberKey =
      'nobody';
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-rental".*rental stay.*unknown member key "nobody"/
    );
  });

  test('validateDatasets rejects a stay night outside the rental', () => {
    const datasets = cloneDatasets();
    // x-rental has 3 nights (0..2); night 3 does not exist.
    findInfraExpense(infraGroup(datasets), 'x-rental').rental!.stays[0]!.nights.push(3);
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-rental".*night 3 is outside 0\.\.2 \(nightCount 3\)/
    );
  });

  test('validateDatasets rejects a rental night nobody attends', () => {
    const datasets = cloneDatasets();
    for (const stay of findInfraExpense(infraGroup(datasets), 'x-rental').rental!.stays) {
      stay.nights = stay.nights.filter((n) => n !== 1);
    }
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-rental".*night 1 has nobody present/
    );
  });

  test('validateDatasets rejects a stay roomId that is not in rooms', () => {
    const datasets = cloneDatasets();
    findInfraExpense(infraGroup(datasets), 'x-rental').rental!.stays[0]!.roomId = 'attic';
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-rental".*roomId "attic" is not in rooms/
    );
  });

  test('validateDatasets rejects a receipt file that does not exist', () => {
    const datasets = cloneDatasets();
    findInfraExpense(infraGroup(datasets), 'x-receipt').receipt!.file = 'no-such-file.png';
    expect(() => validateDatasets(datasets)).toThrow(
      /expense "x-receipt".*receipt file "no-such-file\.png" does not exist/
    );
  });

  test('validateDatasets rejects a mail doc with an unknown state', () => {
    const datasets = cloneDatasets();
    (infraDataset(datasets).mail![0]! as { state: string }).state = 'BOUNCED';
    expect(() => validateDatasets(datasets)).toThrow(
      /mail "mail-infra-error".*unknown state "BOUNCED"/
    );
  });

  test('validateDatasets rejects leftGroup on an active member', () => {
    const datasets = cloneDatasets();
    infraGroup(datasets).members.find((m) => m.key === 'ivy')!.leftGroup = true;
    expect(() => validateDatasets(datasets)).toThrow(
      /member "ivy".*leftGroup.*requires active: false/
    );
  });

  test('validateDatasets rejects duplicate mail keys', () => {
    const datasets = cloneDatasets();
    const dataset = infraDataset(datasets);
    dataset.mail!.push({ ...dataset.mail![0]! });
    expect(() => validateDatasets(datasets)).toThrow(
      /duplicate mail key "mail-infra-error"/
    );
  });

  test('validateDatasets rejects duplicate app-error keys', () => {
    const datasets = cloneDatasets();
    const dataset = infraDataset(datasets);
    dataset.appErrors!.push({ ...dataset.appErrors![0]! });
    expect(() => validateDatasets(datasets)).toThrow(
      /duplicate app error key "err-infra-listed"/
    );
  });

  test('a seeded memorized doc has the embedded splits', async () => {
    const { db } = getSeedAdmin();
    const snap = await db.doc(`${INFRA_GROUP_PATH}/memorized/m-lunch`).get();
    expect(snap.exists).toBe(true);
    expect(snap.get('description')).toBe('Infra memorized lunch');
    expect(snap.get('totalAmount')).toBe(40);
    expect(snap.get('splitMethod')).toBe('amount');
    expect(snap.get('paidByMemberRef').path).toBe(`${INFRA_GROUP_PATH}/members/ivy`);
    expect(snap.get('categoryRef').path).toBe(`${INFRA_GROUP_PATH}/categories/general`);
    const splits = snap.get('splits') as Record<string, unknown>[];
    expect(
      splits.map((s) => ({
        owedBy: (s['owedByMemberRef'] as { path: string }).path,
        paidBy: (s['paidByMemberRef'] as { path: string }).path,
        assigned: s['assignedAmount'],
        allocated: s['allocatedAmount'],
        percentage: s['percentage'],
        shares: s['shares'],
      }))
    ).toEqual([
      {
        owedBy: `${INFRA_GROUP_PATH}/members/ivy`,
        paidBy: `${INFRA_GROUP_PATH}/members/ivy`,
        assigned: 20,
        allocated: 20,
        percentage: 0,
        shares: 0,
      },
      {
        owedBy: `${INFRA_GROUP_PATH}/members/jo`,
        paidBy: `${INFRA_GROUP_PATH}/members/ivy`,
        assigned: 20,
        allocated: 20,
        percentage: 0,
        shares: 0,
      },
    ]);
    // A memorized expense is a template: no date, paid flag or receipt.
    for (const field of ['date', 'paid', 'receiptPath']) {
      expect(snap.get(field), field).toBeUndefined();
    }
  });

  test('the seeded rental expense stores stays with member refs', async () => {
    const { db } = getSeedAdmin();
    const snap = await db.doc(`${INFRA_GROUP_PATH}/expenses/x-rental`).get();
    expect(snap.get('splitMethod')).toBe('shares');
    const rental = snap.get('rental') as {
      nightCount: number;
      stays: { memberRef: { path: string }; nights: number[]; roomId?: string }[];
      rooms: { id: string; name: string; rate: number }[];
    };
    expect(rental.nightCount).toBe(3);
    expect(rental.rooms).toEqual([{ id: 'loft', name: 'Loft', rate: 1.5 }]);
    expect(
      rental.stays.map((s) => ({
        member: s.memberRef.path,
        nights: s.nights,
        roomId: s.roomId,
      }))
    ).toEqual([
      { member: `${INFRA_GROUP_PATH}/members/ivy`, nights: [0, 1, 2], roomId: undefined },
      { member: `${INFRA_GROUP_PATH}/members/jo`, nights: [0, 1, 2], roomId: 'loft' },
      { member: `${INFRA_GROUP_PATH}/members/lee`, nights: [1, 2], roomId: undefined },
    ]);
    // A plain expense carries no rental field.
    const plain = await db.doc(`${INFRA_GROUP_PATH}/expenses/x-receipt`).get();
    expect(plain.get('rental')).toBeUndefined();
  });

  test('the seeded receipt exists in Storage', async () => {
    const { db } = getSeedAdmin();
    const receiptPath = `${INFRA_GROUP_PATH}/receipts/x-receipt`;
    const snap = await db.doc(`${INFRA_GROUP_PATH}/expenses/x-receipt`).get();
    expect(snap.get('receiptPath')).toBe(receiptPath);
    expect(await storageObjectExists(receiptPath)).toBe(true);
    expect(await storageObjectExists(`${INFRA_GROUP_PATH}/receipts/x-rental`)).toBe(false);
    const other = await db.doc(`${INFRA_GROUP_PATH}/expenses/x-rental`).get();
    expect(other.get('receiptPath')).toBeNull();
  });

  test('left and invited members carry their state', async () => {
    const { db } = getSeedAdmin();
    const kit = await db.doc(`${INFRA_GROUP_PATH}/members/kit`).get();
    expect(kit.get('leftGroup')).toBe(true);
    expect(kit.get('active')).toBe(false);
    const ivy = await db.doc(`${INFRA_GROUP_PATH}/members/ivy`).get();
    expect(ivy.get('leftGroup')).toBeUndefined();
    expect(ivy.get('invite')).toBeUndefined();

    const lee = await db.doc(`${INFRA_GROUP_PATH}/members/lee`).get();
    const invite = lee.get('invite') as {
      lastSentAt: { toMillis(): number };
      lastSentTo: string;
      sendCount: number;
    };
    expect(invite.lastSentTo).toBe('lee@pipsplit.test');
    expect(invite.sendCount).toBe(3);
    const ageDays = (Date.now() - invite.lastSentAt.toMillis()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(1.9);
    expect(ageDays).toBeLessThan(2.5);
  });

  test('seeded app errors carry a Timestamp', async () => {
    const { db } = getSeedAdmin();
    const seeded = INFRA.appErrors.listed;
    const snap = await db.doc(`app_errors/${seeded.key}`).get();
    expect(snap.get('component')).toBe(seeded.component);
    expect(snap.get('action')).toBe(seeded.action);
    expect(snap.get('message')).toBe(seeded.message);
    const ageHours = (Date.now() - snap.get('timestamp').toMillis()) / 3_600_000;
    expect(ageHours).toBeGreaterThan(seeded.hoursAgo - 0.5);
    expect(ageHours).toBeLessThan(seeded.hoursAgo + 0.5);
  });

  test('seeded mail keeps its state: the trigger skips docs that carry a delivery block', async () => {
    // A fixed wait would prove nothing. Instead wait until the trigger has
    // demonstrably processed mail (the shared payment's notification reaches
    // SUCCESS), then check the seeded docs were left as written.
    test.setTimeout(MAIL_SETTLE_TIMEOUT_MS + 15_000);
    const { db } = getSeedAdmin();
    const recipients = sharedPaymentRecipients();
    await expect
      .poll(
        async () => {
          const snap = await db.collection('mail').where('to', 'in', recipients).get();
          return snap.docs.some((d) => d.get('delivery.state') === 'SUCCESS');
        },
        { timeout: MAIL_SETTLE_TIMEOUT_MS }
      )
      .toBe(true);

    for (const mail of Object.values(INFRA.mail)) {
      const snap = await db.doc(`mail/${mail.key}`).get();
      expect(snap.get('delivery.state'), `mail ${mail.key}`).toBe(mail.state);
      expect(snap.get('message.subject'), `mail ${mail.key}`).toBe(mail.subject);
    }
    const errored = await db.doc(`mail/${INFRA.mail.error.key}`).get();
    expect(errored.get('delivery.error')).toBe(INFRA.mail.error.error);
    expect(errored.get('delivery.info')).toBeUndefined();
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
    // toThrow(string) matches a substring of the message: signInAs's context
    // names the user, then the rejection.
    await expect(signInAs(seededPage, wrongPassword)).rejects.toThrow(
      `signInAs(${wrongPassword.key} <${wrongPassword.email}>): sign-in rejected`
    );
    expect(Date.now() - started).toBeLessThan(SIGN_IN_FAIL_FAST_MS);
  });
});
