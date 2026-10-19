// Map of product areas to the tests that cover them. Drives `pnpm test:area`.
//
//   unit       Paths under src/ as accepted by `ng test --include` (a spec file
//              or a directory; directories cover everything beneath them).
//   functions  Cloud Functions spec files, relative to functions/.
//   tag        The Playwright tag for the area's e2e tests (`@<name>`).
//
// Cross-cutting code (services, shared components, directives, pipes,
// utilities) is listed under EVERY area whose code imports it, so running an
// area covers the shared code it relies on, and touching shared code runs every
// area that depends on it. That includes the app-wide primitives (analytics, the
// snackbar, app-check error handling, the user service): each is spread into
// every area whose code imports it, directly or through another service. They
// are mocked in most feature specs, so their own specs only run via the areas
// listed here.
//
// `pnpm test:area --check` fails if a unit spec, functions spec or e2e test is
// not covered here, or if an entry here matches no spec - keep it in sync when
// adding specs.

const FEATURES = 'app/features';
const SERVICES = 'app/services';
const COMPONENTS = 'app/shared/components';
const DIRECTIVES = 'app/shared/directives';
const PIPES = 'app/shared/pipes';
const UTILITIES = 'app/utilities';

// ---------------------------------------------------------------------------
// Shared building blocks, composed into each area that depends on them.
// ---------------------------------------------------------------------------

// Currency/number formatting. The currency-config spec covers the model that
// locale.service builds on.
const LOCALE = [
  `${SERVICES}/locale.service.spec.ts`,
  'app/models/currency-config.spec.ts',
];
const GUIDED_TOUR = [`${SERVICES}/guided-tour.service.spec.ts`];
const SORTING = [`${SERVICES}/sorting.service.spec.ts`];
const CONFIRM_DIALOG = [`${COMPONENTS}/confirm-dialog`];
const DELETE_DIALOG = [`${COMPONENTS}/delete-dialog`];
const CALCULATOR = [`${COMPONENTS}/calculator`];
const ACTIVE_INACTIVE_PIPE = [`${PIPES}/active-inactive.pipe.spec.ts`];
const FORMAT_CURRENCY_INPUT = [
  `${DIRECTIVES}/format-currency-input.directive.spec.ts`,
];
const SELECT_ON_FOCUS = [`${DIRECTIVES}/select-on-focus.directive.spec.ts`];
const ALLOCATION_UTILS = [`${UTILITIES}/allocation-utils.service.spec.ts`];
const RENTAL_UTILS = [`${UTILITIES}/rental-utils.service.spec.ts`];
const STRING_UTILS = [`${UTILITIES}/string-utils.service.spec.ts`];
// Receipt capture plumbing shared by the scan-receipt page and the expense forms.
const RECEIPT_CAPTURE = [
  `${SERVICES}/camera.service.spec.ts`,
  `${SERVICES}/receipt-file-selection.service.spec.ts`,
  `${SERVICES}/receipt-scan-handoff.service.spec.ts`,
  `${COMPONENTS}/file-selection-dialog`,
  `${COMPONENTS}/receipt-dialog`,
];

// App-wide primitives. Membership comes from the real imports, not from how
// "central" the code feels:
//  - ANALYTICS: imported by every feature (and by guided-tour.service) -> all 16.
//  - SNACKBAR: every area except home and rental, which never show one.
//  - APP_CHECK_ERRORS: the error handler (+ its dialog and util) is imported by
//    the account-deletion, admin, expense-form, scan-receipt, groups, members and
//    summary code, and by user.service.
//  - USER_SERVICE: app shell, auth/account, history, summary, and
//    receipt-dialog (so expenses and receipts).
const ANALYTICS = [
  `${SERVICES}/analytics.service.spec.ts`,
  `${UTILITIES}/analytics-privacy.util.spec.ts`,
];
const SNACKBAR = [`${COMPONENTS}/custom-snackbar`];
const APP_CHECK_ERRORS = [
  `${SERVICES}/app-check-error-handler.service.spec.ts`,
  `${COMPONENTS}/app-check-error-dialog`,
  `${UTILITIES}/app-check-error.util.spec.ts`,
];
const USER_SERVICE = [`${SERVICES}/user.service.spec.ts`];

export const AREAS = {
  // App bootstrap, layout chrome, ads/PWA/theme plumbing and the app-wide
  // primitives described above.
  shell: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      'app/app.component.spec.ts',
      'app/app-check.spec.ts',
      'app/firebase-options.spec.ts',
      `${FEATURES}/about`,
      `${SERVICES}/admob.service.spec.ts`,
      `${SERVICES}/adsense.service.spec.ts`,
      `${SERVICES}/app-update-prompt.service.spec.ts`,
      `${SERVICES}/deep-link.service.spec.ts`,
      `${SERVICES}/page-title-strategy.service.spec.ts`,
      `${SERVICES}/pwa-detection.service.spec.ts`,
      `${SERVICES}/theme.service.spec.ts`,
      `${COMPONENTS}/account-menu`,
      `${COMPONENTS}/footer`,
      `${COMPONENTS}/loading`,
      `${COMPONENTS}/update-prompt-dialog`,
    ],
    // Mail delivery suppression applies to every email the backend sends.
    functions: ['src/mail-suppression.spec.ts'],
    tag: '@shell',
  },

  // Sign-in, registration, password flows and route guards.
  auth: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/auth/account-action`,
      `${FEATURES}/auth/auth-main`,
      `${FEATURES}/auth/forgot-password`,
      `${FEATURES}/auth/guards.guard.spec.ts`,
      `${FEATURES}/auth/login`,
      `${FEATURES}/auth/register`,
      `${FEATURES}/auth/reset-password`,
      `${SERVICES}/group.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${SERVICES}/member-link.service.spec.ts`,
      `${SERVICES}/pwa-detection.service.spec.ts`,
      ...CONFIRM_DIALOG,
    ],
    functions: [
      'src/email-normalization.spec.ts',
      'src/sync-group-member-uids.spec.ts',
    ],
    tag: '@auth',
  },

  // Signed-in user's account: profile, group memberships, account deletion.
  account: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/auth/account`,
      `${FEATURES}/auth/delete-account`,
      `${SERVICES}/group.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${COMPONENTS}/account-menu`,
      ...CONFIRM_DIALOG,
    ],
    functions: ['src/user-deletion.spec.ts'],
    tag: '@account',
  },

  // Creating/managing groups, group settings, invitations to join.
  groups: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      `${FEATURES}/groups`,
      `${SERVICES}/expense.service.spec.ts`,
      `${SERVICES}/group.service.spec.ts`,
      `${SERVICES}/invite.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${SERVICES}/member-link.service.spec.ts`,
      ...LOCALE,
      ...GUIDED_TOUR,
      ...CONFIRM_DIALOG,
    ],
    functions: [
      'src/email-formatting.spec.ts',
      'src/email-normalization.spec.ts',
      'src/invite-email.spec.ts',
      'src/link-invited-members.spec.ts',
      'src/mail-suppression.spec.ts',
      'src/sync-group-member-uids.spec.ts',
    ],
    tag: '@groups',
  },

  // Group members and invitations.
  members: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      `${FEATURES}/members`,
      `${SERVICES}/invite.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${SERVICES}/member-link.service.spec.ts`,
      ...SORTING,
      ...GUIDED_TOUR,
      ...ACTIVE_INACTIVE_PIPE,
      ...CONFIRM_DIALOG,
      ...DELETE_DIALOG,
    ],
    functions: [
      'src/email-formatting.spec.ts',
      'src/email-normalization.spec.ts',
      'src/invite-email.spec.ts',
      'src/link-invited-members.spec.ts',
      'src/mail-suppression.spec.ts',
      'src/sync-group-member-uids.spec.ts',
    ],
    tag: '@members',
  },

  categories: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      `${FEATURES}/categories`,
      `${SERVICES}/category.service.spec.ts`,
      ...SORTING,
      ...GUIDED_TOUR,
      ...ACTIVE_INACTIVE_PIPE,
      ...DELETE_DIALOG,
    ],
    functions: [],
    tag: '@categories',
  },

  // Expense list, add/edit expense forms, expense filtering. Rental expenses
  // and receipt scanning have their own areas but the forms depend on them.
  expenses: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/expenses/add-expense`,
      `${FEATURES}/expenses/add-expense-options-dialog`,
      `${FEATURES}/expenses/edit-expense`,
      `${FEATURES}/expenses/expense-form.tour.spec.ts`,
      `${FEATURES}/expenses/expenses`,
      `${SERVICES}/category.service.spec.ts`,
      `${SERVICES}/expense.service.spec.ts`,
      `${SERVICES}/memorized.service.spec.ts`,
      `${SERVICES}/split.service.spec.ts`,
      `${SERVICES}/table-filter.service.spec.ts`,
      `${COMPONENTS}/filter-panels`,
      `${PIPES}/yes-no.pipe.spec.ts`,
      `${PIPES}/yes-no-na.pipe.spec.ts`,
      ...RECEIPT_CAPTURE,
      ...LOCALE,
      ...SORTING,
      ...GUIDED_TOUR,
      ...CALCULATOR,
      ...CONFIRM_DIALOG,
      ...DELETE_DIALOG,
      ...ACTIVE_INACTIVE_PIPE,
      ...FORMAT_CURRENCY_INPUT,
      ...SELECT_ON_FOCUS,
      ...ALLOCATION_UTILS,
      ...RENTAL_UTILS,
      ...STRING_UTILS,
    ],
    functions: [],
    tag: '@expenses',
  },

  // Rental expense entry and its room-based split grid.
  rental: {
    unit: [
      ...ANALYTICS,
      `${FEATURES}/expenses/rental`,
      `${FEATURES}/split/split-rental-grid`,
      ...LOCALE,
      ...GUIDED_TOUR,
      ...CONFIRM_DIALOG,
      ...FORMAT_CURRENCY_INPUT,
      ...ALLOCATION_UTILS,
      ...RENTAL_UTILS,
      ...STRING_UTILS,
    ],
    functions: [],
    tag: '@rental',
  },

  // Receipt scanning/OCR from the app side and the OCR/parsing backend.
  receipts: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/expenses/scan-receipt`,
      `${SERVICES}/receipt-scan.service.spec.ts`,
      ...RECEIPT_CAPTURE,
      ...LOCALE,
      ...GUIDED_TOUR,
      ...CONFIRM_DIALOG,
      ...FORMAT_CURRENCY_INPUT,
      ...STRING_UTILS,
    ],
    functions: ['src/receipt-ocr.spec.ts', 'src/receipt-parser.spec.ts'],
    tag: '@receipts',
  },

  // Memorized (recurring/template) expenses.
  memorized: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      `${FEATURES}/memorized`,
      `${SERVICES}/category.service.spec.ts`,
      `${SERVICES}/memorized.service.spec.ts`,
      `${SERVICES}/split.service.spec.ts`,
      ...LOCALE,
      ...GUIDED_TOUR,
      ...CALCULATOR,
      ...DELETE_DIALOG,
      ...FORMAT_CURRENCY_INPUT,
      ...SELECT_ON_FOCUS,
      ...ALLOCATION_UTILS,
      ...STRING_UTILS,
    ],
    functions: [],
    tag: '@memorized',
  },

  // Balances, payments and settle-up (including the settle-up email).
  summary: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/summary`,
      `${SERVICES}/history.service.spec.ts`,
      `${SERVICES}/split.service.spec.ts`,
      ...LOCALE,
      ...GUIDED_TOUR,
    ],
    functions: [
      'src/category-breakdown.spec.ts',
      'src/email-formatting.spec.ts',
      'src/mail-suppression.spec.ts',
      'src/settle-email.spec.ts',
    ],
    tag: '@summary',
  },

  // Payment/settlement history and its detail view.
  history: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/history`,
      `${SERVICES}/history.service.spec.ts`,
      ...LOCALE,
      ...SORTING,
      ...GUIDED_TOUR,
      ...CONFIRM_DIALOG,
    ],
    functions: [],
    tag: '@history',
  },

  // The standalone split calculator.
  split: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      `${FEATURES}/split`,
      `${SERVICES}/split.service.spec.ts`,
      ...LOCALE,
      ...GUIDED_TOUR,
      ...CALCULATOR,
      ...FORMAT_CURRENCY_INPUT,
      ...SELECT_ON_FOCUS,
      ...ALLOCATION_UTILS,
      ...RENTAL_UTILS,
      ...STRING_UTILS,
    ],
    functions: [],
    tag: '@split',
  },

  home: {
    unit: [
      `${FEATURES}/home`,
      `${SERVICES}/pwa-detection.service.spec.ts`,
      ...ANALYTICS,
    ],
    functions: [],
    tag: '@home',
  },

  // Help dialog/page, help content and the guided-tour engine.
  help: {
    unit: [
      ...ANALYTICS,
      ...SNACKBAR,
      `${FEATURES}/help`,
      `${SERVICES}/help.service.spec.ts`,
      `${SERVICES}/help-content.service.spec.ts`,
      ...GUIDED_TOUR,
    ],
    functions: [],
    tag: '@help',
  },

  // Site-admin screens (email log, reports) and their backend.
  admin: {
    unit: [
      `${FEATURES}/admin`,
      ...ANALYTICS,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...CONFIRM_DIALOG,
      ...DELETE_DIALOG,
    ],
    functions: ['src/admin-reports.spec.ts'],
    tag: '@admin',
  },
};
