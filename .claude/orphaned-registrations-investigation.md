# Orphaned Registrations Investigation — Handoff

Status as of 2026-08-25: **Just opened, not yet root-caused.** Written up
so a fresh session can pick this up with no other context - deliberately
kept separate from [[app-check-enforcement-followup.md]] because the
evidence below rules out App Check as the cause, even though this bug
surfaces the same *symptom* (a Firebase Auth account with no matching
Firestore `users/{uid}` document) that App Check's cold-boot race caused
earlier in that investigation.

## The bug

Some users end up with a real Firebase Auth account but **no Firestore
`users/{uid}` document ever created**. Practically: they can "sign in"
(Auth succeeds), but the app can't load their profile, and depending on
what's enforced at the time, either the app breaks outright or - as of
2026-08-19, with Firestore App Check enforcement off - they'd see a
degraded-but-not-fully-broken experience (Firestore reads succeed
against a doc that doesn't exist yet, so `createUserIfNotExists()`
*should* just create one... except it isn't).

## Why this is NOT the App Check issue, despite the identical symptom

[[app-check-enforcement-followup.md]] spent a lot of effort establishing
that `createUserIfNotExists()` → `getUserDetails()` → `getDoc()` throwing
`permission-denied`/`appCheck/throttled` before `setDoc()` ever runs was
*a* cause of this same symptom - and that mechanism is well understood,
consistently reproduces a specific error signature, and is confirmed via
`additionalInfo` (platform/userAgent) on every occurrence.

**Every currently-orphaned registration has zero `app_errors` entries
near their registration time** - checked directly via
`scripts/db/queries/inspect-orphaned-registration.ts` (already written,
see below). Every confirmed App-Check-caused case up to this point *did*
produce a caught, logged error (`permission-denied`, `appCheck/throttled`,
`unavailable`). Silence here means the code isn't throwing and being
caught - it's starting and never finishing, which is a structurally
different failure than anything in the App Check doc.

Also rules out a Google-sign-in-specific bug: the affected set mixes
`google.com` and plain `password` auth providers.

## Current evidence (as of 2026-08-25)

Query `pnpm query orphaned-registrations` (already written, `scripts/db/
queries/orphaned-registrations.ts` - Auth users from the last N days
cross-referenced against Firestore `users` doc existence) currently shows
5 orphaned accounts:

| Email | Provider | Created | Last refresh | app_errors nearby |
|---|---|---|---|---|
| miahujol33@gmail.com | google.com | 8/19 | same as created | 0 |
| muhammadnasir49133@gmail.com | google.com | 8/18 | +2h36m same day | 0 |
| dennisgoodnesschinaza@gmail.com | **password** | 8/19 | same as created | 0 |
| vd4253481@gmail.com | google.com | 8/22 | same as created | 0 |
| adebowaleogunleye997@gmail.com | google.com | 8/24 | **+1 day** | 0 |

Two other previously-orphaned accounts (`muhamudmusa07048@gmail.com`,
`fiddausisani308@gmail.com`) **self-healed** between checks - confirms
that when `createUserIfNotExists()` *does* get a chance to run to
completion, it correctly creates the missing doc (matching its own
"check for existing doc first" logic - safe to just let it run again,
no manual repair needed once the underlying cause is fixed).

**The `lastRefresh` puzzle is now resolved (2026-08-25 follow-up).** Read
the actual implementation in `src/app/services/user.service.ts`:
`initializeAuth()` registers `this.auth.onAuthStateChanged(...)` -
**never `onIdTokenChanged`** (confirmed via repo-wide grep, zero
matches). Firebase's SDK refreshes the ID token silently on its own
periodic cycle and updates Auth's `lastRefreshTime` metadata for that -
but a silent token refresh does **not** re-invoke `onAuthStateChanged`.
So `muhammadnasir49133` (+2h36m) and `adebowaleogunleye997` (+1 day)
never actually re-entered `initializeUserSession()` at all; the token
just refreshed quietly without the app being reopened enough to trigger
the callback again. This was misread as "the user came back and it
still failed" - it actually means "the user's session was still alive
in the background, and nothing ran a second time." No longer
contradicts the leading hypothesis below - it's consistent with it.

## Leading hypothesis, now better supported

Most consistent with the evidence: the user closes the tab, backgrounds
the app, or navigates away **after Firebase Auth succeeds but before
`createUserIfNotExists()`'s `setDoc()` call resolves** - the async chain
gets abandoned mid-flight rather than throwing, so nothing is ever
logged.

Confirmed sign-in flow details relevant to this (`src/app/features/auth/
login/login.component.ts`): **popup-only**, never `signInWithRedirect`
(zero matches for `signInWithRedirect`/`getRedirectResult` repo-wide) -
so this isn't a page-reload/navigation-context issue, it's a live tab
being closed or backgrounded mid-flight. Confirmed also from `UserService
.initializeUserSession()`: there's an `await appCheckTokenReady()`
**before** the `createUserIfNotExists()` call, plus several synchronous
store-clear calls ahead of that - every bit of that is dead time sitting
inside the exact vulnerable window between "Auth succeeded" and "Firestore
doc exists," widening the chance a user navigates away before `setDoc()`
resolves. Shrinking or reordering that window (e.g. calling
`createUserIfNotExists()` first, doing store-clears and App Check
readiness after) is a plausible low-risk mitigation independent of full
root-cause confirmation.

Confirmed absent repo-wide: no `beforeunload`/`visibilitychange`/
`pagehide` listener anywhere in app code (only an unrelated Capacitor
AdMob mock hit) - there is currently no mechanism to detect or log a
mid-flight abandonment when it happens, which is why every orphaned case
shows zero `app_errors`.

## Mitigation applied (2026-08-25, step 1): shrink the client-side window

Changed `UserService.initializeUserSession()` in `src/app/services/
user.service.ts` to run `appCheckTokenReady()` and the initial user-doc
read **concurrently** (`Promise.all`) instead of sequentially.
`appCheckTokenReady()` can wait up to its 10s `timeoutMs` default -
since Firestore App Check enforcement is currently off (see
[[app-check-enforcement-followup.md]]), that wait was buying nothing
for this call while directly widening the mid-flight-abandonment
window this doc is about. `tokenResult` is still awaited and still
logged when not ready, just no longer gates the Firestore call.

**Important caveat, left as a code comment at the call site:** this is
only safe *because* Firestore App Check enforcement is off right now.
That enforcement was tried once already and reversed on 2026-08-19
specifically because it broke new registrations via this exact
cold-boot race (App Check token not ready yet -> Firestore write
rejected). If Firestore enforcement is ever turned back on, this must
revert to sequential (await `appCheckTokenReady()` fully before any
Firestore call in this method) or that bug returns. Anyone re-enabling
Firestore App Check enforcement should re-read this section and the
code comment in `user.service.ts` first.

## Mitigation applied (2026-08-25, step 2): move doc creation server-side

Step 1 only shrank the window - `createUserIfNotExists()` itself still
had an unavoidable getDoc-then-setDoc async gap a closed tab could
land in. Closing that fully requires the doc to not depend on the
client's tab staying open at all, which is the standard Firebase
pattern for this exact problem:

- **New Cloud Function** `createUserProfileOnSignUp` in `functions/src/
  user-onboarding.ts` (exported from `functions/src/index.ts`) - a
  `firebase-functions/v1` Auth `onCreate()` trigger (v2 doesn't have
  Auth triggers yet; mixing v1 and v2 exports in one codebase is
  supported). Fires server-side via the Admin SDK the moment a Firebase
  Auth account is created, independent of the client entirely. Writes
  the same default-fields doc `UserService` used to create, via
  `set(..., { merge: true })` so it stays idempotent if it ever runs
  twice for the same uid.
- **Client change** in `UserService.initializeUserSession()`: for a
  brand-new account (no existing doc), the client now calls the new
  `waitForServerCreatedUser()` - an `onSnapshot` listener that resolves
  the instant the trigger's write lands (push-based, not polling), with
  an 8s timeout (`SERVER_USER_PROFILE_WAIT_TIMEOUT_MS`). Only if that
  times out does it fall back to the old `createUserIfNotExists()`
  client-side write - now a rare safety net (function outage or an
  unusually slow cold start) rather than the primary path.
- `createUserIfNotExists()` itself is unchanged and still directly
  unit-tested - it's just no longer on the common path.
- Existing-user email sync (`existingUser.email !== email` -> merge
  update) also moved into `initializeUserSession()` directly, since
  that check no longer goes through `createUserIfNotExists()` for the
  new-account branch; it skips `waitForServerCreatedUser()` entirely
  since there's nothing to wait for.
- Added test coverage in `user.service.spec.ts` for all three paths:
  server-trigger-already-done (the new default in the test file's
  `beforeEach`), trigger-timeout-fallback, and existing-user email
  sync.

**Net effect:** for the common case (server trigger completes, which
it should almost always do within a couple seconds even on a cold
start), there is no client-side Firestore *write* racing tab-close at
all - only a *read* (via the listener), which has no destructive
consequence if abandoned. The fallback-create path keeps today's
residual (but now rare) exposure as a safety net rather than removing
it outright, so a full function outage still degrades gracefully
instead of leaving accounts stuck.

**Remaining requirement**: the client-side code alone doesn't create the
trigger - the Cloud Function has to actually deploy. Confirmed via
`.github/workflows/firebase-deploy.yml`: this repo auto-deploys
functions (`firebase deploy --only functions`) on push to `release`
whenever `functions/` has changes, so merging this to `release` is
sufficient - no manual `firebase deploy` needed. Re-run `pnpm query
orphaned-registrations` periodically post-deploy to confirm the rate
actually drops for new registrations - if it doesn't, something in this
chain (trigger not deployed yet, trigger erroring, wait timeout too
short) needs a closer look.

## Tools already built for this (reusable, read-only, safe)

Both live in `scripts/db/queries/`, run via `pnpm query <name>`,
authenticated via the same ADC setup `pnpm query` already uses elsewhere
in this repo (no gcloud CLI involved, works fine in a sandboxed/CI-like
shell where gcloud itself may not):

- **`orphaned-registrations.ts`** - lists Auth users from the last N days
  (adjust `DAYS` constant) with no matching Firestore `users` doc.
- **`inspect-orphaned-registration.ts`** - given one or more UIDs
  (`pnpm query inspect-orphaned-registration -- <uid1> [uid2 ...]`),
  shows the full Auth record (creation/lastSignIn/lastRefresh times,
  provider) plus any `app_errors` entries within +/-10 minutes of
  registration.

## Where to go next

Ideas not yet tried, roughly in order of effort:

1. **Add explicit logging/telemetry around the exact moment of failure** -
   right now there's no signal to distinguish "abandoned mid-flight" from
   any other silent-failure mode. Something like a `beforeunload`/
   visibility-change listener, or splitting `createUserIfNotExists()`'s
   `setDoc()` into its own logged step, would at least confirm *where*
   execution stops for a fresh occurrence.
2. **Check for a pattern in `lastSignInTime` vs. app version/platform** -
   is this specifically mobile (backgrounding is more plausible there),
   or does it also happen on desktop web (harder to explain via
   "backgrounded app")? The `additionalInfo` diagnostic built for the App
   Check investigation isn't populated here (nothing logs at the point of
   failure), but if a *future* occurrence can be caught live, the same
   pattern (`Capacitor.getPlatform()` + `navigator.userAgent`) would be
   useful to add specifically to a new logging point for this flow.
3. **Consider a server-side backfill/safety-net**: a scheduled Cloud
   Function that periodically finds Auth users with no matching
   `users/{uid}` doc (same query as `orphaned-registrations.ts`, just
   running server-side on a schedule) and creates the missing document
   automatically. This wouldn't fix the root cause, but it would close
   the gap for anyone who never manually retries and self-heals -
   worth weighing as a pragmatic mitigation independent of root-causing
   the client-side trigger.
4. **Re-run `pnpm query orphaned-registrations` periodically** to track
   whether the rate is steady, growing, or shrinking, and whether new
   occurrences keep showing the same zero-`app_errors` signature.
