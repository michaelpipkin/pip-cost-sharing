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
