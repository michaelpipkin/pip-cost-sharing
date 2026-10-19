import { expect, test } from '../fixtures';
import { getSeedAdmin } from '../seed/admin';
import { ALL_DATASETS } from '../seed/datasets';
import { SHARED } from '../seed/datasets/shared';
import type { SeedDataset } from '../seed/types';
import { validateDatasets } from '../seed/validate';
import { signInAs } from '../utils/session';

// The history -> mail -> delivery trigger chain runs on the functions
// emulator, which cold-starts each function on first use; under a busy run
// (dev server compiling, browsers starting) it has taken 20+ s after seeding.
const MAIL_SETTLE_TIMEOUT_MS = 60_000;

/** A deep copy of ALL_DATASETS that a test can corrupt without side effects. */
function cloneDatasets(): SeedDataset[] {
  return structuredClone(ALL_DATASETS);
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
  });

  test('mail generated during seeding is suppressed', async () => {
    // The shared SeedPayment (Bob -> Alice) writes a history doc, which fires
    // sendPaymentNotificationEmail -> one mail doc per linked party ->
    // sendMailQueueEmail, which must suppress delivery under demo-* projects.
    test.setTimeout(MAIL_SETTLE_TIMEOUT_MS + 15_000);
    const { db } = getSeedAdmin();
    const expectedRecipients = [
      SHARED.users.alice.email,
      SHARED.users.bob.email,
    ].sort();

    await expect
      .poll(
        async () => {
          const snap = await db.collection('mail').get();
          const settled = snap.docs.filter((d) => {
            const state = d.get('delivery.state');
            return state !== undefined && state !== 'PROCESSING';
          });
          return settled.map((d) => d.get('to') as string).sort();
        },
        { timeout: MAIL_SETTLE_TIMEOUT_MS }
      )
      .toEqual(expect.arrayContaining(expectedRecipients));

    const mail = await db.collection('mail').get();
    expect(mail.size).toBeGreaterThan(0);
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
});
