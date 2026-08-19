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
