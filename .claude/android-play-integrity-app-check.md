# Android Play Integrity for App Check — Scoping

Status as of 2026-08-19: **Not started, not scheduled.** Written up on request
after the third confirmed `appCheck/throttled` incident (see
[[app-check-enforcement-followup.md]]) directly identified Android WebView as
the mechanism via the new `additionalInfo` diagnostic, rather than leaving it
as inference. This doc exists so a decision to proceed doesn't start from
zero - it lays out what's actually involved, not just "add Play Integrity."
Written from research (Firebase's official docs + the Capacitor plugin's
docs), not from having built any of it - some of what's below is a plan to
verify, not a guarantee.

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
- Not tested yet: a fresh Play-installed build with the rule fix
  (versionCode 25), and the other Capacitor plugins' release behavior
  generally (camera was just the first to hit this).
- Test tips: `adb` is at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`;
  Android Studio Run/Debug both use the selected *build variant* (default
  debug); running `release` locally needs a temporary
  `signingConfig signingConfigs.debug` (don't commit it).

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
