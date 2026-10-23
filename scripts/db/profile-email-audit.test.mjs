// The clear-unverified-profile-emails decisions (scripts/db/
// profile-email-audit.ts): which profiles are fixed and to what, which linked
// members are only listed, what --apply writes or skips, and the safety stop
// that refuses an implausible audit. Pure functions, so no emulator is
// needed; the I/O wrappers were checked on the isolated test emulators
// (report, Plan 4 B14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_AUTH_USER_MAX_COUNT,
  checkApplySafety,
  planApply,
  planMemberReview,
  planProfileFixes,
} from './profile-email-audit.ts';

const auth = new Map([
  ['verified', { email: 'Ver@x.com', emailVerified: true }],
  ['unverified', { email: 'unv@x.com', emailVerified: false }],
  ['foreign', { email: 'own@x.com', emailVerified: true }],
  ['lower', { email: 'low@x.com', emailVerified: true }],
  ['google-null', { email: undefined, emailVerified: true }],
  ['crawler', { email: 'play_review@google.com', emailVerified: false }],
  ['empty', { email: 'empty@x.com', emailVerified: false }],
]);
const NON_USER = new Set(['play_review@google.com']);

const profiles = [
  // Control: verified, matching (case-insensitively), consistent emailLower.
  { uid: 'verified', email: 'ver@X.com', emailLower: 'ver@x.com' },
  { uid: 'unverified', email: 'unv@x.com', emailLower: 'unv@x.com' },
  { uid: 'foreign', email: 'victim@x.com', emailLower: 'victim@x.com' },
  { uid: 'lower', email: 'low@x.com', emailLower: 'stale@x.com' },
  { uid: 'ghost', email: 'ghost@x.com', emailLower: undefined },
  { uid: 'google-null', email: 'g@x.com', emailLower: 'g@x.com' },
  // Skipped: a non-user account, and a profile with nothing stored.
  { uid: 'crawler', email: 'play_review@google.com', emailLower: 'play_review@google.com' },
  { uid: 'empty', email: '', emailLower: undefined },
];

test('planProfileFixes flags each reason, with the verified address or empty as the target', () => {
  const fixes = planProfileFixes(profiles, auth, NON_USER);
  const byUid = Object.fromEntries(fixes.map((f) => [f.uid, f]));

  assert.deepEqual(Object.keys(byUid).sort(), [
    'foreign',
    'ghost',
    'google-null',
    'lower',
    'unverified',
  ]);
  assert.deepEqual(byUid.unverified.reasons, ['unverified']);
  assert.equal(byUid.unverified.target, '');
  assert.deepEqual(byUid.foreign.reasons, ['foreign']);
  assert.equal(byUid.foreign.target, 'own@x.com');
  assert.deepEqual(byUid.lower.reasons, ['lower-mismatch']);
  assert.equal(byUid.lower.target, 'low@x.com');
  assert.deepEqual(byUid.ghost.reasons, ['no-auth-user']);
  assert.equal(byUid.ghost.target, '');
  assert.equal(byUid.ghost.authVerified, null);
  // A verified account with no top-level email has nothing it may store.
  assert.deepEqual(byUid['google-null'].reasons, ['foreign']);
  assert.equal(byUid['google-null'].target, '');
});

test('planProfileFixes stringifies a non-string stored email so it is flagged and compared as stored', () => {
  const [fix] = planProfileFixes(
    [{ uid: 'unverified', email: ['a@x.com', 'b@x.com'], emailLower: null }],
    auth,
    NON_USER
  );
  assert.equal(fix.email, '["a@x.com","b@x.com"]');
  assert.equal(fix.emailLower, '');
});

test('planMemberReview lists linked members whose email is not the verified address, never the matching ones', () => {
  const rows = planMemberReview(
    [
      { path: 'groups/g/members/ok', linkedUid: 'verified', email: 'VER@x.com', emailLower: 'ver@x.com' },
      { path: 'groups/g/members/hijack', linkedUid: 'foreign', email: 'victim@x.com', emailLower: 'victim@x.com' },
      { path: 'groups/g/members/unv', linkedUid: 'unverified', email: 'unv@x.com', emailLower: undefined },
      { path: 'groups/g/members/blank', linkedUid: 'foreign', email: '', emailLower: undefined },
      { path: 'groups/g/members/gone', linkedUid: 'deleted', email: 'd@x.com', emailLower: 'd@x.com' },
    ],
    auth
  );
  assert.deepEqual(
    rows.map((r) => r.memberPath),
    ['groups/g/members/hijack', 'groups/g/members/unv', 'groups/g/members/gone']
  );
  assert.equal(rows.find((r) => r.memberPath.endsWith('gone')).authVerified, null);
});

test('planApply writes the target with a matching emailLower (deleted for empty) and skips docs changed or deleted since the scan', () => {
  const fixes = planProfileFixes(profiles, auth, NON_USER);
  const current = new Map(
    profiles.map((p) => [p.uid, { exists: true, email: p.email, emailLower: p.emailLower }])
  );
  current.set('lower', { exists: true, email: 'low@x.com', emailLower: 'low@x.com' });
  current.set('ghost', { exists: false });

  const { updates, skipped } = planApply(fixes, current);

  assert.deepEqual(
    updates.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: 'foreign', email: 'own@x.com', emailLower: 'own@x.com' },
      { uid: 'google-null', email: '', emailLower: null },
      { uid: 'unverified', email: '', emailLower: null },
    ]
  );
  assert.deepEqual(
    skipped.sort((a, b) => a.uid.localeCompare(b.uid)),
    [
      { uid: 'ghost', reason: 'doc deleted since the scan' },
      { uid: 'lower', reason: 'email changed since the scan' },
    ]
  );
});

function audit(noAuth, profileCount, authUserCount = 1000) {
  return {
    authUserCount,
    profileCount,
    fixes: Array.from({ length: noAuth }, (_, i) => ({
      uid: `u${i}`,
      reasons: ['no-auth-user'],
    })),
  };
}

test('checkApplySafety refuses zero Auth users, even with --force-threshold', () => {
  for (const force of [false, true]) {
    const result = checkApplySafety(audit(0, 100, 0), force);
    assert.equal(result.ok, false);
    assert.match(result.reason, /zero users/);
  }
});

test('checkApplySafety refuses too many no-auth-user profiles unless forced', () => {
  // Over the count (26 of 10 000 = 0.26%).
  const overCount = checkApplySafety(audit(NO_AUTH_USER_MAX_COUNT + 1, 10_000), false);
  assert.equal(overCount.ok, false);
  assert.match(overCount.reason, /26 of 10000 profiles/);
  // Over the share (6 of 100 = 6%).
  assert.equal(checkApplySafety(audit(6, 100), false).ok, false);
  // The mixed-backend disaster: every profile looks orphaned.
  assert.equal(checkApplySafety(audit(500, 500, 3), false).ok, false);

  // At the limits: allowed.
  assert.deepEqual(checkApplySafety(audit(NO_AUTH_USER_MAX_COUNT, 10_000), false), { ok: true });
  assert.deepEqual(checkApplySafety(audit(5, 100), false), { ok: true });
  // Forced past the threshold (the owner checked the list).
  assert.deepEqual(checkApplySafety(audit(6, 100), true), { ok: true });
});
