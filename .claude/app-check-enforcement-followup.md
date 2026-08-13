# App Check Enforcement Follow-up

Status as of 2026-08-04: hCaptcha has been fully replaced with Firebase App
Check, deployed to production, and verified working end to end. What
remains is a **later, separate step**: turning on enforcement once metrics
confirm real traffic isn't being misclassified. This doc is meant to be
self-contained so a fresh session can pick this up with no other context.

## What's already done (do not redo)

- `hCaptcha` removed entirely - no widget, no `validateHCaptcha` callable,
  no `@hcaptcha/types` dep, no `hCaptcha_error` analytics event.
- `verifyUserEmail` (a live unauthenticated callable that let anyone mark
  any account's email verified) fixed - now emulator-only, guarded by
  `process.env.FUNCTIONS_EMULATOR === 'true'` in `functions/src/index.ts`.
- Firebase App Check initialized in `src/app/app.config.ts`, skipped under
  `environment.useEmulators` (no App Check emulator exists, and emulated
  services don't verify tokens anyway).
- **Provider is `ReCaptchaEnterpriseProvider`, not `ReCaptchaV3Provider`.**
  This matters if you're tempted to "clean up" the code later - as of 2026,
  Google's reCAPTCHA admin console routes all new key creation through
  Google Cloud's Fraud Defense product, which issues reCAPTCHA Enterprise
  keys even when scored "v3-style." The classic `ReCaptchaV3Provider`
  cannot validate an Enterprise key (confirmed in production: it returned
  403 "App attestation failed" until switched).
- Site key: `6Le9dnQtAAAAAPVuqa-iHdOBOFC9vRUHg9P_zDOk`, registered as both
  reCAPTCHA and reCAPTCHA Enterprise providers on the Firebase App Check
  console for the PipSplit Web App (only Enterprise is actually used by
  the code; the classic reCAPTCHA registration is harmless but unused -
  fine to leave, or remove later for tidiness).
- Verified directly against production: `exchangeRecaptchaEnterpriseToken`
  returns 200 with a valid JWT (`"provider":"recaptcha_enterprise"`).
- Enforcement is **OFF** for everything right now - Functions, Firestore,
  Storage, Authentication. This is intentional; nothing currently rejects
  unattested requests.

## What's pending: Phase 2 (enforcement)

**Before doing anything below**, check **Firebase Console -> App Check ->
APIs** tab. Look at Verified/Unverified/Invalid counts per product over the
last ~7 days of real traffic. Green light is Verified >=99% with any
remaining unverified traffic explainable (e.g. stale cached clients from
before this shipped). If there's a persistent, non-decaying unverified
band, investigate before enforcing anything - don't just flip switches.

**Checked 2026-08-10** (App Check console, APIs tab): Firestore 99%
verified / 1% unverified. Storage had shown "Unenforced - metrics will be
displayed when the Storage API receives requests" (no traffic yet) as of
8/4; after manually exercising `scanReceipt` + a real receipt upload
today, Storage flipped to 100% verified / 0% unverified, status
"Monitoring" - confirms the upload path attests correctly, though this is
one manual exercise, not sustained real-world traffic yet.

**That APIs tab does NOT cover Cloud Functions** - confirmed via Firebase's
own docs (2026-08-04). The dashboard only supports Firestore, Storage,
Realtime Database, Auth, AI Logic, Data Connect, Maps, and Places; the
Functions row just shows a "Learn how to enforce" link with no
verified/unverified data, regardless of traffic volume - this was
initially mistaken for "no traffic yet," which was wrong (confirmed by
real invocations of `getAdminStatistics` and the help-form's
`notifyNewIssue` not showing up there either). Every callable invocation
does still write a structured log entry with a verification status
(`VALID` / `INVALID` / `MISSING`) to Cloud Logging - check it via Google
Cloud Console -> Logging with:

```
labels."firebase-log-type"="callable-request-verification"
```

Add `resource.labels.function_name="..."` to scope to one function once
you've confirmed the query works - **do not filter on
`resource.type="cloud_function"`**, that was tried first and returned zero
results even with confirmed real traffic. All of this project's functions
are 2nd-gen, and 2nd-gen Cloud Functions are actually Cloud Run services
under the hood, so their logs carry `resource.type="cloud_run_revision"`
instead ([known Google Cloud quirk](https://github.com/googleapis/google-cloud-go/issues/6367),
not project-specific). The plain label filter above works regardless of
resource type and is the simplest reliable query.

**Checked 2026-08-07** (Cloud Logging, last 7 days, unscoped by function -
covers whichever callables actually got invoked, confirmed to include at
least `getAdminStatistics` and the help-form's `notifyNewIssue`): 15
verification log entries, `verifications.app` = 11 `VALID` / 4 `MISSING` /
0 `INVALID`, `verifications.auth` in exact lockstep (same 11/4 split).
Confirmed the 4 `MISSING` are all timestamped 8/3 or earlier - i.e. before
this shipped on 8/4. **Every request since the deploy has verified
successfully with zero exceptions.** Strong signal for the functions
actually exercised so far; still worth spot-checking `scanReceipt`,
`sendGroupInvite`, `deleteUserAccount`, etc. specifically before enforcing
Functions broadly, since those get real end-user (including Android)
traffic that hasn't necessarily shown up in this sample yet - see the
Android WebView risk note below.

**Checked 2026-08-10, post-Functions-deploy:** `gcloud logging read` with
the label filter above confirmed working, returned a `scanReceipt` entry
at 15:19:20 (`VALID`/`VALID`) of ambiguous pre/post-deploy timing. Re-ran
the scan flow and re-checked logs: a second entry at 15:30:35
(`VALID`/`VALID`), confirmed after the deploy, call succeeded end-to-end
client-side. **`scanReceipt` enforcement confirmed working in production.**
Still no direct traffic sample yet for `sendGroupInvite`,
`deleteUserAccount`, `deleteGroup`, `syncAuthEmailsToUsers`,
`getAdminStatistics`, `sendEmail`, `notifyNewIssue` since the deploy -
worth a quick manual exercise of each, or just watching for organic
traffic/errors over the >=24h window before moving to Storage.

### Code change needed first

**Done 2026-08-10.** `callableAppCheck` added to `functions/src/common.ts`
and applied to all 8 callables listed below; `logAppError` left unenforced
with an explanatory comment. `pnpm run build` in `functions/` passes clean.

**Deployed 2026-08-10** via `firebase deploy --only functions`. All 12
functions in the codebase updated successfully (the 8 enforced ones plus
`deleteOldPaidExpenses`, `sendPaymentNotificationEmail`, `logAppError`,
`sendMailQueueEmail`, which are unaffected/untouched by this change).
**Cloud Functions App Check enforcement is now LIVE in production** for
`deleteUserAccount`, `deleteGroup`, `syncAuthEmailsToUsers`,
`getAdminStatistics`, `sendEmail`, `sendGroupInvite`, `notifyNewIssue`,
`scanReceipt`. This is step 1 of the "Console toggles" plan below - watch
Cloud Logging (`callable-request-verification` label) for `INVALID`/
rejected requests over the next 24h+ before moving on to Storage, per the
>=24h-apart rule. If something breaks, rollback requires a redeploy with
`enforceAppCheck: false` (~5 min), not a console flip.

`enforceAppCheck: true` is rejected by the Functions emulator too - the
client skips App Check init under emulators, and `firebase-functions`
rejects a *missing* `X-Firebase-AppCheck` header even when running
emulated. So the flag must be conditional. Add to `functions/src/common.ts`:

```ts
import type { CallableOptions } from 'firebase-functions/v2/https';

export const callableAppCheck = {
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
} satisfies CallableOptions;
```

Apply to these callables (spread into existing options where present):
`deleteUserAccount`, `deleteGroup`, `syncAuthEmailsToUsers`,
`getAdminStatistics`, `sendEmail`, `sendGroupInvite`, `notifyNewIssue`
(all in `functions/src/index.ts`), and `scanReceipt`
(`functions/src/receipt-ocr.ts` - has an existing `{memory, timeoutSeconds}`
options object, spread `...callableAppCheck` into it).

**Do NOT enforce `logAppError`** (`functions/src/index.ts`) - it's the
client's error-reporting channel. If App Check itself breaks, enforcing
this one blinds you to the outage that's happening. Leave it unenforced
with a comment explaining why.

**Checked 2026-08-12** (App Check console, ~2 days after Functions
deploy): Storage 100% verified / 0% unverified - sustained across real
traffic, not just the earlier manual test. Clean green light, well past
the >=99% bar. Firestore moved the wrong direction, 99%->97% verified
(1%->3% unverified) - not disqualifying by itself (could be the Android
WebView reCAPTCHA quirk noted below, or sample noise) but worth watching
before enforcing Firestore specifically; hold off there until it's
explained or trending back toward 100%.

**Storage enforcement turned ON 2026-08-12** via console toggle - step 2
of the plan is done.

**Note on `linkInvitedMembers`:** not in the original 8-callable list
above because it didn't exist yet when this doc was written - added
2026-08-10 12:44pm (after the Functions enforcement deploy, in the
separate "Firestore rules hardening Phase 0+1" work) already wired up
with `callableAppCheck` from the start. No gap; confirmed via
`git log` and the current Functions dashboard (shows live traffic).
`syncGroupMemberUids` (also added in that commit) is an `onDocumentWritten`
trigger, not a callable - no App Check concept applies.

**Checked 2026-08-12** (Functions dashboard, 24h request counts): only
`getAdminStatistics` (2 reqs) and `linkInvitedMembers` (4 reqs) among the
enforced callables have real traffic; `deleteOldPaidExpenses` (1 req) is
the unaffected scheduled trigger. Everything else enforced
(`sendEmail`, `notifyNewIssue`, `deleteGroup`, `syncAuthEmailsToUsers`,
`deleteUserAccount`, `sendGroupInvite`, `scanReceipt`) shows 0 requests in
the window - low usage, not a red flag; verification-log checks only make
sense for the two with actual traffic. `app_errors` Firestore collection
is the standing backstop for the zero-traffic ones (see `logAppError`
note above) rather than waiting for/forcing traffic on each.

**Checked 2026-08-12**: verification logs for `getAdminStatistics` and
`linkInvitedMembers` reviewed, nothing unexpected. That's now 3 of the 8
enforced callables (plus `scanReceipt`) directly confirmed clean
post-deploy via logs; the other 5 rely on zero real traffic +
`app_errors` silence as the backstop.

`onDocumentCreated` / `onSchedule` triggers have no App Check concept -
unaffected either way.

### Console toggles - one at a time, >=24h apart

1. **Cloud Functions** (after deploying the code above) - smallest blast
   radius, clearest per-callable metrics. **DONE 2026-08-10** (deployed,
   live in prod - this is code-based, not a console toggle, see note
   above). Watching before proceeding to step 2.
2. **Cloud Storage** - lowest traffic (receipt images only), fast rollback.
   **DONE 2026-08-12** - enforcement turned on via console toggle after
   100%/0% verified sustained over ~2 days of real traffic. Watching
   before proceeding to step 3.
3. **Cloud Firestore** - the big one, every screen depends on it. Do this
   last and watch closely. Holding as of 2026-08-12: verified % dipped
   99%->97%, investigate before flipping (see note above).

**Leave Authentication unenforced.** `login.component.ts` calls
`FirebaseAuthentication.signInWithGoogle()` with `skipNativeAuth: false`,
which routes through the *native* Android Firebase SDK - that has no App
Check provider wired up. Enforcing Auth would break Android Google
sign-in. Registration is already gated by email verification and
Firebase's own rate limits, so the risk/reward isn't there yet. (If this
ever becomes worth doing, it needs `@capacitor-firebase/app-check` with a
Play Integrity provider on the native Android side - real scope, not a
quick add.)

### Rollback

- Firestore/Storage/Auth: un-enforce from the console, effective within
  minutes, no deploy needed.
- Functions: `enforceAppCheck` is baked in at deploy time, so rollback
  needs a redeploy (~5 min). Another reason to do Functions first, on a
  day you're actually watching.

### Known risk to watch for

reCAPTCHA sometimes scores the Android WebView traffic as bot-like even
though it's legitimate (the Android app is a Capacitor shell loading the
live site, so it's real browser traffic, just inside a WebView). If
Firestore/Functions metrics show a persistent Android-shaped unverified
band, don't enforce yet - the fix is a `CustomProvider` that delegates to
native Play Integrity via `@capacitor-firebase/app-check` when
`pwaDetection.isRunningAsApp()` is true. Not built yet.

### Incident: `linkInvitedMembers` 401s from a startup race, not bot-scoring

**2026-08-13.** The app error log showed a run of `"Unauthenticated"` errors
from `linkInvitedMembers` starting 2026-08-12, absent before. Investigated via
Cloud Logging (`labels."firebase-log-type"="callable-request-verification"`,
`resource.labels.function_name="linkInvitedMembers"`) - every failure showed:

```json
"verifications": { "app": "MISSING", "auth": "VALID" }
```

**`MISSING`, not `INVALID`** - this is a different failure mode than the
"known risk" above. The user's Firebase Auth token was always fine; the
request simply carried no App Check token at all. All failures were Android
WebView user agents, but other Android WebView calls minutes apart succeeded
with `VALID`/`VALID` - same platform, same call, intermittent. That pattern
(not persistent, not correlated with a specific device) is a **startup race**,
not reCAPTCHA scoring real traffic as bot-like.

**Root cause:** `initializeAppCheck()` (`app.config.ts`) only registers
synchronously; the reCAPTCHA Enterprise token exchange is async and completes
well after bootstrap. `linkInvitedMembers` fires at cold boot
(`user.service.ts` `afterNextRender` -> `onAuthStateChanged` ->
`createUserIfNotExists`), and if it wins the race, the Firebase SDK
soft-fails - it sends the request with no App Check header rather than
waiting for one - and the enforced function rejects it with 401.
`app.config.ts` discarded the `initializeAppCheck()` return value, so nothing
could await token readiness.

**Fix shipped:** `src/app/app-check.ts` now captures the `AppCheck` instance
and exposes `appCheckTokenReady()`, which callers to `linkInvitedMembers`
(centralized in `src/app/services/member-link.service.ts`) await before
firing; a 10s-timeout miss skips the call rather than firing a
guaranteed-to-fail request. `group.service.ts` retries once for any user who
ends up with zero groups, so a skipped/failed link attempt self-heals on the
next snapshot instead of silently losing the invite. A one-time backfill
(`scripts/db/queries/link-orphaned-members.ts`) repaired member records
orphaned by this bug between 2026-08-10 (when `linkInvitedMembers` first
shipped enforced) and the fix landing.

**Relevance to the still-held Firestore enforcement decision:** the Firestore
verified-rate dip noted above (99%->97% around 2026-08-10 to 2026-08-12) was
attributed to the Android-WebView-scoring risk without a confirmed mechanism.
This incident is a confirmed, different mechanism (a startup race, affecting
any App Check-enforced request fired early in the boot sequence, not
Firestore-specific) - worth re-examining that dip through this lens before
concluding it's scoring-related, since the two would call for different
fixes (Play Integrity `CustomProvider` vs. more startup-time readiness
gating like this one).

## Also relevant, not urgent

- `hcaptcha-secret` in GCP Secret Manager is now unused - safe to disable
  its versions, wait a few days, then destroy.
- The classic `reCAPTCHA` (non-Enterprise) provider registration on the
  Firebase App Check console is unused dead weight - fine to remove
  whenever, purely cosmetic.
- **Added 2026-08-12:** Authentication App Check enforcement is worth
  investigating as its own separate effort down the line - not part of
  this Phase 2 rollout. Needs `@capacitor-firebase/app-check` with a Play
  Integrity provider wired into the native Android sign-in path (see
  "Leave Authentication unenforced" above for why the current setup can't
  just be flipped on) - real scope, deserves its own doc/plan rather than
  being squeezed into this one when it's picked up.
