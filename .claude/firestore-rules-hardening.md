# Firestore & Storage Rules Hardening — Handoff

Status as of 2026-08-07: **planned, not started.** This doc is meant to be
self-contained so a fresh session can pick this up with no other context.

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
