# E2E tests (Playwright)

Playwright specs for PipSplit. They run against an isolated Firebase emulator suite (project `demo-pipsplit-test`, non-default ports) that is started, seeded and torn down for you. Chromium only.

For how to write or fix specs (shared seed data, ownership rules, selectors, gotchas), see the `pip-angular-testing` skill (`~/.claude/skills/pip-angular-testing/SKILL.md`).

## Prerequisites

- Dependencies installed (`pnpm install`).
- Playwright's Chromium: run `pnpm e2e:install` once, and again after upgrading `@playwright/test`.
- Java on the PATH (the Firestore emulator needs it).
- The test ports free (below). If a crashed run leaves emulators behind: `pnpm kill-test-ports`.

## Running

```bash
pnpm e2e                        # whole suite, headless
pnpm e2e --grep "@expenses"     # extra Playwright args are passed through
pnpm e2e e2e/infra/seed.spec.ts # a single spec file
pnpm e2e:headed                 # visible browser
pnpm e2e:ui                     # Playwright UI mode
pnpm e2e:debug                  # Playwright inspector
pnpm e2e:local                  # alias for pnpm e2e
pnpm e2e:report                 # open the last HTML report (no emulators needed)
```

`pnpm e2e` builds the functions, starts the test emulators (auth, firestore, storage, functions), runs Playwright, and shuts the emulators down. Playwright then starts the app with `ng serve --configuration e2e` on port 4300 (it never reuses a server already on 4300; a busy port fails the run). Global setup clears Auth and Firestore once, seeds the data set in `e2e/seed/`, then signs in as a shared user and loads each main route once to warm the dev server; tests never clear data. A full run takes about 4-5 minutes (longer on a cold machine); results are in `test-results/results.json` and `playwright-report/`, overwritten by the next run.

### By area

Each product area (defined in `scripts/test-area/areas.mjs`) has unit specs, Cloud Functions specs and tagged e2e tests:

```bash
pnpm test:area expenses              # unit + functions + e2e for the area
pnpm test:area expenses summary      # several areas
pnpm test:area expenses --unit       # app unit specs only (no emulators)
pnpm test:area expenses --e2e        # functions specs + e2e (everything needing emulators)
pnpm test:area --check               # every spec/test is assigned to an area
```

### Related

```bash
pnpm --dir functions test     # Cloud Functions specs on the test emulators
pnpm test                     # app unit specs (Vitest, jsdom)
pnpm test:scripts             # node:test specs for scripts/
pnpm screenshots:feature-tour # feature-tour screenshot capture (separate config, dev emulators on 4200)
```

## Test environment

- Project `demo-pipsplit-test`. Ports: auth 19099, firestore 18080, storage 19199, functions 15001, hub 14400, logging 14500; the app is on 4300. The source of truth is `scripts/test-env/config.mjs`; the copies in `firebase.test.json`, `environment.e2e.ts`, `functions/vitest.config.ts` and `functions/test/global-setup.ts` are checked by `scripts/test-env/config-agreement.test.mjs` (`pnpm test:scripts`).
- Never the default emulator ports - those are the dev emulators.
- Outgoing mail is suppressed under `demo-*` projects (the mail queue records a delivery with `messageId: 'suppressed'`).
- Playwright runs 2 workers (more time out on first page loads on the owner's machine; `pnpm e2e --workers 4` is an occasional order-independence check). No retries. Traces are kept on failure (`pnpm e2e:report`), video is off.
- Do not set `E2E_TARGET` when running the suite; global setup rejects it (it is only for the feature-tour capture config).

## Layout

```
e2e/
  global-setup.ts   # verifies emulators, clears Auth + Firestore once, seeds, warms routes
  seed/             # shared deterministic data set (types, validate, write, datasets/)
  fixtures/         # seededPage (clipboard permissions), browserWarmUp (per worker)
  utils/            # session.ts (signInAs), warm-up.ts, clipboard.ts
  pages/            # page objects
  infra/            # seed health spec (@infra, runs with every area)
  auth/ smoke/ groups/ critical-flows/   # specs
  feature-tour/     # screenshot capture config (not part of the suite)
```
