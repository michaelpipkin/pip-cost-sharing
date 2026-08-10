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

Rules helpers:

```
function group(gid) { return get(/databases/$(database)/documents/groups/$(gid)).data; }
function isMember(gid) { return isSignedIn() && request.auth.uid in group(gid).memberUids; }
```

- **`groups/{groupId}`** — `read` if `isMember`; `list` if
  `request.auth.uid in resource.data.memberUids`; `create` if the payload's
  `memberUids` is exactly `[request.auth.uid]`; `update` if group admin **and**
  `request.resource.data.memberUids == resource.data.memberUids` (clients must
  never edit the array — only the trigger may); `delete` denied (the
  `deleteGroup` Cloud Function handles it).
- **All six subcollections** (`members`, `categories`, `expenses`, `splits`,
  `history`, `memorized`) — `read, write` if `isMember(groupId)`.
  `settleBatches` is server-only; deny client access outright.
- **Collection-group `members`** — `match /{path=**}/members/{memberId}` needs
  its own rule for the listener at `group.service.ts:99-102`. Scope to
  `resource.data.userRef == /databases/$(database)/documents/users/$(request.auth.uid)`
  so a user can only collection-group-read their own member rows.
- **Storage** — replace the blanket rule with a `firestore.get()` membership
  check on `groups/{groupId}/receipts/{expenseId}` (the only path written —
  `expense.service.ts:232-236`). Keep the existing 5MB and image/PDF
  constraints.

Also fold in two fixes found along the way:

- `firestore.rules` hardcodes only the **prod** admin UID, so admin rules fail
  under the emulator. `functions/src/index.ts:27-28` has both; add
  `cgrizSOG69QiNquzKOA69ls8clFm`.
- `admin-mail.service.ts:26,47,63` reads and deletes `mail` **from the
  client**, but `firestore.rules:9-11` is `allow read, write: if false` — the
  admin Mail tab is already broken today. Add an admin-UID read/delete
  exception mirroring the `app_errors` block at `:16-20`.

**Verify:** this is the phase that can break production, so exercise it in the
emulator first (`pnpm emu:data`) across every screen — groups list, expenses,
splits, settle-up, memorized, history, receipt upload *and* view, member
add/edit/remove, group create. Then run `pnpm e2e:local`. Deploy rules
separately from app code so rollback is a single console revert with no build.
Negative test worth doing explicitly: sign in as a user in group A and confirm
a direct read of a group-B document is denied.

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
