# App Check Enforcement Follow-up

**Status as of 2026-08-18: COMPLETE.** User confirmed all three console
toggles are flipped - Functions, Storage, and Firestore enforcement are all
now live in production. This doc is kept for historical context (the
investigation into the Firestore verified-rate dip and its fix are relevant
background for anyone touching App Check-adjacent code later) but there is
no further pending work here. [[project_firestore_rules_hardening]] Phase 2
was paused specifically waiting on this and can now proceed.

This doc is meant to be self-contained so a fresh session can pick this up
with no other context, in case something regresses later.

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

**Checked 2026-08-14** (App Check console, Firestore detail view, last 7
days Aug 6-14, 23K total requests): 98% verified / 2% unverified, and the
2% breaks down entirely as "invalid requests" (427/23K) - "outdated
client" and "unknown origin" are both 0. Rules out two of the three usual
causes, narrows it to genuine failed attestations - consistent with,
though not proof of, the Android WebView reCAPTCHA scoring risk noted
below. Per-day breakdown (clarified: the sidebar's daily numbers are
fractions of 1, i.e. 0.97 = 97%, not raw counts - corrected after initial
misread) shows real day-to-day swing: Aug 12-13 was 97%/3% (matches the
dip seen when checked earlier that day), Aug 13-14 was a clean 100%/0%.
Bouncing between 100% and 97% day to day reads more like variability than
a flat ~2% steady-state background rate, but still not conclusive either
way on the Android theory. **Decision: investigate further (e.g.
correlate with Android traffic share via Firebase Analytics, or look for
patterns in which days spike) before enforcing Firestore** - not treating
98% as an automatic green light given Firestore's blast radius.

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
3. **Cloud Firestore** - the big one, every screen depends on it. Held
   from 2026-08-12 through 2026-08-18 on a verified-rate dip (99%->97%,
   later traced to a confirmed App Check token race, fixed - see notes
   above); confirmed 100% verified over a full clean 24h window
   (6.1K/6.1K requests) before flipping. **Enforced 2026-08-18, then
   deliberately turned back OFF 2026-08-19** - see "Firestore
   enforcement reversed" below. Currently **unenforced (Monitoring)**,
   not a "not yet reached" pending step - a considered decision to hold
   here for now.

**Functions and Storage remain enforced** (2026-08-10 and 2026-08-12
respectively) - unaffected by the Firestore reversal below. Firestore is
intentionally back to unenforced; see the reversal note for why and what
would bring it back.

**Leave Authentication unenforced.** `login.component.ts` calls
`FirebaseAuthentication.signInWithGoogle()` with `skipNativeAuth: false`,
which routes through the *native* Android Firebase SDK - that has no App
Check provider wired up. Enforcing Auth would break Android Google
sign-in. Registration is already gated by email verification and
Firebase's own rate limits, so the risk/reward isn't there yet. (If this
ever becomes worth doing, it needs `@capacitor-firebase/app-check` with a
Play Integrity provider on the native Android side - real scope, not a
quick add. See [[android-play-integrity-app-check.md]] - written up for
the Firestore-token-race use case below, but the same native
infrastructure would likely serve this too if it's ever built.)

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

**Checked 2026-08-14, follow-up:** confirmed the same unguarded pattern
exists in the app's core login path, not just `linkInvitedMembers`.
`user.service.ts` `initializeAuth()` fires via `afterNextRender` ->
`onAuthStateChanged`, then immediately calls `createUserIfNotExists()`
(direct Firestore `getDoc`/`setDoc`, `user.service.ts:175-199`) and
`groupService.getUserGroups()` (another Firestore read) - neither awaits
`appCheckTokenReady()`. This runs on every login, every platform, not
just the invite-linking edge case. **This is now the leading hypothesis
for the Firestore verified-rate dip**, ahead of Android-WebView scoring:
it's a confirmed mechanism (same one that broke `linkInvitedMembers`),
it's not Android-specific (fits a small persistent cross-platform
percentage better), and if Firestore enforcement is turned on before this
is fixed, this race would start actively rejecting a slice of real logins
on every platform rather than just showing up as a metrics blip. Ruled
out a separate theory first: the Android "still on v1.1.7" Analytics
split does NOT explain this - `capacitor.config.ts` uses `server.url:
'https://pipsplit.com'`, so the Android WebView always loads the live
web bundle over the network regardless of native app version; App Check
never needed a native app-store push and reaches all Android users
immediately.

**Fixed 2026-08-13.** `user.service.ts` `initializeAuth()` now awaits
`appCheckTokenReady()` right before `createUserIfNotExists()` (which
covers the `getUserGroups()` call right after it too, same as
`linkInvitedMembers`, but a best-effort *delay* rather than a skip -
login can't be skipped on timeout, so it proceeds regardless after the
10s cap). `pnpm exec ng test --include='src/app/services/user.service.spec.ts'`
passes (29/29, pre-existing suite untouched), `ng build` clean.

**Committed and deployed 2026-08-13.** `8e41ebd0` "Fix App Check token
race in user service", merged to `release` via PR #664 at 15:34 -0400 -
auto-deployed to hosting through the normal `.github/workflows/
firebase-deploy.yml` pipeline, no manual `firebase deploy` involved.

**Checked 2026-08-14** (App Check console, Firestore): **99% verified
over the last 7 days, 100% over the last 24 hours** - the 24h window
falls entirely after the 8/13 15:34 deploy. Strong retroactive
confirmation the login-path token race was a real, meaningful contributor
to the unverified band - not conclusive proof over the Android WebView
theory (Firestore has no per-request log to confirm mechanism the way
`linkInvitedMembers` was diagnosed), but the timing match plus the jump
to a clean 100% is a good sign. Recommend one more day or two of
sustained 100% before flipping Firestore enforcement, given it's the
last and highest-blast-radius toggle.

**Checked 2026-08-15:** Firestore backslid slightly to 98% today (from
100% the prior two days). `app_errors` log showed the explanation: 2
`Member Link Service` / `linkInvitedMembers` "Skipped: App Check token
unavailable" entries (2 users, 08/14 4:30pm and 08/15 7:11am, each
logged twice at the same displayed minute - exact duplication not fully
explained, granularity of the timestamp display or a near-simultaneous
double-fire, not investigated further). This is the 8/13 fix's own skip
path firing exactly as designed - confirms the gate works for
`linkInvitedMembers` (no bad request fired) - but since `user.service.ts`
only *delays* on its own outer `appCheckTokenReady()` call rather than
skipping (login can't be skipped), the Firestore `getDoc`/`setDoc` calls
moments earlier in those same two cold boots almost certainly went out
unverified too. **Conclusion: the race is real, confirmed, and
significantly reduced by the fix, but not fully eliminated** - a 10s wait
isn't always enough for every cold boot. Whether the remaining ~1-2 known
occurrences/day is an acceptable floor (the original bar was ">=99%",
not 100%, precisely to allow for explainable unverified traffic - this
is now an explained, monitored, low-frequency edge case rather than a
mystery) is a decision point before flipping Firestore enforcement.

**Decision 2026-08-15: try to close the race further before enforcing
Firestore.** Two levers exist - wait longer, or find out *why* it's still
failing - and only the diagnosis tells you whether waiting longer would
even help (a genuine reCAPTCHA rejection isn't fixed by more patience).
Went with diagnosis first:

- `appCheckTokenReady()` (`src/app/app-check.ts`) now resolves
  `{ ready: boolean; reason: 'ready' | 'timeout' | 'error' | 'not-initialized' }`
  instead of a bare boolean - `'timeout'` (still in flight when the
  caller gave up) and `'error'` (`getToken()` actively rejected, e.g.
  real reCAPTCHA scoring) previously both collapsed into the same `false`,
  making the two failure modes indistinguishable from the error log.
- `member-link.service.ts`'s existing skip-log now includes the reason
  (e.g. `alice@test.com (timeout)`).
- `user.service.ts`'s `initializeAuth()` now also logs when its own outer
  wait doesn't resolve ready (`'User Service' / 'initializeAuth' /
  'Proceeding without confirmed App Check token'` + reason) - this closes
  the previous gap where the login path's own races were only inferable
  from `linkInvitedMembers`'s downstream skips, never logged directly.
  Behavior is unchanged (still proceeds regardless, per the "can't skip
  login" constraint noted above) - this is diagnostics only.
- Timeout left at 10s for now, deliberately - bumping it and changing the
  diagnostics in the same step would make it unclear which change
  produced any future improvement.
- `pnpm exec ng test --include='src/app/app-check.spec.ts'
  --include='src/app/services/member-link.service.spec.ts'
  --include='src/app/services/user.service.spec.ts'` passes (37/37),
  `ng build` clean. **Not committed or deployed yet.**

**Next check-in:** once this ships, the error log's `error` column will
start showing `timeout` vs `error` for both `User Service` and `Member
Link Service` skip/proceed entries - if it's consistently `timeout`, a
longer wait is the right next lever; if it's consistently `error`
(especially clustered on Android user agents), that points back to the
Android WebView reCAPTCHA-scoring theory and the `CustomProvider`/Play
Integrity fix instead.

**Confirmed 2026-08-17.** The reason-tagging shipped (`1f9c7b66` "Improve
app check logging") and the answer is unambiguous: **every logged
instance across 4 distinct signups (8/16 5:56pm, 8/17 2:16am, 8:49am,
9:31am) is tagged `(error)` - zero `(timeout)`.** This rules out "just
needs more patience" - `getToken()` is actively rejecting, not still in
flight when the caller gives up, so extending the 10s wait would not
help. Firestore's own 7-day metric (98% verified, 842/44K invalid,
Aug 10-18) shows the same ~2% band fairly flat across the whole week per
the sparkline, not a decaying backlog - consistent with a standing
population of genuine failures rather than a one-time race. Each signup
event logs `linkInvitedMembers` skip x2 (duplicate, same email, same
displayed minute) + one `User Service` proceed - the duplication is
reproducible across all 4 instances now but still not root-caused.

**Next diagnostic step, implemented 2026-08-17 (not yet committed):**
`error` alone doesn't say *why* `getToken()` rejected - `appCheckTokenReady()`
now also captures the actual rejection message as `detail` (previously
discarded in the `.catch()`), and both `MemberLinkService` and
`UserService` include it in their logged error string (e.g.
`alice@test.com (error: <the real Firebase/reCAPTCHA message>)`).
`pnpm exec ng test` for `app-check.spec.ts` / `member-link.service.spec.ts`
/ `user.service.spec.ts` passes (39/39), `ng build` clean. Once this
ships, the next occurrences should reveal the specific failure (a
reCAPTCHA score, a network error, a config issue) rather than just
knowing "some rejection happened" - that specific message is what will
confirm or rule out the Android WebView theory, or point somewhere else
entirely.

**Explicitly deferred 2026-08-17, by request:** two unrelated-looking
errors seen in the same log check (`Admin Statistics Component /
load_statistics / Failed to load statistics (internal)`, twice, and
`Manage Groups Component / delete_group / Unauthenticated`) - neither
fits the App Check `(reason)` tagging convention, so likely a separate
issue (auth session expiry / an unhandled exception in
`getAdminStatistics`). Not investigated as part of this thread.

**Follow-up robustness work, 2026-08-17:** traced a real `error`-tagged
occurrence end to end (user `bulus3586@gmail.com`, 8/17 8:49am) to confirm
impact: login and all Firestore-backed app usage worked fine (Firestore
enforcement is still off), the *only* casualty was `linkInvitedMembers`
being skipped twice (once at signup, once via `GroupService`'s existing
one-shot retry) - meaning a real invited user could land on an empty
"no groups" screen with their invite never auto-linked, and no further
retry within that session. Since App Check failures here are confirmed
`error` (not `timeout`), an automatic retry moments later isn't reliable
- it can hit the same rejection again.

Fix: `GroupsComponent` now makes one additional `linkInvitedMembers`
attempt every time the Groups page loads (`src/app/features/groups/
groups/groups.component.ts`), gated only on the user's email being known
- not on zero groups, so it also covers an invite that arrives *after*
signup, which neither of the two existing automatic attempts cover.
Deliberately silent (no button, no snackbar) to match the existing
`GroupService` retry's precedent; relies on the same reactive `onSnapshot`
listener to surface a newly-linked group with no extra plumbing needed.
Considered and rejected: a "check first, then show an Accept Group
Invitations button" design (would have needed a `dryRun` mode on the
`linkInvitedMembers` callable) - dropped as unnecessary complexity once
the simpler "just always retry on page load" version covered the same
ground. Also considered and rejected: moving the underlying query
client-side to cut function-invocation cost - `linkInvitedMembers` is a
cross-tenant `collectionGroup('members')` search with no Firestore rule
that can safely permit it from the client (same category of risk as the
ongoing Firestore rules-hardening work), and the Firestore read costs
are identical either way regardless of where the query runs, so there
was no real cost to save. `pnpm exec ng test` passes (52/52 across the
touched specs), `ng build` clean. Not committed or deployed yet - same as
the other pending changes, waiting on you.

**Follow-up simplification, 2026-08-17:** removed the two cold-boot-timed
`linkInvitedMembers` attempts now that the Groups-page-load attempt covers
the same ground - `UserService.createUserIfNotExists()`'s signup-time
call, and `GroupService.getUserGroups()`'s one-shot zero-groups retry
(`#attemptedInviteLink` field and its logout() reset also removed as
dead code, along with `MemberLinkService`'s now-unused injection in
`GroupService`). Traced the actual routing to confirm no coverage is
lost: `groupGuard` (`src/app/features/auth/guards.guard.ts:26-41`)
redirects to `ADMIN_GROUPS` from every group-scoped route
(Expenses/Memorized/Analysis/Members/Categories) whenever no current
group is resolved, and `getUserGroups()`'s zero-member-record branch
still redirects there directly - between the two, any user without a
resolvable group ends up on the Groups page regardless of whether the
early attempts exist. The early attempts also fired at the exact
cold-boot moment this whole investigation has shown is highest-risk for
`error`-tagged failures, so consolidating to the later, single
Groups-page attempt is likely *more* reliable, not just simpler - it has
more time to run past whatever's causing `getToken()` to reject.

**Analytics restored, 2026-08-17, by request:** the `new_user_members_linked`
event was flagged as dropped above; brought back as `members_linked` (name
generalized since the Groups-page attempt now links new *and* existing
users, not just signups) - `GroupsComponent` logs `{ email, membersLinked }`
whenever `linkInvitedMembers()` returns `> 0`. `pnpm exec ng test` passes
in full (1251/1251), `ng build` clean.

**Loading-state fix, 2026-08-17.** You'd made your own pass at
`groups.component.ts`/`.html` (converting the private attempt flag to a
signal so the template could read it, and gating the loading overlay +
placeholder on it too) to stop a "no groups -> then a group appears"
flash for someone about to get linked. I found the gap: the flag flipped
`true` at *dispatch* time, not once the link attempt actually *settled*,
so it didn't change when the loading state cleared in practice. Reworked
into `checkingInvitedMemberLinks` (starts `true`, only cleared in a
`finally` after `linkInvitedMembers()` resolves, or immediately in demo
mode since there's no real account/backend to call there) - loading now
genuinely holds until the link attempt is done, not just started. Also
added the demo-mode skip flagged in the review (previously fired a real
`linkInvitedMembers` call with the fake `demo@example.com` on every demo
visit to Groups - harmless but wasteful and inconsistent with every other
action in this component). One pre-existing test needed a fix alongside
this (`should render the group select...` didn't set a user, which is
unrealistic per this app's real invariants - `UserService.initializeAuth()`
always sets `userStore.user()` before `GroupService.getUserGroups()` can
flip `groupStore.loaded()`, so a user is always known by the time this
gate needs to resolve). `pnpm exec ng test` passes in full (1254/1254),
`ng build` clean.

**All of the above committed and deployed.** Confirmed via `git log`:
`8e41ebd0` (login-race fix), `1f9c7b66` (timeout/error reason-tagging),
`2aca6183`/`e76adc10` (Groups-page-load linking + loading-state/demo-mode
fix), plus `ac520728` ("App Check improvements; fix stats function" -
also fixed the previously-deferred `getAdminStatistics` "internal" error
from the 8/17 log check, via a 300s timeout and a `.select('active',
'archived')` projection on the groups query). All merged to `release`
and auto-deployed through the normal pipeline.

**Checked 2026-08-18:** zero new App Check-related errors in the log,
and no unverified Firestore requests since the 8/17 11am-12pm hour -
waiting until after noon today to confirm a full clean 24h period.

**Confirmed 2026-08-18: full clean 24h window.** App Check console,
Firestore, last 24 hours (Aug 17-18): **100% verified, 6.1K/6.1K total**,
0 across all three unverified categories (outdated client, unknown
origin, invalid). Not a small sample - 6.1K requests over a full day,
directly comparable to the ~44K/week-with-a-2-3%-band seen throughout
this investigation. This is a definitive green light against the
original ">=99%, explainable remainder" bar, and closes out the
investigation: the cold-boot App Check token race was confirmed as the
dominant cause (via the `error`/`timeout` reason-tagging, then via the
direct fix), and the fixes eliminated it entirely, not just reduced it.
**Ready for the last console toggle - Cloud Firestore enforcement.**

**Firestore enforcement turned ON 2026-08-18** via console toggle -
step 3 (the last one) of the plan is done. All three Console toggles
(Functions, Storage, Firestore) are now live.

**Incident, 2026-08-18, shortly after enforcement:** one user's login
sequence failed end to end (`getUserDetails` / `createUserIfNotExists` /
`initializeAuth`, all "Missing or insufficient permissions"). Root
cause, visible thanks to the `detail`-capture diagnostic added earlier
today: `appCheck/throttled` - this client's App Check SDK had received an
actual 403 from the reCAPTCHA Enterprise attestation backend at some
point, which triggers a **client-side ~24h backoff built into the
Firebase App Check SDK itself** (not our code, not a server-side ban) -
during that window the SDK won't even attempt a new token fetch, so
*every* Firestore request from that device fails once enforcement is on.
This class of failure was always possible but had nowhere to bite before
today, since an unverified Firestore request just silently succeeded
pre-enforcement. **Checked via the grouped error log (8/11-8/18, by
message): count of 1 for all four related error lines** - a single
isolated incident, not a pattern. Conclusion: Firestore enforcement
itself is stable; this is the same category of low-rate, unavoidable
false-positive risk that comes with any reCAPTCHA-based bot mitigation,
not something enforcement introduced. No rollback warranted. Worth
continuing to watch for a few more days for recurrence or additional
distinct users; if this stays this rare, treat it as acceptable
background risk. Possible low-priority follow-up (not done): catch
`appCheck/throttled` specifically client-side and show an affected user
something more actionable than the generic "missing permissions" message.

**Update 2026-08-19: this declared the rollout "closed" one day too
early.** Firestore enforcement was reversed the day after this was
written - see "Firestore enforcement reversed" further below for why.
Leaving the paragraph below as-written for the historical record of
where things stood on 2026-08-18, but it is no longer the current state
- **check the "Console toggles" section above for current status, not
this paragraph.**

~~This closes out the App Check enforcement rollout. All three
services (Functions, Storage, Firestore) enforced; Authentication
deliberately deferred (see above). The cold-boot token race that drove
most of this investigation is fixed and confirmed; the residual risk is
now understood, small, and consistent with reCAPTCHA's normal
false-positive rate elsewhere on the web.~~

**Follow-up diagnostic, 2026-08-18:** the `appCheck/throttled` incident
above was diagnosed from the error message text alone, with no way to
confirm platform (Android WebView vs. desktop vs. iOS) - added device
context so the next occurrence doesn't require guessing:

- `AnalyticsService.logError()` (`src/app/services/analytics.service.ts`)
  now attaches an `additionalInfo` string - `Capacitor.getPlatform()` +
  `Capacitor.isNativePlatform()` + `navigator.userAgent` - to every
  logged error automatically. Computed centrally so all ~57 existing
  `logError`/`logSnapshotError` call sites benefit without any changes.
- `logAppError` (`functions/src/index.ts`) accepts and stores the new
  optional field; `app_errors` write rule is already `if false` (Admin
  SDK only, per its own comment), so no Firestore rules change needed.
- `AppError` model gets `additionalInfo?: string`.
- The admin Error Log's detail dialog (`error-detail-dialog.component.html`)
  shows an "Additional Info" row when present, same pattern as the
  existing "Error" row. Deliberately *not* added to the list/table view
  or the grouping key - grouping by full user-agent strings would split
  otherwise-identical errors apart by device, which isn't the goal.
  `pnpm exec ng test` passes (analytics.service.spec.ts: 6/6 covering
  this; full suite 1259/1262, the 3 failures are pre-existing/unrelated -
  a `yes-no-na.pipe.ts` change already in progress on disk), `ng build`
  and `functions`' `tsc` both clean. Not committed or deployed yet.

**Second incident, 2026-08-18 4:12pm** - same 4-error cluster
(`createUserIfNotExists`/`initializeAuth`/`getUserDetails` "Missing or
insufficient permissions" + `initializeAuth` "Proceeding without
confirmed App Check token" / `appCheck/throttled`), ~2.6h after the
first (1:36pm). **Countdown on this one reads ~23h:59m:58s remaining -
a fresh 403, not the first incident's throttle window still counting
down** (that would have ~21h left by 4:12pm, not nearly 24h). Two
independent rejections same day changes the read from "one-off fluke"
to "worth watching more closely" - still can't tell whether it's the
same device hitting this twice or two different ones without the
platform/`additionalInfo` diagnostic live, which is exactly the gap it's
meant to close. Reinforces the case for shipping the diagnostic +
clearer-messaging fix soon rather than treating this as fully settled.

**User-facing messaging fix, 2026-08-18 (same session as the
`additionalInfo` diagnostic above):** currently `UserService.
initializeAuth()`'s catch block only logs - if it throws before calling
`GroupService.getUserGroups()`, nothing ever flips `groupStore.loaded()`
to `true`, and every page's loading gate (`LoadingService`, the same
full-screen-overlay mechanism `GroupsComponent` uses) waits on that
forever. A user hitting the `appCheck/throttled` scenario currently sees
**a silently stuck loading screen with zero explanation** - worse than
just a confusing error, a total dead end.

Fix: new `UserService.handleInitializeAuthFailure()` (`src/app/services/
user.service.ts`), called from `initializeAuth()`'s catch block -
force-clears the loading overlay (`this.loading.loadingOff()`, newly
injected `LoadingService`) so the user is never stuck on an unexplained
spinner, then shows a snackbar. Message is specific when the error is
confirmed App-Check-shaped (`error instanceof FirebaseError &&
error.code === 'permission-denied'`, following the existing `FirebaseError`
check pattern used elsewhere in the app) - "We couldn't verify your
device... try again, switch networks or browsers, or contact support" -
and a generic "something went wrong, please try again" fallback for any
other failure type, so this doesn't leave a silently-stuck spinner for
non-App-Check failures either. Scoped to the login flow specifically
(`UserService.initializeAuth`), not a blanket app-wide error-messaging
overhaul - other services' error paths are untouched. 3 new tests in
`user.service.spec.ts` (`initializeAuth failure handling`), `pnpm exec
ng test` passes (31/31 in that file; full suite same 1262/1265 as
above), `ng build` clean. Not committed or deployed yet.

**Deploy resolved, 2026-08-18 evening.** The `Deploy Firebase Functions`
CI step (PR #673, includes the `additionalInfo` diagnostic + messaging
fix above, plus the unrelated Phase 2 rules-hardening `syncGroupMemberUids`
refactor) failed with a bare `Error: Failed to list functions for ***`
and no further detail even in the full raw log (`gh run view
--log-failed`). Manually deployed the identical code via `firebase
deploy --only functions` from the CLI - succeeded without issue -
then retried the failed GitHub job, which also then succeeded. A clean
manual deploy of the exact same code is strong confirmation this was a
transient CI/infrastructure hiccup, not a real regression in either the
diagnostic change or the rules-hardening trigger refactor (whose
`onDocumentWritten` registration was confirmed unchanged). **Everything
from this session (login-race fix, timeout/error reason-tagging,
Groups-page linking + loading-state fix, `additionalInfo` diagnostic,
and the initializeAuth messaging fix) is now live in production.**

**Next step, ongoing:** watching the app_errors log for further
`appCheck/throttled` occurrences - now that the `additionalInfo`
diagnostic is live, the next one should show actual platform/`userAgent`
data instead of requiring inference, finally answering whether this is
Android WebView, incognito/private browsing, Safari iOS, or something
else, and whether it's recurring on the same device or spreading across
different ones.

**Third incident, confirmed root cause, 2026-08-19 9:42am.** First
occurrence with the `additionalInfo` diagnostic live -
`platform: android, native: true, userAgent: ...; wv) AppleWebKit/537.36
... Chrome/151... Mobile Safari/537.36` (device: TECNO CH6, Android 12).
The `; wv)` token is Android's standard WebView marker - together with
`native: true` this is a real user on a real (budget) device running the
actual Capacitor app, not incognito, not Safari, not desktop. **This
directly confirms the Android WebView reCAPTCHA-scoring theory** flagged
as a known risk since the very start of this doc (see "Known risk to
watch for" above), rather than leaving it as inference. Three known
incidents now (8/18 1:36pm, 8/18 4:12pm, 8/19 9:42am) - all still
consistent with "rare but real," not "widespread," but this is the
first with hard evidence of mechanism. The previously-deferred fix (a
`CustomProvider` delegating to native Play Integrity via
`@capacitor-firebase/app-check` when `pwaDetection.isRunningAsApp()` is
true, noted since this doc's original "Known risk" section) is no
longer a hypothetical mitigation for a maybe-problem - it's the
confirmed fix for a confirmed, recurring mechanism. Whether that's worth
scoping now vs. continuing to monitor at this rate is a real decision
point, not a foregone conclusion either way.

**Fourth incident, 2026-08-19 11:07am - different device, undercuts the
"outdated device" theory.** `platform: android, native: true, userAgent:
...Android 16...24116RACCG Build/BP2A.250605.031.A3; wv)...Chrome/140...`
- a different OEM's model-numbering pattern than the TECNO CH6, and
**Android 16 is about as current as OS versions get**, not a lagging
budget device. Same mechanism (`native: true`, the `; wv)` marker, same
`appCheck/throttled` pattern) on a modern, up-to-date device rules out
"stale WebView component on an old device" as the unifying explanation
across incidents - two different OEMs, two very different OS ages, same
failure. Weight of evidence shifts toward something more general about
how reCAPTCHA Enterprise scores Android WebView traffic through this app
specifically (thin trust profile / shared IP reputation), rather than
device-specific staleness.

Also worth noting: this is the second incident within ~1.5 hours (9:42am
and 11:07am), for four total in roughly 24 hours of actually having
visibility via the diagnostic - a faster cadence than "3 incidents across
the whole investigation" suggested before the diagnostic could actually
surface them clearly. Not yet re-raising the scope-now-vs-monitor
decision unprompted, but this is relevant new evidence for it.

**Decision 2026-08-19: keep monitoring for now, don't scope yet.** Full
implementation plan written up regardless, in case that changes -
see [[android-play-integrity-app-check.md]] for everything involved
(architecture, Firebase/Play Console prerequisites, the one open
technical question worth spiking before committing, and why this
specific fix - unlike everything else this session - needs a real
native app release to reach users, not just a web deploy).

**Mitigations shipped instead, 2026-08-19.** Traced exactly what a locked-out
user experiences (Firebase Auth still works - only unenforced; but
`UserService.initializeAuth()` throws before `userStore.initUser()` or
`GroupService.getUserGroups()` ever run, so every Firestore-backed page is
broken for that device all session). Confirmed via code, not assumption,
that `/help` has no route guard, `HelpComponent` has zero dependency on
`userStore`/`groupStore`, and the footer (which links to Help) renders
unconditionally on every page (`FooterComponent`'s selector is literally
`footer`, outside every `@if` in `app.component.html`) - so Help is
reliably reachable regardless of App Check state.

Found one real gap while confirming that, though: the Help page's own
"Report an Issue" form called `notifyNewIssue`, which **was**
App-Check-enforced - meaning the one in-app channel for asking for help
would itself fail for exactly the users who needed it. Same reasoning as
`logAppError` (deliberately left unenforced so an App Check outage
doesn't blind the error-reporting channel to itself) applies here, more
directly - **removed `enforceAppCheck` from `notifyNewIssue`**
(`functions/src/index.ts`) with a comment explaining why, matching
`logAppError`'s existing precedent. Same low-risk profile: hardcoded
recipient, no auth check to bypass, nothing new an unenforced caller can
abuse beyond emailing the admin (already true before this change).

Also added a new Help Topics entry, `cant-verify-device` ("Help! It
can't verify my device") in `src/app/services/help-content.service.ts` -
plain-language explanation of the message, reassurance it's not an
account problem, advice to try a different device/browser (confirmed
reliable earlier - the throttle is client-scoped, not account-scoped),
notes it self-resolves in ~24h, and points to the now-genuinely-working
Report an Issue form. `pnpm exec ng test` passes (1262/1265, same 3
pre-existing unrelated pipe failures), `functions` `tsc` and `ng build`
both clean. Not committed or deployed yet.

## Firestore enforcement reversed, 2026-08-19

**Decision: turned Firestore App Check enforcement back OFF** (console
toggle, effective immediately), one day after turning it on. Supersedes
the "keep monitoring, don't scope Play Integrity yet" decision directly
above - that was the right call with the information available at the
time; this is new information changing the tradeoff, not a reversal of
the reasoning itself.

**What changed the calculus:** app is still small and still growing -
450 total registrations ever, only 4 active non-owner groups with
expense activity in the last 30 days. Checked recent registration
outcomes specifically: **3 of the last 4 new registrants have a Firebase
Auth account but no matching Firestore `users/{uid}` document** -
presumably 3 of the App-Check-throttled incidents logged above.

**Why new registrants are hit categorically worse than returning
users**, traced through the code: `createUserIfNotExists()` calls
`getUserDetails()` (the `getDoc` that fails under a throttle) *before*
`setDoc()` (the call that actually creates the user's document) ever
runs. A returning user's document already exists, so a throttled device
is recoverable - painful, but bounded. A brand-new registrant has no
document yet, so the failure happens *before* one is ever created, and
every retry on the same device repeats the same failure. This isn't
"occasionally locked out" for that population - at the observed rate
it's closer to "registration is broken about as often as it works,"
which directly undermines the one thing that matters most at this stage
of the app's life.

**Weighed against the abuse-exposure discussion** earlier in this doc:
at this size, the app has essentially no attractive target for the kind
of automated/volumetric abuse App Check specifically defends against -
not enough data, not enough traffic, nothing worth scripting for. The
actual authorization boundary (hardened Firestore rules - membership-
scoped read/write via `memberUids`/`activeMemberUids`/`adminUids`) is
completely unaffected by this decision and remains fully in force
regardless of App Check's Firestore toggle. What's given up is
specifically the anti-automation/anti-volume layer and defense-in-depth
against a future rules bug - real, but not worth the concrete, currently
measured cost to new-user acquisition at this scale.

**Functions and Storage remain enforced**, unaffected by this decision -
the costliest/most abuse-prone surfaces (email sending, receipt OCR,
admin stats, account/group deletion) stay protected. This was a
deliberate middle ground, not "turn everything off."

**The 3 currently-broken registrant accounts should self-heal
automatically** the next time those people attempt to log in - with
Firestore unenforced, `getUserDetails()` will succeed, find no document,
and `createUserIfNotExists()` will create one normally, same as any
other new registration. No manual data repair needed.

**Revisit points, not a permanent decision:** worth reconsidering once
the user base grows enough that the abuse-risk/reward genuinely shifts,
or once [[android-play-integrity-app-check.md]] ships and removes the
Android false-positive mechanism specifically - at that point
re-enforcing Firestore would no longer cost real registrations.

## Unrelated finding: login-time retry for transient Firestore errors, 2026-08-21

While checking the error log for post-rollback App Check recurrence,
found a **different, unrelated** failure: three `initializeAuth`/
`getUserDetails`/`createUserIfNotExists` entries on 2026-08-20 1:09pm,
all `"Failed to get document because the client is offline."` - a
Firestore connectivity error (`unavailable`), not an App Check
rejection. Confirmed unrelated by timestamp: no App Check-flavored entry
logged at the same moment, and the nearest `appCheck/throttled` entries
(8/19 3:15pm and 8/21 9:06am) don't line up with it - just an ordinary
mobile network blip hitting the same fragile `initializeAuth` chain any
Firestore read failure cascades through.

Firestore's own docs describe `unavailable` as "most likely a transient
condition...corrected by retrying with a backoff," so added a short,
selective retry to `UserService.initializeUserSession()` (extracted from
`initializeAuth()`'s `onAuthStateChanged` callback, `src/app/services/
user.service.ts`): up to 3 total attempts, 2s apart, but **only** for
`unavailable` and `deadline-exceeded` (Firestore's own transient codes) -
explicitly not for `permission-denied` (an App Check rejection), since
the SDK's own ~24h throttle means an immediate retry cannot help there,
and retrying would only delay showing the message the user actually
needs. `createUserIfNotExists()` is safe to re-run on retry - it checks
for an existing doc first, so a partial success on an earlier attempt
doesn't error on a duplicate create.

4 new tests in `user.service.spec.ts` cover: retries+succeeds silently
on `unavailable`, same for `deadline-exceeded`, gives up after max
attempts and shows the existing generic message, and does not retry
`permission-denied` at all. Exposed and fixed a pre-existing gap in the
test mocks along the way (`mockUserStore` was missing `initUser` -
no earlier test in this file had ever exercised the full login success
path, since every prior test intentionally failed before reaching it).
`pnpm exec ng test` passes in full (1266/1269, same 3 pre-existing
unrelated pipe failures), `ng build` clean. **Deliberately did not run
the functions test suite or any Playwright/emulator-dependent tooling
this round** - user has emulators running for another project and asked
not to touch them; nothing in this fix touches `functions/`. Not
committed or deployed yet.

## New tracked category: `appCheck/recaptcha-error` on desktop web, 2026-08-21

Distinct from everything else in this doc - **not** the Android WebView
mechanism, **not** `appCheck/throttled`, **not** a Firestore-side error
at all. `platform: web, native: false` (Windows/Chrome desktop), error
`AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error)` - the reCAPTCHA
script/widget itself failed to complete, most commonly caused by an
ad-blocker, privacy extension, or corporate/school network blocking
Google's reCAPTCHA domains outright, client-side and outside anything
we control server-side.

6 occurrences, 2:41pm-2:57pm same day (16 min span) - confirmed via the
Individual log view, all identical failure, no successes mixed in.
Read as one person retrying/reloading repeatedly, not six different
people: **every attempt failed the same way** (not "mostly failed, one
succeeded"), pointing to a persistent, always-on block rather than a
flaky connection - and even though their actual login likely succeeded
underneath (Firestore unenforced), `appCheckTokenReady()` still has to
wait out reCAPTCHA's failure before proceeding on every single page
load, which is a very plausible reason to see repeated frustrated
reloads even when the app "works" each time.

First occurrence ever. Not pursuing a fix - it's a fundamentally
different, client-side cause than anything Play Integrity or a
server-side change could address, and doesn't permanently block anyone
given Firestore is currently unenforced. Logging here so a future
recurrence has this one to compare against, same pattern as the
Android-incident log above.

## Related but separate: a second, non-App-Check cause of the same symptom

2026-08-25: re-checking `orphaned-registrations` (see the "3 of the last
4 new registrants" finding above) turned up new orphaned accounts with
**zero associated `app_errors` entries** - unlike every App-Check-caused
case in this doc, which always produced a caught, logged error. That
rules out App Check as the cause for these specific ones. Spun out into
its own doc rather than continuing here, since the fix (if any) has
nothing to do with reCAPTCHA/Play Integrity/enforcement - see
[[orphaned-registrations-investigation.md]].

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
