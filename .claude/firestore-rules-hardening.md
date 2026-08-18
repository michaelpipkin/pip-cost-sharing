# Firestore & Storage Rules Hardening — Handoff

Status as of 2026-08-10: **Phases 0 and 1 done and deployed. Phase 2
intentionally paused**, waiting on
[[app-check-enforcement-followup.md]] — Storage/Firestore App Check
enforcement is actively being rolled out over the next 3-4 days (as of
2026-08-10), and per the Sequencing note at the bottom of this doc, Phase 2
should not start until that's fully enforced. Explicit user decision
2026-08-10: pause Phase 2 entirely rather than draft-ahead: **do not start
Phase 2 work until told App Check enforcement is fully done on Storage and
Firestore.** This doc is meant to be self-contained so a fresh session can
pick this up with no other context.

## Why

`firestore.rules` currently ends with:

```
match /{document=**} {
  allow read, write, delete: if request.auth != null;
}
```

`storage.rules` is equivalent — any authenticated user gets read/write/delete
on essentially the whole database and every receipt image, not just their own
groups. Firebase Auth sign-up is open, so creating an account is trivial. Per
[[app-check-enforcement-followup.md]], App Check enforcement is intentionally
**off** for Firestore, Storage, Functions, and Auth, so nothing else is
currently blocking this either.

**Intended outcome:** access to a group's data (expenses, splits, categories,
history, memorized, members) and its receipt images is scoped to that group's
members.

## The core blocker

Rules cannot run queries. "Is this user a member of group X?" must be
answerable by a direct document lookup, and today it isn't:

- Member docs use **auto-generated IDs** (`group.service.ts:324`), so
  `exists(.../members/$(uid))` is not possible.
- Membership lives in a **`userRef` DocumentReference** field
  (`src/app/models/member.ts:32`), which rules can't query by.
- `userRef` is **nullable** — unregistered invitees have `null`, and
  `functions/src/index.ts:492` sets it back to `null` to anonymize on account
  deletion. So re-keying member docs by UID is not viable either.

**Solution:** denormalize a `memberUids: string[]` array onto each group
document, maintained by a Firestore trigger. Rules then need one `get()` on
the parent group doc. This also makes Storage rules expressible via
`firestore.get()`.

## Phase 0 — Add `memberUids` (no rule changes, zero risk)

Nothing is enforced in this phase; the app behaves identically either way.
Goal is to get the data in place and verified before any rule depends on it.

1. **Sync trigger** — new `onDocumentWritten('groups/{groupId}/members/{memberId}')`
   in `functions/src/index.ts`. On any member write, recompute the group's
   `memberUids` from the full members subcollection (collect non-null
   `userRef.id` values) and write it to the group doc. Recomputing rather than
   `arrayUnion`/`arrayRemove` is deliberate — it's self-healing and catches
   every mutation path, including Admin SDK writes and the anonymization at
   `functions/src/index.ts:492`.
2. **Backfill script** — one-off over all groups doing the same computation.
   `scripts/db/` already has the harness (`lib.ts`, `run.ts`, `queries/`); add
   a query there rather than building new tooling.
3. **Close the create race** — `addGroup` (`group.service.ts:315-347`) writes
   the group doc and the creator's member doc in one batch, but the trigger
   fires ~1s later. Include `memberUids: [<own uid>]` in the group payload so
   the creator has access immediately. Add the field to the `Group` model
   (`src/app/models/group.ts`).

**Verify:** run the backfill against the emulator (`pnpm emu:data`), confirm
every group's `memberUids` matches its members' linked UIDs. Then add/remove a
member and confirm the trigger updates the array. Deploy and spot-check
production with `pnpm query`.

**Done 2026-08-10.** All three items implemented:
- `syncGroupMemberUids` trigger added to `functions/src/index.ts` (in its own
  "Group membership sync trigger" section, right before the payment
  notification section). Recomputes from the full members subcollection on
  every write and skips the update if the array is unchanged.
- Backfill query added at `scripts/db/queries/backfill-member-uids.ts`.
  Dry-run by default (`pnpm query backfill-member-uids`); pass `--apply` to
  write. Prints a before/after count table and also calls `writeTable()`.
- `Group.memberUids: string[] = []` added to `src/app/models/group.ts`.
  `addGroup` (`group.service.ts:315-349`) now sets
  `memberUids: [member.userRef!.id]` on the group payload at creation time,
  reused for both the batch write and the local store update — no more
  waiting on the trigger for the creator's own access. Updated
  `group.service.spec.ts` call sites to pass a `userRef` on the test member
  (previously omitted since nothing read it).

**Verified against the emulator** (Firestore + Functions, no seed-data
import — fresh in-memory per run, cleaned up after):
- Seeded a group with 2 members while only the Firestore emulator was
  running (functions emulator down) → `memberUids` stayed unset, confirming
  the "pre-migration" state the backfill script targets.
- `pnpm query backfill-member-uids` (dry run) correctly reported 1 group,
  0 → 2, correctly excluding a third member seeded with `userRef: null`
  (unregistered invitee). `--apply` wrote `['uid-alice', 'uid-bob']`; a
  second dry-run afterward reported nothing to do (idempotent).
- Restarted with the Functions emulator also running (had to `pnpm run
  kill-ports` first — a bare `firebase emulators:start` doesn't reuse the
  `start-emulators.js` wrapper's auto-kill). Confirmed live via the trigger,
  each checked ~2s after the write: adding a member appends its uid; deleting
  a member's doc removes its uid; setting `userRef: null` on a member (the
  account-anonymization path at `functions/src/index.ts:492`, now a few lines
  further down after this section was added) also removes its uid. All
  matched expectations; no manual data cleanup needed since it was emulator
  state.
- `pnpm exec ng test --watch=false --include
  src/app/services/group.service.spec.ts` — 22/22 pass, including a new test
  asserting `memberUids: ['user-1']` on the group `batch.set` call.
- `functions`: `pnpm run build` clean.

**Deployed to production 2026-08-10.** Dry-run against prod showed 174
groups needing backfill (all with `memberUids` currently unset, counts 1-9
members, none dropping to zero); `--apply` wrote them, and an immediate
re-run of the dry run confirmed "nothing to do." `firebase deploy --only
functions` succeeded — `syncGroupMemberUids` created (`ACTIVE`, Eventarc
trigger wired to `groups/{groupId}/members/{memberId}` writes), all 12
existing functions updated cleanly alongside it. Confirmed healthy via
`firebase functions:log` (container started, startup probe succeeded, no
errors) — no organic invocations yet at check time since no member docs had
been written since deploy; that'll show up as real usage happens. Phase 0 is
now fully live: existing groups have `memberUids`, new member writes keep it
in sync going forward, and new groups get it set at creation time.

## Phase 1 — Rewrite the queries that rules would reject (still no rule changes)

Two client query patterns are incompatible with any membership-scoped rule.
Firestore rejects an entire query if any matchable document would fail the
rule — it does not filter results.

1. **Group listing** — `group.service.ts:125-128` lists *every group in the
   database* with `orderBy('name')`, then filters client-side at `:199`.
   Replace with `where('memberUids', 'array-contains', uid), orderBy('name')`.
   Every returned doc then passes the rule. Requires a composite index — add
   via `pnpm sync-indexes`. The client-side `.filter()` at `:199` becomes
   redundant; the collection-group `members` listener at `:99-102` stays,
   since it supplies the per-group `active` / `groupAdmin` flags.
2. **New-user auto-link** — `user.service.ts:206-210` and `:270-274` run
   `collectionGroup('members') where email == X and userRef == null`. This is
   a cross-tenant search by a user who belongs to no group yet, so no
   membership rule can permit it. Move to a callable Cloud Function (Admin
   SDK), which is the correct boundary for this operation regardless of the
   rules work. Call sites are `createUserIfNotExists` and
   `updateUserEmailAndLinkMembers`.

**Verify:** registration with a pre-existing invite still links the member;
group list still loads with multiple groups. Cover both against the emulator.

**Done 2026-08-10.** Both items implemented:
- `group.service.ts` `getUserGroups`/`handleGroupsSnapshot`: the groups query
  now includes `where('memberUids', 'array-contains', user.id)` alongside
  `orderBy('name')`; the now-redundant client-side `.filter()` and its
  `userGroupIds` set were removed. Added a composite index
  (`memberUids` CONTAINS + `name` ASC) to `firestore.indexes.json` by hand
  (not yet deployed/synced — see note below).
- New `linkInvitedMembers` callable added to `functions/src/index.ts`
  (with `callableAppCheck`, consistent with the other 8 enforced callables).
  Takes `{email}`, uses `request.auth.uid` as the link target, finds
  `collectionGroup('members')` docs with that email and `userRef == null`,
  batch-updates them via the Admin SDK. Both `createUserIfNotExists` and
  `updateUserEmailAndLinkMembers` in `user.service.ts` now call this instead
  of querying/updating Firestore directly client-side; the now-unused
  `collectionGroup`/`query`/`where`/`getDocs`/`updateDoc` imports were
  removed from `user.service.ts`.
- Updated `group.service.spec.ts` (new `getUserGroups` describe block, 2
  tests) and `user.service.spec.ts` (replaced the Firestore-query-based
  member-linking tests with ones that mock the callable; removed the
  now-dead `makeSnap` helper and stale `query`/`where`/`collectionGroup`/
  `getDocs`/`updateDoc` spies). Full suite: 1178/1178 pass.

**Verified against the emulator** (Auth + Firestore + Functions, fresh
in-memory, script deleted after): seeded a group with an admin member and an
unregistered invitee (`userRef: null`, matching email) plus an unrelated
second group; signed up a real Auth-emulator user with the invitee's email
(mirroring actual registration); called `linkInvitedMembers` — it linked the
member (`membersLinked: 1`), the member doc's `userRef` now pointed at the
new user, and `syncGroupMemberUids` picked up the change and added the new
uid to the group's `memberUids` within ~2s. The `memberUids`
array-contains + orderBy('name') query then returned exactly the one group
the user belongs to, correctly excluding the unrelated second group —
confirming both the query rewrite and the composite index work together
correctly.

**Deployed to production 2026-08-10** through the normal path: this repo
has `.github/workflows/firebase-deploy.yml`, which deploys functions /
Firestore rules+indexes / hosting automatically on push to `release`
(git-diff-gated per area) and then auto-merges `release` into `main`. Phase
0 and Phase 1 were committed together (`dev@f579c5d`) so git caught up to
what Phase 0 already had live in prod, then PR'd and merged to `release`.

**First deploy attempt failed** on `Deploy Firestore Rules and Indexes`:
`403 The caller does not have permission` creating the new composite index
on `groups`. Root cause: the CI service account
(`github-action-756950903@pip-cost-sharing.iam.gserviceaccount.com`) was
scoped only for "Hosting and Cloud Functions" (per its own IAM description)
— Firestore/Datastore index management was never included. Functions had
already deployed successfully by that point (it's an earlier step), so
`linkInvitedMembers` was live; only the index creation and everything after
it (hosting deploy, release→main merge) were blocked.

**Fixed in two parts:**
1. Deployed the index manually via an authenticated `firebase deploy --only
   firestore:indexes` session (not the CI service account) to unblock
   immediately - confirmed identical to what CI was attempting.
2. **User action 2026-08-10**: granted the CI service account the `Cloud
   Datastore Index Admin` role (`roles/datastore.indexAdmin`) via GCP
   Console IAM, so future index changes deploy through CI without the
   manual-deploy workaround. Un-flagged residual risk: rules deploys have
   only ever been a no-op skip (unchanged content) for this account, so
   whether it can *write* new rules content is still unverified - worth
   watching the first time `firestore.rules` itself actually changes (i.e.
   Phase 2's deploy).

Re-ran the failed GitHub Actions job (`gh run rerun --failed`) after the
manual index fix - it completed clean: functions, rules+indexes, hosting,
and the release→main merge all succeeded. A separate small drift fix (an
unrelated pre-existing `mail.expireAt` TTL field override that existed in
production but was missing from `firestore.indexes.json` - unrelated to this
work, just discovered along the way) was committed separately with a
`[no-deploy]` tag since it was already live.

## Phase 2 — Tighten the rules (the actual security win)

**Redesigned 2026-08-18** against the current codebase (see "Re-grounding"
note below) — this supersedes the original sketch above. Two gaps in the
original plan were found and closed before writing any rule:

### Gap 1: `memberUids` doesn't distinguish active from left members

`leaveGroup()` (`member.service.ts:265-298`) sets
`{active: false, leftGroup: true, groupAdmin: false}` on the member's own
doc but does **not** null `userRef` (it's kept specifically so
`rejoinGroup()` can self-service restore access) — the doc is only deleted
outright if the member has zero historical splits. `syncGroupMemberUids`
computes `memberUids` from `userRef.id` alone, with no `active` check. So
under a naive `isMember(gid) { uid in group(gid).memberUids }` rule, a
member who left a group (but has history, so their doc survives) keeps
**full read/write access forever**.

**Decision (user, 2026-08-18):** read access via `memberUids` is fine/wanted
(the app's "left groups / rejoin" UI needs to read the group to show it and
let the user rejoin) but **write** access to operational data must require
current active membership. Fixed by adding a second denormalized array,
**`activeMemberUids`**, computed by the same trigger from members where
`active == true` (in addition to `userRef` being non-null). `isMember()`
(broad, read) checks `memberUids`; a new `isActiveMember()` (narrower,
write) checks `activeMemberUids`.

### Gap 2: "update if group admin" was never actually specifiable

The original sketch's group-doc update rule said "if group admin" without
saying how — rules can't query the members subcollection to find "is this
uid an admin here" any more than they could originally query "is this uid a
member here" (the exact problem `memberUids` was invented to solve). Same
fix, third array: **`adminUids`**, computed by the same trigger from members
where `active == true && groupAdmin == true`. `isGroupAdmin()` checks it.

All three arrays are maintained together by one recomputation pass in
`syncGroupMemberUids` (functions/src/index.ts:1039, ADMIN_UID constants now
at :30-31 — drifted from the original :27-28 citation) — no extra reads,
just three filtered projections over the same `members` snapshot instead of
one.

### Gap 3 (found empirically, see below): `addGroup()`'s atomic batch breaks a naive create rule

`addGroup()` (`group.service.ts:356-391`) currently creates the group doc,
its first member doc, and a default category doc all in **one
`writeBatch()`**. A member-doc `create` rule that checks
`isActiveMember(groupId)` needs `get()` on the group doc — but **empirically
verified against the emulator** (a standalone `testA`/`testB` rules
experiment, not committed) that a sibling document created in the *same*
`writeBatch()` — and, tested for completeness, the *same* `runTransaction()`
too — is **not visible** to another document's rule evaluation via `get()`
in that same commit; the `get()` sees the pre-commit (nonexistent) state and
the rule evaluation errors out (denies). This would have silently broken
new-group creation in production had it not been caught before implementing.

**Fix:** `addGroup()` is restructured into two sequential awaited steps
instead of one batch: (1) create the group doc alone — its own `create` rule
only inspects its own payload, no `get()` needed, so this is unaffected; (2)
*after that commits*, batch the member doc + default category doc together
— now the group doc genuinely exists, so `isActiveMember(groupId)`'s `get()`
resolves normally (this is a normal single-document `get()`, not a
collection-group query, so it doesn't hit the query-validation constraint
that the `memberUids`/collection-group rules exist to work around), and no
special-case "first member" rule carve-out is needed anywhere. Trade-off:
loses batch-wide
atomicity between the two steps — a crash between them leaves an orphaned
group with no members/category. Mitigated with a best-effort cleanup
(delete the group doc) if step 2 throws; accepted as a much smaller risk
than the alternative (a rule hole exploitable to self-insert as admin into
someone else's existing group — see "why not just skip the check" below).

*Why not just allow unconditional self-creation of an active-admin member
doc instead of fixing the batching?* Considered and rejected: without
checking the group's current state at all, nothing would stop a user from
creating a member doc for themselves (`userRef: self, active: true,
groupAdmin: true`) under **any existing group's ID**, including one they
were never invited to — and the trigger (Admin SDK, bypasses rules) would
faithfully sync that uid into `memberUids`/`activeMemberUids`/`adminUids`
immediately afterward, silently granting them full access and fake admin
status. The sequential-write fix closes this without weakening the create
rule at all.

### Final design

Helpers (nested under `match /groups/{groupId}` so `groupId` is in scope):

```
function group(gid) { return get(/databases/$(database)/documents/groups/$(gid)).data; }
function isMember(gid) { return isSignedIn() && request.auth.uid in group(gid).memberUids; }
function isActiveMember(gid) { return isSignedIn() && request.auth.uid in group(gid).activeMemberUids; }
function isGroupAdmin(gid) { return isSignedIn() && request.auth.uid in group(gid).adminUids; }
```

- **`groups/{groupId}`** — works directly off `resource.data`/
  `request.resource.data` (it *is* the document being evaluated, so no
  extra `get()` needed here — the helpers above are for the subcollections):
  `read` if `request.auth.uid in resource.data.memberUids`; `list` if same
  (must match the `where('memberUids','array-contains', uid)` query's own
  filter field exactly, or Firestore rejects the query outright — this is
  why the original plan's version of this line is correct and unchanged);
  `create` if `request.resource.data.memberUids == [request.auth.uid] &&
  activeMemberUids == [request.auth.uid] && adminUids == [request.auth.uid]`;
  `update` if `isGroupAdmin(groupId)` **and** all three arrays in
  `request.resource.data` equal their current `resource.data` values
  (clients/admins must never edit them — only the trigger may); `delete`
  denied (the `deleteGroup` Cloud Function handles it, Admin SDK).
- **`members/{memberId}`** — `read` if `isMember(groupId)`; `create` if
  `isActiveMember(groupId)` (safe now for the *first* member too, given the
  Gap-3 fix); `update, delete` if `isActiveMember(groupId)` **or**
  `resource.data.userRef == /databases/$(database)/documents/users/$(request.auth.uid)`
  — the second clause is required for `rejoinGroup()`
  (`member.service.ts:304-306`, a self-write made *while inactive*, the
  exact state the write is trying to escape) and
  `updateAllMemberEmails()`/other self-email-sync paths that touch a user's
  own member doc across groups they may not currently be active in.
  (`leaveGroup()`'s own self-update/self-delete is already covered by
  `isActiveMember` alone, since the caller is still active at the moment
  they call it — the arrays reflect pre-write state.)
- **`categories`, `expenses`, `splits`, `history`, `memorized`** — `read` if
  `isMember(groupId)`; `write` if `isActiveMember(groupId)`.
- **`settleBatches`** — `read, write: if false` (server-only, Admin SDK).
- **Collection-group `members`** — `match /{path=**}/members/{memberId}`,
  needed for the listener at `group.service.ts:99-102` (unchanged citation —
  did not drift). `allow read: if isSignedIn() && resource.data.userRef ==
  /databases/$(database)/documents/users/$(request.auth.uid)` — must match
  the listener's own `where('userRef', '==', user.ref)` filter exactly, same
  query-validation reason as the groups list rule above.
- **Storage** — replace the blanket rule with a `firestore.get()`-based
  membership check on `groups/{groupId}/receipts/{expenseId}`. Confirmed
  (via grep, not just the original two-line citation) that all five
  `ref(this.storage, ...)` call sites across `addExpense`, `updateExpense`,
  and `deleteExpense` in `expense.service.ts` use this exact same path
  shape — one rule covers all of them. `read, delete` if
  `request.auth.uid in firestore.get(/databases/(default)/documents/groups/$(groupId)).data.memberUids`;
  `write` if `request.auth.uid in ...activeMemberUids` **and** the existing
  5MB + image/PDF constraints. `scanReceipt` (OCR) doesn't touch Storage at
  all (confirmed via grep) — irrelevant to this rule.
- **`users/{userId}`** — left as the current blanket
  `allow read, write, delete: if request.auth != null` — explicitly Phase 3,
  not touched here.

Also fold in two fixes found along the way (both still outstanding, since
nothing has touched `firestore.rules` yet):

- `firestore.rules` hardcodes only the **prod** admin UID, so admin rules
  fail under the emulator. `functions/src/index.ts:30-31` (drifted from the
  original `:27-28` citation) has both; add `cgrizSOG69QiNquzKOA69ls8clFm`.
- `admin-mail.service.ts` reads and deletes `mail` **from the client**
  (`getMailDocuments`'s `getDocs` call is now at line 30, not the original
  `:26` citation — the query itself spans 25-29; `deleteMailDocument`/
  `deleteMailDocuments` at `:47`/`:63` matched the original citation
  exactly), but `firestore.rules:9-11` is `allow read, write: if false` —
  the admin Mail tab is already broken today. Add an admin-UID read/delete
  exception mirroring the `app_errors` block at `:16-20`.

### Re-grounding note (2026-08-18)

Before any of the above was designed, re-checked everything this phase
depends on against ~11 commits that landed since the plan was first
written (App Check fixes, an `emailLower` email-matching cutover, and the
leave/rejoin-group feature). Findings that mattered: the leave/rejoin
feature (Gap 1, above) and several stale line-number citations (corrected
inline above: `functions/src/index.ts` ADMIN_UID constants and the
`userRef: null` anonymization writes — now two separate writes at `:494`
and `:502`, not one at `:492`; `group.service.ts`'s `addGroup` citation).
Findings that did **not** require a design change: the new `emailLower`
field (server-side-only, Admin SDK writes, no rule carve-out needed — same
non-problem as `email` always was under a coarse collection-level rule);
`linkInvitedMembers` now has three call sites instead of two (signup-time
call removed, a page-load call added in `GroupsComponent`) — Admin-SDK-only
either way, doesn't touch rules; the App Check token-race fixes changed
*when* the client first touches Firestore after login but not *what* it's
allowed to do, so no rules interaction.

**Verify:** this is the phase that can break production, so exercise it in
the emulator first (`pnpm emu:data`) across every screen — groups list,
expenses, splits, settle-up, memorized, history, receipt upload *and* view,
member add/edit/remove, group create, **and now also leave-group /
rejoin-group** (not covered by the original plan's verify list, since that
feature didn't exist yet when it was written). Then run `pnpm e2e:local`.
Negative tests worth doing explicitly: sign in as a user in group A and
confirm a direct read of a group-B document is denied; sign in as a member
who left group A (doc survives, `active:false`) and confirm they can still
read group A but a write (e.g. add an expense) is denied, then confirm
`rejoinGroup()` itself still succeeds despite that same-inactive state.
Deploy rules separately from app code so rollback is a single console
revert with no build — in practice this repo's CI bundles functions/
rules+indexes/hosting into one job per push to `release`, so "separately"
means as its own PR/deploy rather than bundled with unrelated app changes,
not a literally separate CI run.

**Done 2026-08-18, emulator only — not yet deployed.** Wrote a
comprehensive scripted verification (`scripts/db/phase2-rules-test.ts`,
deleted after running — not committed) against a full local emulator
suite (auth/firestore/functions/storage), using real signed-up personas
(alice, bob, carol) plus the `ADMIN_UID_EMU` account, covering every
scenario above: `addGroup`'s actual sequential-write flow end-to-end,
active-member read/write, left-member read-allowed/write-denied at *both*
Firestore and Storage, `rejoinGroup()`'s self-write-while-inactive
carve-out, full cross-group isolation (Firestore doc/subcollection/
Storage), admin-only group update with array-tamper protection (even the
admin can't edit the three arrays directly), non-admin-member update
denial, the collection-group query-validation behavior (own-row query
allowed, other's-row-filtered query rejected outright by Firestore, not
just returning empty), and the `mail`/`app_errors`/`admin_config`
admin-uid exceptions. **30/30 checks passed.** `pnpm test` in `functions/`
(95/95, including 8 new tests for `computeGroupMemberArrays`/
`syncGroupMemberUidsInternal`) and `pnpm exec ng test` at the root
(1255/1255) both still pass. `pnpm e2e:local` not yet run.

**Incident during verification, resolved:** an early version of the test
script forgot to point the Admin SDK's auth client at the emulator before
calling `createUser({uid: ADMIN_UID_EMU, ...})`, which went to **real
production Firebase Auth** instead (the client Firestore/Storage calls
were correctly emulator-scoped throughout - only this one Admin SDK auth
call wasn't). This created a real account with UID `cgrizSOG69QiNquzKOA69ls8clFm`
(the emulator-only admin UID) and email `admin@test.com` - not
admin-privileged in production *today*, but it would have become a real
admin the instant this phase's rules deployed. Caught immediately (the
second attempt failed with "already exists," confirming the first
succeeded); the user deleted the account from production Auth before
anything deployed. Fixed the script to hard-fail if the emulator env vars
aren't set before any Admin SDK initialization, and switched personas
needing a fixed UID to `admin.auth().createUser()` against the *emulator*
instead of `createCustomToken()` (which needs real signing credentials
not available in this sandbox, and was the reason the script reached for
a fixed-UID admin path in the first place).

### Refinement from local UI testing (2026-08-18)

User ran the emulator-based checklist above by hand (not the scripted
verification) and found the scripted pass had missed real gaps because it
tested via direct SDK calls, not through the actual app UI/components.
Findings:

1. **Categories are admin-only in the UI** (`categories.component.ts`'s
   `onRowClick`/the Add Category button), but the rule allowed any active
   member to write. Investigated further and found this same
   UI-only-no-defense-in-depth pattern elsewhere too - see below.
2. Left-member access: initially assessed (wrongly - see the correction
   below, dated the same day) as "already correct as designed" based on the
   main Groups page already hiding left groups from the switcher
   client-side. **This was corrected after further user clarification -
   see "Left-member access, corrected" below.**
3. A real, unrelated app bug, fixed separately from the rules:
   `edit-member.component.ts`'s `leaveGroup()` handler called
   `groupStore.removeGroup()` after a successful leave, which hard-deletes
   the group from `allUserGroups` - but `leftUserGroups` (which gates the
   My Account → Groups tab) is just a filter *over* `allUserGroups`, so the
   group vanished entirely instead of reappearing as a rejoin candidate.
   Only fixed itself on next login (full store reload). Fix:
   `MemberService.leaveGroup()` now returns `{ deleted: boolean }`
   (`true` when the member doc is deleted outright - no historical splits;
   `false` when it's kept and re-tagged `active:false, leftGroup:true`),
   and the component either calls the existing `removeGroup()` (deleted
   case) or a new `GroupStore.patchGroupMembership()` (kept case, patches
   `userActiveInGroup`/`userLeftGroup`/`userIsAdmin` in place instead of
   removing the group).

Investigated all four "is this really admin-only" candidates (categories,
members, splits, history) before changing any rule, per user's explicit
request not to guess. Findings, all confirmed by reading the actual
mutating methods, not just the UI gating:

- **categories** - admin-only in UI, zero defense-in-depth in
  `addCategory()`/`EditCategoryComponent`, and no legitimate non-admin
  write path exists at all (the initial "Default" category is created by
  `addGroup()`'s creator, who is always admin). **Tightened to
  `isGroupAdmin(groupId)`.**
- **members** - add/remove/promote-to-admin admin-only in UI
  (`members.component.html`'s Add Member button,
  `edit-member.component.html`'s `groupAdmin` toggle), again zero
  defense-in-depth. This one mattered most: the old rule
  (`isActiveMember(groupId) || self`) let *any* active member write to
  *any other* member's doc via the SDK - including flipping their own
  `groupAdmin` to `true`, a real privilege-escalation path, or removing
  someone else. **Tightened: `create` now requires `isGroupAdmin(groupId)`;
  `update, delete` now require `isGroupAdmin(groupId) || self` (dropped the
  "any active member" clause, kept the self-write carve-out for
  leave/rejoin/self-edit).** Verified this doesn't break `addGroup()`'s
  sequential-write fix - the creator is already in `adminUids` from the
  group doc's own creation, before the member/category batch runs.
- **history** - cleanly separable, unlike splits (below): a history doc is
  *only* ever created via the legitimate settle-up flow
  (`split.service.ts`'s `paySplitsBetweenMembers`/`settleGroup`, any active
  member) and *only* ever updated/deleted via the admin-only "unpay"
  reversal - `history.service.ts` has exactly three methods
  (`unpayHistory`, `unpaySingleSplitFromHistory`, `unpayGroupSettle`), all
  three admin-gated in the UI, and nothing else touches an existing
  history doc. **Split into `create: isActiveMember(groupId)` and
  `update, delete: isGroupAdmin(groupId)`.**
- **splits** - investigated but left unchanged. The admin-only "mark
  paid/unpaid" correction (`expenses.component.ts`'s
  `markSplitPaidUnpaid()`) and the ordinary settle-up flow both call
  `split.service.ts`'s `updateSplit()`/write the identical `{paid: bool}`
  shape to the same fields - a rule has no way to distinguish "an admin
  correcting" from "a member settling their own split," since both are the
  same write. Also concluded this isn't really a security boundary: a
  non-admin bypassing the UI to flip their own split's paid status directly
  reaches a state they could already reach legitimately through settle-up,
  so there's no actual exploit being left open. **Stayed
  `isActiveMember(groupId)`.**
- **expenses, memorized** - confirmed genuinely open to any active member
  in the UI (no admin gating found anywhere), so left unchanged at
  `isActiveMember(groupId)`.

Implemented directly in `firestore.rules` (comments there explain each
decision inline, same reasoning as above) and in the leave/rejoin
reactivity fix (`member.service.ts`, `group.store.ts`,
`edit-member.component.ts`, plus their specs). Root `ng test` suite green
except one pre-existing, unrelated failure the user confirmed is their own
in-progress local change (`yes-no-na.pipe.spec.ts` expects `'Yes'`/`'No'`
but the pipe now intentionally returns `'✓'`/`''` - not touched here).
User is verifying this refinement locally via their own running emulator
rather than the scripted pass; not re-run here to avoid mutating their
active session's test data.

### Left-member access, corrected (2026-08-18, same day)

The initial assessment above (item 2) was wrong. User's actual, explicit
spec: **a member who voluntarily leaves a group loses all access to that
group's data - full stop - except for the group's name**, needed only to
show it in the self-service "rejoin" dropdown
(`account-group-membership.component.ts`). Not "hidden from the main
switcher but still readable" (what was implemented and verified in the
scripted pass), and not something to be resolved by relying on the
client-side `activeUserGroups` filter as a substitute for a real
authorization boundary - the whole point of this phase is that client-side
filtering isn't enforcement.

**Fixed:** `memberUids` (the broad "ever linked" array) is now used
*exclusively* for the group document's own `read`/`list` rules - the one
piece of data (the name) a left member is allowed to see. Every
subcollection's `read` rule was changed from `isMember(groupId)` to
`isActiveMember(groupId)`: `members`, `categories`, `expenses`, `splits`,
`history`, `memorized` all now require *active* membership to read, not
just historical membership. Storage's `read`/`delete` rule for receipts
was changed the same way (`memberUids` → `activeMemberUids`), so a left
member can't download a receipt image either. The `isMember(gid)` helper
function became entirely unused after this change and was removed from
`firestore.rules`.

This does **not** affect the collection-group `members` rule
(`match /{path=**}/members/{memberId}`, own-row-only via
`resource.data.userRef == ownUserRef()`) - that one intentionally has no
active-status condition at all, because it's how
`group.service.ts`'s `getUserGroups()` listener learns a member's own
`leftGroup`/`active` flags in the first place (across every group, active
or not). Revoking that would make it impossible to ever populate
`userLeftGroup` for the rejoin list to filter on - the group name is still
reachable (via the group doc's own `memberUids`-based read), just none of
its subcollection data.

Net effect: a left member can see their departed groups named in the
rejoin dropdown and nothing else about them - no expenses, splits, history,
categories, memorized templates, other members' info, or receipt images.

### Client-side access loophole, found by user testing (2026-08-18)

Even after the rules correction above, the user found the loophole was
still reachable in the app: after leaving a group (as a test member with no
other active groups), no new group got auto-selected, but the nav bar still
let them click through to Expenses and see the left group's data. Root
cause was **entirely client-side**, not a rules gap - confirmed the rules
correctly deny a fresh read; the problem was stale local state that was
never cleared to force a fresh read in the first place. Two distinct bugs,
both in `group.service.ts`:

1. **`resolveDefaultGroupRef()` didn't check `userActiveInGroup`.** It only
   self-healed a `defaultGroupRef` that was completely gone from `groups`
   (e.g. deleted out-of-band) - but a left-but-still-linked group is still
   present in `groups` (memberUids keeps it there for the rejoin list), so
   a stale `defaultGroupRef` pointing at it was treated as "still valid."
   `autoSelectGroup()`'s `else if (defaultGroupRef)` branch would then
   silently re-select the just-left group as current. (Its sibling
   check - "keep the cached currentGroup if still present" - was already
   correctly hardened with a `userActiveInGroup` check; this one wasn't.)
   This can be triggered by an ordinary race: the member-doc write's own
   listener can refire and re-run this resolution before the user's local
   `defaultGroupRef` gets cleared by the rest of `leaveGroup()`'s handler.
   **Fixed:** `resolveDefaultGroupRef` now nulls out the ref whenever the
   matching group's `userActiveInGroup` isn't `true`, not just when the
   group is entirely absent.
2. **Nothing cleared per-group listeners/stores when no replacement group
   gets selected.** Switching TO a valid group already self-heals fine -
   each service's `getGroupXxx()` unsubscribes its own previous listener
   before resubscribing, naturally overwriting stale store data. But
   `autoSelectGroup()`'s final `else` branch (no group to fall back to)
   only cleared `currentGroup`/`localStorage` - it never stopped
   `memberService`/`categoryService`/`memorizedService`/`splitsService`/
   `historyService`'s listeners, and never cleared `CategoryStore`/
   `MemberStore`/`ExpenseStore`/`MemorizedStore`/`HistoryStore`/
   `SplitStore`. Since `ExpenseService` fetches via one-off `getDocs()`
   (not a listener) into `ExpenseStore`, and the other five ARE live
   listeners, either way whatever was loaded before leaving just sat there
   indefinitely, visible to any component reading those stores/signals -
   this is what actually explained "I can still see group expenses."
   **Fixed:** added `GroupService.clearCurrentGroupData()` (stops all five
   listeners, clears all six stores) and call it from that `else` branch.
   `logout()` was refactored to reuse it too, which as a side effect now
   also clears the stores on logout instead of relying entirely on the next
   login's `UserService.initializeAuth()` to do it.

`GroupService` needed six new store injections
(`CategoryStore`/`ExpenseStore`/`MemberStore`/`MemorizedStore`/
`HistoryStore`/`SplitStore`) to call their clear methods directly, mirroring
the pattern `UserService.initializeAuth()` already uses on login. Added two
regression tests in `group.service.spec.ts` (stale-`defaultGroupRef`
self-heal, and per-store/listener clearing verified by pre-populating each
store and asserting it resets) - both in the existing
`describe('auto-select and userActiveInGroup')` block, reusing its
established multi-callback-capture pattern. Root `ng test` suite green
(1256/1259 - same 3 pre-existing, unrelated `yes-no-na.pipe.spec.ts`
failures as before).

**Verified by hand 2026-08-18 (user, local emulator):** left a group with
one other active group remaining → that one correctly auto-selected. Added
a group, rejoined the test group, then left it again with two other active
groups present → correctly left nothing auto-selected (ambiguous, matches
the `activeGroups.length === 1` guard). Pasted a direct URL for an expense
in the just-left group → redirected back to Groups (route guard holds up
even on direct navigation, not just nav-bar clicks). Loophole confirmed
closed.

### Production backfill for activeMemberUids/adminUids (2026-08-18)

Before any deploy: production only had `memberUids` populated (from the
Phase 0 backfill) - `activeMemberUids`/`adminUids` didn't exist on any of
the 174 existing groups, since those fields didn't exist when that backfill
ran. Deploying the new rules before backfilling would have completely
locked out every existing group (missing `activeMemberUids` → `isActiveMember`
errors/denies for everyone) until the backfill caught up - new groups
created after deploy would've been fine (`addGroup()` sets all three arrays
directly), but all 174 existing ones would break in the gap. Since the CI
pipeline deploys functions and rules together with no manual gap between
them, backfilling had to happen *before* merging anything, not after.

**Done 2026-08-18** - user ran `pnpm query backfill-member-uids` (dry run),
`--apply`, then dry run again to confirm idempotence ("nothing to do"), all
against production. Clears the way for the CI deploy.

## Phase 3 — `users` collection (deferred, tracked here so it isn't lost)

`users/{uid}` is read cross-user for payment handles and `emailOptOut`
(`user.service.ts:288-323`, `:386-460`, `:515-567`) and **written** cross-user
for `defaultGroupRef` clearing (`group.service.ts:358-366`,
`member.service.ts:222-228`). Until this phase lands, any signed-in account
can read every user's email and Venmo/PayPal/CashApp/Zelle handles.

Agreed approach: a **callable Cloud Function gatekeeper** that verifies the
caller shares a group with the target user and returns only the payment
fields. The cross-user `defaultGroupRef` writes move server-side too. Then
`users` rules become read/write own doc only, plus the `email` lookup in
`member.service.ts:139-146` / `:187-195` (also a candidate to move
server-side).

Left for a separate pass — Phase 2 is the larger win and is independently
deployable.

## Sequencing note

Phases 0 and 1 are safe to deploy on any normal day; they change no
authorization behavior. Phase 2 should go out on a day someone is watching,
and ideally **after** App Check enforcement is settled — that follow-up
([[app-check-enforcement-followup.md]]) has its own staged rollout, and
interleaving two authorization changes makes attributing any breakage much
harder.
