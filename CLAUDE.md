- Loading Service Architecture
  The LoadingService uses a signal-based approach that covers the entire screen with an overlay and loading indicator when `loadingOn()` is called. This effectively disables the entire interface, so individual form disabling during loading states is unnecessary. Components should rely on this service for consistent loading UX across the application.

- Coding conventions and preferences
  We should always prefer the newer signals API over older conventions. This includes using signals-based methods like effect() and afterNextRender() in constructors in place of ngOnInit. No components should be implementing the older lifecycle hooks. We do not use rxjs at all in this project. We should also always use the newer @if and @for blocks instead of *ngIf, *ngFor, etc. All class-level `inject()` calls should use `protected readonly` (e.g., `protected readonly analytics = inject(AnalyticsService)`). Exceptions are `#field` private class fields (JS-level privacy) and function-scoped `const` injections in guards/resolvers.

  Any time you touch a file during a task, actively look for and flag opportunities to improve code quality — including no-op code, potential bugs, inefficiencies, outdated patterns, and convention violations — and fix them as part of the same task unless the scope would be disproportionately large.

- Firebase documents
  Whenever possible, we should use Document References rather than id when referring to documents. I have created a custom equality operator to compare Document References (`object1.ref.eq(object2.ref)`), and a custom directive (docRefCompare) to allow mat-selects to use Document References as the value.

- Styling
  Whenever possible, use styles from the './src/styles.scss' stylesheet. Add any needed potentially useful shared styles to that stylesheet. Only add styles in component-specific stylesheets for very specific needs.

- Package management
  We use pnpm, not npm, for all package management and script execution in this project.

- Building the project
  When in the project root, we simply use 'ng build' to build the project. After making changes to any code in the functions folder, we have to move to the functions directory and run 'pnpm run build' in order to build the functions before testing them.

- Testing
  Whenever a feature is changed, update or add that area's unit, Cloud Functions and e2e tests in the same task, then run `pnpm test:area <area>` and report the result before calling the task done. The areas live in `scripts/test-area/areas.mjs`; new source files, specs and e2e tests must be assigned there, and `pnpm test:area --check` must pass. E2E and functions tests run only on the isolated test emulators (project `demo-pipsplit-test`, non-default ports) via `pnpm e2e` / `pnpm test:area` / `pnpm --dir functions test` - never against the default emulator ports, and never with per-test data clears. For e2e patterns, the shared seed data and its ownership rules, load the `pip-angular-testing` skill.