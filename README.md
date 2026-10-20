# PipSplit

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 13.2.6.

## Local setup

A few gitignored config files need to be created locally before the app
will build/run. Each has an `.example` template checked into git - copy it,
drop the `.example` suffix, and fill in real values (see the comments in
each template for where the values come from):

| Template | Copy to | Required for |
|---|---|---|
| `src/app/firebase.config.example.ts` | `src/app/firebase.config.ts` | Building the app at all - `app.config.ts` imports from it unconditionally |
| `src/app/github.config.example.ts` | `src/app/github.config.ts` | The Help feature's "report an issue" flow |
| `functions/.env.example` | `functions/.env` | Sending email locally via the Functions emulator |
| `.env.example` | `.env` | Running `pnpm deps:dry-run` / `pnpm deps:fix` (dependabot-agent) locally |

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `pnpm test` to execute the unit tests (Vitest via `@angular/build:unit-test`).

## Running end-to-end tests

End-to-end tests use Playwright against an isolated Firebase emulator suite (project `demo-pipsplit-test`, non-default ports) that the commands below start, seed and stop for you:

- `pnpm e2e` - run the suite headless (also `pnpm e2e:headed`, `pnpm e2e:ui`, `pnpm e2e:debug`)
- `pnpm test:area <area...> [--unit|--e2e]` - run one product area's unit, functions and e2e tests; `pnpm test:area --check` verifies every test is assigned to an area
- `pnpm e2e:report` - view the last report; `pnpm e2e:install` - install Playwright's browser (after Playwright upgrades)

See [e2e/README.md](e2e/README.md) for prerequisites (including Java for the Firestore emulator) and details.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
