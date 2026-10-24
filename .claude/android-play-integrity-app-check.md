# Android Play Integrity for App Check — Scoping

**Status as of 2026-10-09: BUILT, on the Play beta track (1.3.1 (26)),
verified on one real phone; NOT yet rolled out to production or measured
on real users.** See "Spike results" and "Where things stand" below for
what's done and what's open. The rest of this doc is the original
2026-08-19 scoping, kept for background (prerequisites, architecture,
rationale) - written from research before anything was built, so where it
disagrees with the spike sections, the spike sections win.

Original context: written after the third confirmed `appCheck/throttled`
incident (see [[app-check-enforcement-followup.md]]) identified Android
WebView reCAPTCHA scoring as the mechanism via the `additionalInfo`
diagnostic. By 2026-10-07 the measured rate was ~41% of new signups
throttled on first launch, which is what prompted building it.

## Why this and not something else

Firestore/Storage/Functions enforcement is confirmed stable and reliable
(see the main doc). The residual risk is specifically App Check's current
provider on Android: `ReCaptchaEnterpriseProvider` uses a **Web App**
reCAPTCHA key registered to `pipsplit.com`, so it evaluates Android traffic
as generic browser traffic with zero visibility into anything Android-native
- no signal that this is a legitimate installed app at all. Play Integrity is
Google's purpose-built alternative for exactly this: it attests device/app
integrity using signals reCAPTCHA has no access to (app signing certificate,
Play Store provenance if applicable, device integrity level), which is a
fundamentally better fit for native Android traffic than a web-oriented
bot-detection heuristic.

### Why legitimate Android traffic might be getting flagged today

No visibility into Google's actual scoring internals, so this is informed
speculation, roughly in order of how well-documented each cause is
elsewhere, not in order of likelihood for this app specifically:

- **Thin trust profile.** A WebView opened by a native app shell has none of
  the accumulated browsing history, cross-site cookies, or long-lived
  session signals a person's daily-driver mobile Chrome has built up over
  time. Every cold app-open can look like a brand-new, anonymous browser
  session to a risk engine that partly scores on account age/history.
- **Shared/carrier IP reputation.** The one confirmed device so far
  (TECNO CH6) is a budget phone model common in markets that lean heavily
  on carrier-grade NAT (many subscribers sharing one public IP) - a
  well-documented, user-independent cause of reCAPTCHA false positives
  unrelated to WebView specifically.
- **Inconsistent/outdated WebView component version.** Android's WebView is
  a separately-updatable system component from Chrome itself; budget
  devices in some markets lag on updates, which can make the environment
  look unusual/rare to a fingerprinting-based risk engine.
- **Cold-start timing.** If reCAPTCHA's behavioral analysis runs before the
  user has interacted with anything (first paint, no touch events yet), it
  has little behavioral signal to work with, leaning harder on the
  already-thin device/network signals above.
- **Data-saving/compression proxies.** Common on budget devices and in some
  regions/carriers; can alter how traffic looks to network-based risk
  signals in ways unrelated to the actual user's legitimacy.

Worth noting given the earlier sideloading question: Play Integrity's own
docs confirm it explicitly supports apps distributed outside Google Play
(sideloaded/direct APK), just with looser verdict requirements than
Play-Store-exclusive distribution - see the "Play Store distribution model"
decision point below. So even if some of this app's traffic isn't from Play
Store installs, that's not automatically a dead end for this fix.

## Update 2026-10-07

Rate is now measured at ~41% of new signups throttled (7/17, see
[[app-check-enforcement-followup.md]]), so this is back on the table.
Decided: **require `PLAY_RECOGNIZED`, sideloading not supported** (see the
Play Store distribution decision below). Practical consequence: native test
builds must come from Play (internal testing track) or use a Firebase debug
token. Native app version is now logged with errors to size the adoption
lag before committing. Also see the follow-up doc for using the web app
itself to force old native builds to update.

## Spike status, 2026-10-09 (branch `play-integrity-spike`, from `dev`)

JS side written and unit-tested (full suite 1446/1446), **not yet built
against the real plugin or run on a device**:

- `src/app/app-check.ts`: `initAppCheck()` now picks the provider. Android
  **and** `Capacitor.isPluginAvailable('FirebaseAppCheck')` -> a
  `CustomProvider` bridging `FirebaseAppCheck.getToken()` (the plugin's
  documented "use with the Firebase JS SDK" pattern); everything else
  (web, iOS, and Android builds that predate the plugin) -> unchanged
  reCAPTCHA Enterprise. That `isPluginAvailable` check is what makes
  deploying the web code *before* any native release safe. Registration is
  still synchronous; native `initialize()` runs lazily (memoized, retried
  after a failure) on the first token request.
- `getAppCheckProviderName()` + `appCheck: recaptcha|play-integrity` in
  the error log's `additionalInfo`, so post-release throttle/failure
  entries say which provider they came from.
- Test mocks: `@capacitor-firebase/app-check` path mapping in
  `tsconfig.spec.json`, `CustomProvider` added to the app-check mock.
- Plugin: `@capacitor-firebase/app-check@8.5.2` (peers: Capacitor >=8,
  firebase ^12.6 - matches the installed analytics/auth 8.5.2 plugins).
  Not yet installed (needs user to run pnpm).
- Not yet decided: whether a Play Integrity failure on a device without
  working Play Services should fall back to reCAPTCHA. Currently it does
  not (token request just fails). Revisit after seeing real-device results.
- **Gotcha:** the Android shell loads `https://pipsplit.com`, so a test
  build only runs this code once the web bundle is deployed to production
  (safe: non-plugin builds ignore the new path).

## Spike results, 2026-10-09 (1.3.0 (24) on the beta track, real phone)

- **Play Integrity works end to end.** On the Play-installed beta build, a
  receipt upload to Storage (App Check enforced) succeeded and no
  throttle/Integrity errors were logged. Google's pre-launch crawler
  (`play_review@google.com`, emulator `sdk_gphone64_arm64`) logged Play
  Integrity error -14 (`PLAY_STORE_VERSION_OUTDATED`) ~11 times in 10
  minutes - expected on an emulator, and it trips the error-alert email
  after each release upload.
- **Locally installed builds (Android Studio Run/Debug) can't get a
  token** - not Play-installed, so `PLAY_RECOGNIZED` fails. The native SDK
  then throttles retries ("Too many attempts."), and Storage/Functions
  reject with `storage/unauthenticated` ("User is not authenticated" -
  Storage's wording for a missing/invalid App Check token, even when
  signed in). `isLikelyAppCheckError()` now includes it, and Add/Edit
  Expense route through the shared App Check dialog handler.
- **Unrelated crash found in the new build: `Camera.takePhoto` crashed**
  (`NullPointerException: getPermissionState(...) must not be null`, in
  `CameraPlugin.load`) in the **release** build only - debug build was
  fine. Cause: R8 minification (release has `minifyEnabled true`) renamed
  Capacitor's annotation classes (`CapacitorPlugin -> d1.b`, `Permission ->
  d1.c` in mapping.txt), so Capacitor couldn't read the Camera plugin's
  permission annotations and returned null states. The newer camera plugin
  (8.2.5, pulled in by the package updates synced into this build; the
  previous 1.2.0 (23) build had 8.2.1) does a Kotlin non-null check that
  turns that into a crash. Fixed with keep rules in
  `android/app/proguard-rules.pro` (keep `com.getcapacitor.annotation.**`
  and annotation attributes; also keeps line numbers). **Verified on a
  real phone with a release build** - camera works.
- **System bar colors stopped matching** (status + gesture bars no longer
  `#105208`) after the same package updates (Capacitor Android 8.4.2 ->
  8.5.2). Diffing the two Capacitor releases showed core's built-in
  `SystemBars` plugin was reworked and now installs its own window-insets
  handling, fighting the `@capawesome` EdgeToEdge plugin that owns the
  inset margins and colored bar overlays. Fix: `plugins.SystemBars.
  insetsHandling: 'disable'` in `capacitor.config.ts` (needs `cap sync`).
  Verified on a real phone (Pixel, Android 17). Note the app also has its
  own `SystemBarsPlugin` (registered by name "SystemBars" in
  `MainActivity`) that collides by name with core's - worth tidying
  someday, not touched.
- **Lesson: the package updates that rode along with this work caused two
  native regressions** (camera, bar colors) that no web test could catch.
  After any `cap sync` that moves Capacitor/plugin versions, smoke-test a
  Play-installed or locally-run **release** build: camera (both flows),
  gallery, Google sign-in, an ad, a deep link, bar colors, and a Storage
  upload. Compare `android/capacitor.settings.gradle` before/after a sync
  to see which native plugin versions actually moved.
- **Final check, 1.3.1 (26) from the beta track:** system bars correct,
  camera works (New Expense and Create from Receipt), Google sign-in,
  AdMob, deep links, and receipt upload all work; sign-out/sign-in
  logged no new errors.
- **Play Console won't accept a reused versionCode**, even for a beta
  that was just uploaded - bump `versionCode` (and `versionName`) in
  `android/app/build.gradle` for every upload.
- Test tips: `adb` is at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`;
  Android Studio Run/Debug both use the selected *build variant* (default
  debug); running `release` locally needs a temporary
  `signingConfig signingConfigs.debug` (don't commit it).

## Where things stand / open items (2026-10-09)

Shipped to `release` (web, live): provider selection in `app-check.ts`,
`appCheck: <provider>` + `appVersion` in error-log `additionalInfo`, the
shared App Check dialog (now also for `storage/unauthenticated`).
Native (Play beta, 1.3.1 (26)): plugin, keep rules, SystemBars config.
Console setup done: Play Integrity registered in Firebase App Check for
`com.pipsplit.app` with `PLAY_RECOGNIZED` required (device-integrity level
not required), app signing key SHA-256 (not the upload key), Play
Integrity API linked to the project (daily limit 10,000).

Open:
1. **Promote beta to production** (staged rollout, watch Android vitals
   crashes). Status 2026-10-18: rollout at 20% from ~10/10, raised to 50%
   a few days before 10/18; Functions `callable-request-verification`
   logs (read via the Firebase MCP `functions_get_logs`) showed 0 INVALID
   and all enforced callables VALID/VALID from 10/09 to 10/18 (the only
   `app: MISSING` entries are the deliberately-unenforced `logAppError`
   from failing clients). A throttled first launch on the Play build
   (10/09 20:14 UTC) recovered within ~2 minutes. Then **measure**: after a few days compare error-log entries
   by `appCheck: play-integrity` vs `recaptcha` and by `appVersion`. The
   goal is a near-zero first-launch throttle rate on 1.3.x. (Query:
   `pnpm query app-errors`.)
2. **No reCAPTCHA fallback** when Play Integrity fails (outdated/missing
   Play Store or Play Services - seen as error -14 on Google's emulator
   crawler; the native SDK then throttles retries with "Too many
   attempts."). Decide after real-user data shows how common it is.
   The -14 case could also get its own "update the Play Store" message
   in the App Check dialog.
2a. **Web-side "please update" dialog (built 2026-10-18, not yet deployed
   at time of writing).** Play's recovery prompt isn't offered for 1.1.7
   (22) and older (no Recovery tab on those versions; the help page's only
   per-version rule is that every track containing the version must have a
   newer release - check for old Internal/Closed tracks still on 22), so
   `AppUpdatePromptService` (web-only change; the Android shell loads the
   live bundle) asks native Android builds with versionCode below
   `MIN_NATIVE_BUILD` (24) to update: dismissible, once per session,
   skipped on web/iOS/builds without the `@capacitor/app` plugin. Opens the
   Play listing via `@capacitor/browser`. A temporary owner-only "Preview
   Update Prompt" button on My Account -> Profile was used to test it and
   has been removed (2026-10-18); the automatic startup check
   (`checkOnStartup()` from `AppComponent`) is the only trigger and applies
   to every user.
   **Verified 2026-10-18 on a real phone (deployed app):** Update opens the
   Play listing in the native Play Store app, after a very brief flash of
   an in-app browser window (cosmetic; a `market://details?id=...` link
   might avoid it - untested, not worth doing unless it bothers anyone).
   Not yet seen in the wild: the automatic path for builds below 24 (check
   `update_prompt_shown` events once deployed). Events:
   `update_prompt_shown` / `update_prompt_accepted` (parameter
   `native_build`; the earlier `preview` parameter was dropped with the
   test button).
2b. **Getting users onto 1.3.x:** Play Console -> the release -> Recovery
   tools -> **Prompt users to update** (found 2026-10-09 on the open-testing
   release page). Pick the older versions to target (optionally narrow by
   country / Android version); targeted users get a full-screen update
   prompt on app open, dismissible, repeating on each cold start - a nudge,
   not a block. Plan: use it on the *production* release once the staged
   rollout has reached 100% with clean Android vitals. Track adoption in
   Play Console's installs-by-app-version stats and the `appVersion` field
   in the error log. A hard block would still need the web-app-side
   minimum-version gate (item 3).
3. **Firestore re-enforcement is still off the table** until most users
   are on 1.3.x (older builds keep using reCAPTCHA and keep getting
   throttled), likely needing a minimum-native-version prompt driven by
   the web app (`App.getInfo()`); and re-enforcing requires reverting the
   concurrent `appCheckTokenReady()` in `UserService.initializeUserSession()`
   (see its WARNING comment).
4. **Alert noise:** each release upload triggers Google's pre-launch
   crawler (`play_review@google.com`, emulator), which logs ~10 Play
   Integrity errors and trips the error-alert email. Expected; consider
   ignoring that account in `logError` if it gets annoying.

## GA4 data, 2026-10-18 (first read of adoption + app_check_status)

(GA4 property 433803460, queried read-only; see the reference memory.)
- **Android active users by `appVersion`** - last 28d: 1.2.0 = 473, 1.1.7 =
  76, 1.3.1 = 46, 1.3.0 = 13 (web 189). Last 7d: 1.2.0 = 120, 1.3.1 = 36,
  1.1.7 = 27 (web 24). So only ~20% of recent Android actives are on 1.3.x
  right after the 100% rollout; 1.2.0 and 1.1.7 together are ~80%, which is
  exactly the population the update prompt targets.
- **`app_check_status`** (live since ~10/15): 13 events - reCAPTCHA /
  Android 1.2.0 (23): 6 ready + 1 failed (error); Play Integrity / Android
  1.3.1 (26): 4 ready, 0 failed; reCAPTCHA / web: 2 ready. Far too small to
  conclude anything, and the count is well below what the active-user
  numbers imply (expect tens to hundreds) - may be GA processing lag or
  web-bundle caching in the WebView; re-check in a few days before trusting
  it.
- Custom dimensions provider/ready/reason/platform/native_app_version/
  detail are registered. `native_build` (update_prompt_* events) is not.

## BASELINE snapshot, 2026-10-18 (compare against this in a few days)

Pulled via the Analytics MCP (property 433803460). Taken right after the
1.3.1 (26) rollout hit 100% (set ~10/16-10/17) and BEFORE the web-side
"please update" dialog deployed.

**Android daily active users by `appVersion`** (1.2.0 = build 23, 1.1.7 =
22, 1.3.1 = 26; 1.3.0 = betas 24/25):

| date | 1.2.0 | 1.1.7 | 1.3.1 | 1.3.0 |
|---|---|---|---|---|
| 10/09 | 18 | 1 | 9 | 13 |
| 10/10 | 22 | 1 | 2 | - |
| 10/11 | 28 | 5 | 3 | - |
| 10/12 | 19 | 3 | 2 | - |
| 10/13 | 15 | 5 | 3 | - |
| 10/14 | 25 | 4 | 8 | - |
| 10/15 | 18 | 5 | 7 | - |
| 10/16 | 15 | 3 | 9 | - |
| 10/17 | 15 | 2 | 5 | - |

7-day active users (to 10/18): 1.2.0 = 120, 1.3.1 = 36, 1.1.7 = 27,
web = 24. 1.3.1 share of Android: ~20% by 7-day actives, ~25-33% by daily.
Also ~15 new Android installs/day (`first_open` = 29 over 10/16-10/17).

**`app_check_status` events (10/15 first seen -> 10/18, 13 events):**
- reCAPTCHA / Android 1.2.0 (23): 6 ready + 1 failed (reason `error`) -> 1/7
- Play Integrity / Android 1.3.1 (26): 4 ready, 0 failed -> 0/4
- reCAPTCHA / web: 2 ready
- Per day: 10/15 = 1, 10/16 = 7, 10/17 = 5.
- **Coverage caveat:** 10/16-10/17 had 66 `app_initalized` events (42
  users) and 73 `session_start`, but only 12 `app_check_status` (9 users) -
  roughly 30% of the signed-in app loads we'd expect. Logged-out sessions
  (29 `first_open` installs, login screen) don't emit it, which explains
  part of the gap, not all. Treat rates as indicative only; if coverage
  stays this low, find out why before trusting them.
- `update_prompt_shown/accepted`: none yet (not deployed at snapshot time).
- `app_error` GA events: 1 over 10/16-10/17 (low error volume).

**What to compare next time:** share of Android DAU on 1.3.x (is the
update prompt moving it?), 1.2.0/1.1.7 DAU trend, `update_prompt_*` counts,
and `ready=false` rate by provider with a much larger sample.

## FOLLOW-UP snapshot, 2026-10-24 (6 days after the baseline)

Pulled via the Analytics MCP + read-only Firestore/Auth scripts.

- **Adoption moved:** Android daily active users, written as
  "1.3.1 / 1.2.0 / 1.1.7" per day: 10/16 = 10 / 15 / 3, 10/17 = 6 / 17 / 2,
  10/18 = 14 / 16 / 4, 10/19 = 14 / 11 / 5, 10/20 = 14 / 13 / 6,
  10/21 = 16 / 4 / 1, 10/22 = 7 / 9 / 3, 10/23 = 12 / 8 / 1. Over
  10/17-10/23 user-days:
  1.3.1 = 83, 1.2.0 = 78, 1.1.7 = 22 -> 1.3.1 is ~45% of Android activity
  (baseline was ~20-30%). Crossover around 10/19-10/21. Can't separate the
  effect of Play auto-update, the Play Console recovery prompt and the web
  dialog.
- **Web update dialog (deployed ~10/19):** `update_prompt_shown` 16 events /
  15 users since 10/19 (1.2.0: 15 events / 14 users; 1.1.7: 1), 1:1 with
  `app_initalized` on 1.2.0, i.e. it fires on every launch as designed.
  `update_prompt_accepted`: 1 user (~7%). Low tap-through but it also
  repeats each launch; no "dismissed" event exists.
- **`app_check_status` (Android only; one web user generates ~54 events,
  ignore):** Play Integrity / 1.3.1 (26): 38 ready + 4 failed = 42 events,
  21 users, **1 user failed** (all 4 events "Too many attempts." = native
  backoff after an earlier failure; likely a non-Play/local build) ->
  ~5% of users. reCAPTCHA / 1.2.0 (23): 6 ready + 2 failed (both
  `appCheck/throttled`), 7 users -> 2 failed (~29%). Small samples but the
  direction matches the 8/18-10/07 picture (reCAPTCHA ~40% throttled on
  first launch; Play Integrity ~0 for Play installs).
- **Coverage is still ~1/3** of app loads (`app_initalized` vs
  `app_check_status`), expected to stay low because logged-out sessions
  (48 `first_open` installs since 10/19 vs 15 real signups) never emit it.
- **Health:** Firestore `app_errors` holds 2 entries (both throttled,
  10/19 14:26 ET), nothing newer; GA `app_error` 9 events / 4 users since
  10/19. 15 signups since 10/19, **0 orphaned registrations**. No
  email-shaped text in GA `error` at any date (deletion request A has
  run). `localhost` web traffic dropped to 1 user / 9 events since 10/20
  (e2e analytics gate working; remaining is the dev server).
- **10/19 "spike" was the e2e suite** (136 `localhost` web users; gate
  added 10/19 20:53 in efb16f60). Earlier localhost bursts 9/23 and 9/28.

**Still open:** Firestore re-enforcement (needs ~all users on 1.3.x or a
hard minimum-version gate, plus reverting the concurrent
`appCheckTokenReady()` in `UserService.initializeUserSession()`); optional
dev-server analytics gate (`!environment.useEmulators`); a `dismissed`
event for the update dialog if tap-through matters.

## High-level architecture

**Keep `ReCaptchaEnterpriseProvider` for everything else** (web browsers,
and iOS if that's ever a real target - not evaluated here since this app has
no iOS build referenced anywhere in this session). **Add a second, native
Android-only token source**, selected at App Check init time based on
`Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`
(the existing `PwaDetectionService`/`Capacitor` pattern already used
elsewhere in this app - see `src/app/services/pwa-detection.service.ts`).

The critical design point: **`initializeAppCheck()` from `firebase/app-check`
(the existing web SDK call in `app.config.ts`) stays the single App Check
registration point.** That's what Firestore/Storage/Functions' automatic
token-attachment is wired to today, and that shouldn't change. What changes
is *which provider* it's given:

- Non-native (web): `new ReCaptchaEnterpriseProvider(siteKey)` - unchanged.
- Native Android: a `new CustomProvider({ getToken: () => {...} })` whose
  `getToken()` implementation calls into
  [`@capacitor-firebase/app-check`](https://capawesome.io/docs/sdks/capacitor/firebase/app-check/)'s
  native plugin, which on Android automatically uses Play Integrity under
  the hood with no app-side branching needed *within the plugin itself*.

This composes cleanly on paper: `CustomProvider`'s `getToken()` must resolve
`{ token: string, expireTimeMillis: number }`, and the plugin's own
`FirebaseAppCheck.getToken()` already resolves that exact shape - the bridge
is close to a direct pass-through, not a translation layer.

```ts
// Sketch, not final code - see "Biggest open technical question" below
// before treating this as validated.
import { CustomProvider } from 'firebase/app-check';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';

const androidPlayIntegrityProvider = new CustomProvider({
  getToken: async () => {
    const { token, expireTimeMillis } = await FirebaseAppCheck.getToken();
    return { token, expireTimeMillis: expireTimeMillis ?? Date.now() + 3600_000 };
  },
});
```

`appCheckTokenReady()` (`src/app/app-check.ts`), used pervasively this
session to gate early Firestore/callable requests, calls `getToken(appCheck)`
on the shared `AppCheck` instance regardless of which provider backs it - it
should need no changes, just verification once this is wired up.

## Biggest open technical question - resolve this first

`@capacitor-firebase/app-check`'s own docs don't address this app's exact
shape: a Capacitor WebView loading a **remote** URL (`server.url` in
`capacitor.config.ts`, not a bundled `webDir`). All the plugin's examples
assume a fully bundled Capacitor app. Two specific unknowns:

1. Does the plugin's own `FirebaseAppCheck.initialize()` (needed once,
   natively, before `getToken()` will work) conflict with the *existing*
   `initializeAppCheck()` call already running in the web-loaded JS on the
   same underlying Firebase App instance? The plugin's docs describe
   `initialize()` as callable "only once per app," which reads as a
   same-purpose guard, not necessarily a conflict with a *different*
   SDK's registration for the *same* Firebase app - but this needs to be
   confirmed empirically, not assumed.
2. Does the plugin's native activation work at all when the JS calling it
   is served from a live remote origin rather than bundled locally? Nothing
   in the plugin's docs rules this out, but nothing confirms it either.

**Recommended first step if this gets picked up: a small spike**, not a full
implementation - get `@capacitor-firebase/app-check` installed, call
`FirebaseAppCheck.initialize()` + `getToken()` from a real Android test
build of this exact app (remote-URL-loading, not a bundled test app), and
confirm a real Play-Integrity-backed token comes back with the existing
`initializeAppCheck()` still running normally. If that doesn't work cleanly,
the rest of this plan needs rethinking before any further investment.

## Operational prerequisites (not code)

- **Firebase Console**: Security → App Check → Apps tab → register the
  Android app with the Play Integrity provider. Needs the app's SHA-256
  signing certificate fingerprint(s) - likely just the release cert, since
  local/CI testing already uses the emulator-skip path
  (`environment.useEmulators` in `app.config.ts`) rather than needing real
  attestation.
- **Google Play Console**: Release → App Integrity → Play Integrity API →
  link the Cloud project to this app. Requires **Owner** role on the Play
  Console project specifically (group/member access isn't sufficient, per
  Firebase's docs).
- **Play Store distribution model - a real decision, not a formality.**
  Firebase's Play Integrity setup has a strictness setting
  (`PLAY_RECOGNIZED` verdict required or not) that depends on this:
  - If the Android app is exclusively Play Store-distributed, require
    `PLAY_RECOGNIZED` (stricter - confirms Play Store provenance).
  - If sideloading should also be supported/trusted, that verdict can't be
    required - falls back to weaker device-integrity-only signals.
  This ties directly back to the "is a user maybe sideloading" question -
  worth deciding deliberately rather than defaulting to whichever is
  easiest, since it's a real security/coverage tradeoff, not just a config
  toggle.
- **Token TTL** is configurable (30 min - 7 days, default 1h) - tunable
  later to trade off quota usage against attestation freshness. Not a
  launch blocker either way.
- **Quota/cost**: exists, tied to attestation frequency; at this app's
  current traffic volume (low hundreds of daily active users per the
  Analytics checks earlier this session) this is very unlikely to matter,
  but it's a real line item, not zero.

## Code changes (once the spike above is confirmed viable)

- `pnpm add @capacitor-firebase/app-check`, `npx cap sync android`.
- Android native project: per the plugin's docs, optionally pin
  `$firebaseAppCheckPlayIntegrityVersion` in `variables.gradle` for
  dependency-version control; otherwise no `AndroidManifest.xml` changes
  documented.
- `src/app/app-check.ts`: extend `initAppCheck()` (or add a sibling
  function) to branch on native-Android and construct the `CustomProvider`
  as sketched above, instead of always using `ReCaptchaEnterpriseProvider`.
  `appCheckTokenReady()` itself likely needs no changes.
- `app.config.ts`: update the `initAppCheck(app)` call site to pass the
  right provider for the current platform - still skipped entirely under
  `environment.useEmulators`, same as today.
- No changes anticipated to `functions/src/common.ts`'s `callableAppCheck`
  or any of the `enforceAppCheck: true` callables - App Check enforcement on
  the server side doesn't care which provider produced a valid token.

## Testing

- **Not verifiable via the existing Vitest suite alone.** The JS-side
  `CustomProvider` wrapper function itself can have a small unit test
  (mock the plugin's `getToken()`, assert the shape gets passed through
  correctly) - but the actual Play Integrity attestation only works on a
  real native Android build, ideally a real device (emulators typically
  fail real attestation by design, same reason this project's existing
  `useEmulators` path skips App Check entirely).
- Firebase's debug-provider pattern (a registered debug token, allowed
  in Firebase Console) is the standard way to test the native flow in CI or
  on an emulator without real attestation - this is a **different**
  mechanism from the existing `environment.useEmulators` skip and would
  need its own setup if automated native testing is wanted later. Not
  required for a manual real-device validation pass.
- This project's Playwright e2e suite runs against the web build, not the
  native Android shell - should be unaffected either way, but worth a
  one-line sanity check once this ships.

## Rollout, once implemented

Mirrors the pattern already used for the Firestore/Storage/Functions
rollout this session: ship the code, watch the App Check console (if it
breaks out Android-specific verified/invalid metrics - not confirmed yet,
worth checking once there's real traffic on the new provider) and the
`app_errors` log for `appCheck/throttled` recurrence specifically on
Android `additionalInfo` entries. A clean stretch on real Android traffic
is the signal this actually fixed the confirmed mechanism, not just moved
it.

## The one thing every other fix this session didn't have to deal with

Everything shipped this session (App Check enforcement, the login-race fix,
the Groups-page linking work, the `additionalInfo` diagnostic) reached every
Android user **immediately**, regardless of their installed native app
version - because `capacitor.config.ts`'s `server.url` means the Android
shell always loads the *live* web bundle over the network, not a bundled
copy. This fix is different: `@capacitor-firebase/app-check` is a **native**
Capacitor plugin - it has to be compiled into the Android APK itself. Users
on an old native app build (recall the "many users still on v1.1.7" Analytics
chart from earlier this session) won't get this fix until they install a
new native app version, whether via Play Store auto-update or a manual
sideload update. That's a real adoption-lag consideration this specific fix
has that nothing else in this whole investigation did.

## Rough scope, honestly

Bigger than anything else done in this investigation: a native Android
build/Gradle change (not just a web deploy), Play Console admin access,
a new Firebase Console provider registration with a real security-tradeoff
decision embedded in it, real-device testing (not just `pnpm exec ng test`),
and a native app release cycle to actually reach users - not a same-day
turnaround like the rest of this session's fixes. The spike above is the
right-sized first step if this gets picked up: small, cheap, and answers
the one question that determines whether the rest of this plan is even
viable as designed.
