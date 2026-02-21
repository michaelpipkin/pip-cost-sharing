- Loading Service Architecture
  The LoadingService uses a signal-based approach that covers the entire screen with an overlay and loading indicator when `loadingOn()` is called. This effectively disables the entire interface, so individual form disabling during loading states is unnecessary. Components should rely on this service for consistent loading UX across the application.

- Coding conventions and preferences
  We should always prefer the newer signals API over older conventions. This includes using signals-based methods like effect() and afterNextRender() in constructors in place of ngOnInit. No components should be implementing the older lifecycle hooks. We do not use rxjs at all in this project. We should also always use the newer @if and @for blocks instead of *ngIf, *ngFor, etc. All class-level `inject()` calls should use `protected readonly` (e.g., `protected readonly analytics = inject(AnalyticsService)`). Exceptions are `#field` private class fields (JS-level privacy) and function-scoped `const` injections in guards/resolvers.

- Firebase documents
  Whenever possible, we should use Document References rather than id when referring to documents. I have created a custom equality operator to compare Document References (`object1.ref.eq(object2.ref)`), and a custom directive (docRefCompare) to allow mat-selects to use Document References as the value.

- Styling
  Whenever possible, use styles from the './src/styles.scss' stylesheet. Add any needed potentially useful shared styles to that stylesheet. Only add styles in component-specific stylesheets for very specific needs.

- Package management
  We use pnpm, not npm, for all package management and script execution in this project.

- Building the project
  When in the project root, we simply use 'ng build' to build the project. After making changes to any code in the functions folder, we have to move to the functions directory and run 'pnpm run build' in order to build the functions before testing them.