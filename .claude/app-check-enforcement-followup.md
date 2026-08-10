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

### Code change needed first

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

`onDocumentCreated` / `onSchedule` triggers have no App Check concept -
unaffected either way.

### Console toggles - one at a time, >=24h apart

1. **Cloud Functions** (after deploying the code above) - smallest blast
   radius, clearest per-callable metrics.
2. **Cloud Storage** - lowest traffic (receipt images only), fast rollback.
3. **Cloud Firestore** - the big one, every screen depends on it. Do this
   last and watch closely.

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

## Also relevant, not urgent

- `hcaptcha-secret` in GCP Secret Manager is now unused - safe to disable
  its versions, wait a few days, then destroy.
- The classic `reCAPTCHA` (non-Enterprise) provider registration on the
  Firebase App Check console is unused dead weight - fine to remove
  whenever, purely cosmetic.
