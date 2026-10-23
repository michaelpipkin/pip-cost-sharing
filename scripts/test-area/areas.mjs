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
// locale.service builds on; the groupCurrency pipe is how templates use it.
const LOCALE = [
  `${SERVICES}/locale.service.spec.ts`,
  'app/models/currency-config.spec.ts',
  `${PIPES}/group-currency.pipe.spec.ts`,
];
// The tour engine plus the spotlight and card it renders.
const GUIDED_TOUR = [
  `${SERVICES}/guided-tour.service.spec.ts`,
  `${COMPONENTS}/guided-tour`,
];
// The helper the page tours use to switch between the dialogs a step opens
// (categories, expenses, groups, members and summary).
const GUIDED_TOUR_DIALOGS = [`${SERVICES}/guided-tour-dialogs.spec.ts`];
// Signal stores imported directly by an area's code (reports: admin only).
const GROUP_STORE = ['app/store/group.store.spec.ts'];
const USER_STORE = ['app/store/user.store.spec.ts'];
const MEMBER_STORE = ['app/store/member.store.spec.ts'];
const CATEGORY_STORE = ['app/store/category.store.spec.ts'];
const REPORTS_STORE = ['app/store/reports.store.spec.ts'];
const SORTING = [`${SERVICES}/sorting.service.spec.ts`];
const MEDIA_QUERY = [`${SERVICES}/media-query.service.spec.ts`];
const CONFIRM_DIALOG = [`${COMPONENTS}/confirm-dialog`];
const DELETE_DIALOG = [`${COMPONENTS}/delete-dialog`];
// The calculator component plus the overlay service that opens it from the
// amount fields.
const CALCULATOR = [
  `${COMPONENTS}/calculator`,
  `${SERVICES}/calculator-overlay.service.spec.ts`,
];
const ACTIVE_INACTIVE_PIPE = [`${PIPES}/active-inactive.pipe.spec.ts`];
const FORMAT_CURRENCY_INPUT = [
  `${DIRECTIVES}/format-currency-input.directive.spec.ts`,
];
const SELECT_ON_FOCUS = [`${DIRECTIVES}/select-on-focus.directive.spec.ts`];
// Enter-saves on the add/edit forms (the button[defaultButton] directive).
const DEFAULT_BUTTON = [`${DIRECTIVES}/default-button.directive.spec.ts`];
const ALLOCATION_UTILS = [`${UTILITIES}/allocation-utils.service.spec.ts`];
// Date helpers behind the expense/history/split services and the user
// service, the Timestamp extension and the expense/summary forms.
const DATE_UTILS = [`${UTILITIES}/date-utils.spec.ts`];
// DocumentReference.eq, used by the services, stores and forms that compare refs.
const DOC_REF_EXTENSIONS = ['app/extensions/doc-ref-extensions.spec.ts'];
// The docRefCompare directive on the mat-selects that bind DocumentReferences.
const DOC_REF_COMPARE = [`${DIRECTIVES}/doc-ref-compare.directive.spec.ts`];
// The +/-/t/m/y shortcuts on date inputs (expense forms, summary, filter panels).
const DATE_SHORTCUT_KEYS = [`${DIRECTIVES}/date-plus-minus.directive.spec.ts`];
// The app-wide datepicker adapter (app.config), so every area with a datepicker.
const CUSTOM_DATE_ADAPTER = [`${UTILITIES}/custom-date-adapter.service.spec.ts`];
const YES_NO_CHECK_PIPE = [`${PIPES}/yes-no-check.pipe.spec.ts`];
const SPLIT_METHOD_TOGGLE = [
  `${COMPONENTS}/split-method-toggle/split-method-toggle.component.spec.ts`,
];
// The Expense model (receipt getters, defaults); expenses and receipts use it.
const EXPENSE_MODEL = ['app/models/expense.spec.ts'];
// Used by account-security (auth-main is covered by the auth area's directory).
const PASSWORD_MATCH_SCHEMA = [
  `${FEATURES}/auth/auth-main/password-match-schema.spec.ts`,
];
const RENTAL_UTILS = [`${UTILITIES}/rental-utils.service.spec.ts`];
const STRING_UTILS = [`${UTILITIES}/string-utils.service.spec.ts`];
// The single-email-address rule (and its signal-forms validator) used by the
// forms that store or send to an address (add/edit member, account profile,
// register, help) and by canInvite and add-group. Login and forgot password
// keep Angular's validator (ruling R6). Its server copy is checked in
// email-formatting.spec.ts, its Firestore-rules copy by the
// @members/@account/@auth e2e spec e2e/infra/email-rules.spec.ts.
const EMAIL_VALIDATION = [`${UTILITIES}/email-validation.spec.ts`];
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
//  - LOADING (LoadingService + loading component): every area except rental,
//    split and home. footer and theme.service stay shell-only: nothing outside
//    app.component imports them (the `footer` hits in expenses are mat-footer).
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
// The server side of the user service's group emails (payment requests and
// unpay notices): a functions spec, so it goes in each area's `functions`
// list wherever USER_SERVICE is in its `unit` list.
const USER_SERVICE_FUNCTIONS = ['src/group-emails.spec.ts'];
const LOADING = [`${COMPONENTS}/loading`];
// The mail queue sender (every email the backend sends goes through it) and
// the shared helpers it and the callables build on (admin check, delivery
// shapes, SMTP secret). Run with every area that sends mail.
const MAIL_QUEUE_FUNCTIONS = ['src/mail-queue.spec.ts', 'src/common.spec.ts'];
// The triggers that keep users/members emailLower in step with email (the
// field invite linking and member lookups match on).
const EMAIL_LOWER_FUNCTIONS = ['src/email-lower-sync.spec.ts'];
// Invite linking only through a verified address (Plan 4 B14): the
// linkInvitedMembers callable (token email, verified) and the sign-up
// trigger's verified-only profile email. Run with every area whose flows
// register, verify or change an address, or link invited members.
const INVITE_LINKING_FUNCTIONS = [
  'src/link-invited-members.spec.ts',
  'src/user-onboarding.spec.ts',
];

// The group-email change callables (Plan 4 B19): edit-member requests a
// change, the auth confirm-group-email page confirms it, and Account >
// Profile's Sync and the group email update dialog call updateMemberEmails.
const MEMBER_EMAIL_FUNCTIONS = ['src/member-email.spec.ts'];
// Reads a callable's code and server message (edit-member, the confirm
// page, Profile's Sync, the group email update dialog): with every area
// whose code imports it.
const CALLABLE_ERROR = [`${UTILITIES}/callable-error.util.spec.ts`];
// The safe sign-in returnUrl (B20): the auth guards put the attempted page on
// the login URL, and the group service returns the user there after sign-in.
// With every area that lists the guards or the group service.
const RETURN_URL = [`${UTILITIES}/return-url.util.spec.ts`];
// The dialog the app shell opens after a login-email change (B20).
const GROUP_EMAIL_UPDATE_DIALOG = [
  `${FEATURES}/auth/group-email-update-dialog`,
];

export const AREAS = {
  // App bootstrap, layout chrome, ads/PWA/theme plumbing and the app-wide
  // primitives described above.
  shell: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...CUSTOM_DATE_ADAPTER,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      'app/app.component.spec.ts',
      ...GROUP_EMAIL_UPDATE_DIALOG,
      ...CALLABLE_ERROR,
      ...RETURN_URL,
      `${SERVICES}/member.service.spec.ts`,
      'app/app-check.spec.ts',
      'app/firebase-options.spec.ts',
      `${FEATURES}/about`,
      `${FEATURES}/auth/guards.guard.spec.ts`,
      `${SERVICES}/admob.service.spec.ts`,
      `${SERVICES}/adsense.service.spec.ts`,
      `${SERVICES}/app-update-prompt.service.spec.ts`,
      `${SERVICES}/deep-link.service.spec.ts`,
      `${SERVICES}/page-title-strategy.service.spec.ts`,
      `${SERVICES}/pwa-detection.service.spec.ts`,
      `${SERVICES}/theme.service.spec.ts`,
      `${COMPONENTS}/account-menu`,
      `${COMPONENTS}/footer`,
      `${COMPONENTS}/update-prompt-dialog`,
    ],
    // Mail delivery suppression applies to every email the backend sends.
    functions: [
      'src/log-app-error.spec.ts',
      'src/mail-suppression.spec.ts',
      ...MAIL_QUEUE_FUNCTIONS,
      // The group email update dialog the shell opens (updateMemberEmails).
      ...MEMBER_EMAIL_FUNCTIONS,
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@shell',
  },

  // Sign-in, registration, password flows and route guards.
  auth: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/auth/account-action`,
      `${FEATURES}/auth/auth-main`,
      `${FEATURES}/auth/confirm-group-email`,
      ...CALLABLE_ERROR,
      ...GROUP_EMAIL_UPDATE_DIALOG,
      ...RETURN_URL,
      `${FEATURES}/auth/delete-account`,
      `${FEATURES}/auth/forgot-password`,
      `${FEATURES}/auth/guards.guard.spec.ts`,
      `${FEATURES}/auth/login`,
      `${FEATURES}/auth/register`,
      `${FEATURES}/auth/reset-password`,
      ...EMAIL_VALIDATION,
      `${SERVICES}/group.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${SERVICES}/member-link.service.spec.ts`,
      `${SERVICES}/pwa-detection.service.spec.ts`,
      ...CONFIRM_DIALOG,
    ],
    functions: [
      'src/email-normalization.spec.ts',
      'src/sync-group-member-uids.spec.ts',
      'src/user-deletion.spec.ts',
      'src/verify-user-email.spec.ts',
      ...INVITE_LINKING_FUNCTIONS,
      ...MEMBER_EMAIL_FUNCTIONS,
      ...MAIL_QUEUE_FUNCTIONS,
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@auth',
  },

  // Signed-in user's account: profile, group memberships, account deletion.
  account: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...PASSWORD_MATCH_SCHEMA,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/auth/account`,
      `${FEATURES}/auth/delete-account`,
      ...GROUP_EMAIL_UPDATE_DIALOG,
      ...CALLABLE_ERROR,
      ...RETURN_URL,
      ...EMAIL_VALIDATION,
      `${SERVICES}/group.service.spec.ts`,
      `${SERVICES}/member.service.spec.ts`,
      `${COMPONENTS}/account-menu`,
      ...CONFIRM_DIALOG,
    ],
    functions: [
      'src/delete-user-account.spec.ts',
      'src/user-deletion.spec.ts',
      'src/verify-user-email.spec.ts',
      ...EMAIL_LOWER_FUNCTIONS,
      ...INVITE_LINKING_FUNCTIONS,
      // Profile's Sync and the group email update dialog (updateMemberEmails).
      ...MEMBER_EMAIL_FUNCTIONS,
      ...MAIL_QUEUE_FUNCTIONS,
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@account',
  },

  // Creating/managing groups, group settings, invitations to join.
  groups: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...GUIDED_TOUR_DIALOGS,
      ...DATE_UTILS,
      ...EXPENSE_MODEL,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      `${FEATURES}/groups`,
      ...DEFAULT_BUTTON,
      ...EMAIL_VALIDATION,
      ...RETURN_URL,
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
      'src/delete-group.spec.ts',
      'src/email-formatting.spec.ts',
      'src/email-normalization.spec.ts',
      'src/invite-email.spec.ts',
      ...INVITE_LINKING_FUNCTIONS,
      'src/send-group-invite.spec.ts',
      'src/mail-suppression.spec.ts',
      ...MAIL_QUEUE_FUNCTIONS,
      'src/sync-group-member-uids.spec.ts',
    ],
    tag: '@groups',
  },

  // Group members and invitations.
  members: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...GUIDED_TOUR_DIALOGS,
      ...DOC_REF_EXTENSIONS,
      ...YES_NO_CHECK_PIPE,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      `${FEATURES}/members`,
      // Where a member's group email change is confirmed (B19).
      `${FEATURES}/auth/confirm-group-email`,
      ...CALLABLE_ERROR,
      ...DEFAULT_BUTTON,
      ...EMAIL_VALIDATION,
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
      // Verified group emails (B19): requestMemberEmailChange from
      // edit-member, confirmMemberEmailChange from the auth confirm page.
      ...MEMBER_EMAIL_FUNCTIONS,
      ...EMAIL_LOWER_FUNCTIONS,
      ...INVITE_LINKING_FUNCTIONS,
      'src/send-group-invite.spec.ts',
      'src/mail-suppression.spec.ts',
      ...MAIL_QUEUE_FUNCTIONS,
      'src/sync-group-member-uids.spec.ts',
    ],
    tag: '@members',
  },

  categories: {
    unit: [
      ...GROUP_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...GUIDED_TOUR_DIALOGS,
      ...DOC_REF_EXTENSIONS,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      `${FEATURES}/categories`,
      ...DEFAULT_BUTTON,
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
      `${FEATURES}/expenses/rental`,
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...GUIDED_TOUR_DIALOGS,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...DATE_SHORTCUT_KEYS,
      ...CUSTOM_DATE_ADAPTER,
      ...YES_NO_CHECK_PIPE,
      ...SPLIT_METHOD_TOGGLE,
      ...EXPENSE_MODEL,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...USER_SERVICE,
      `${FEATURES}/expenses/add-expense`,
      `${FEATURES}/expenses/add-expense-options-dialog`,
      `${FEATURES}/expenses/edit-expense`,
      `${FEATURES}/expenses/edit-expense.resolver.spec.ts`,
      `${FEATURES}/expenses/expense-form.tour.spec.ts`,
      `${FEATURES}/expenses/expenses`,
      ...DEFAULT_BUTTON,
      `${SERVICES}/category.service.spec.ts`,
      `${SERVICES}/expense.service.spec.ts`,
      `${SERVICES}/memorized.service.spec.ts`,
      `${SERVICES}/split.service.spec.ts`,
      `${SERVICES}/table-filter.service.spec.ts`,
      `${COMPONENTS}/filter-panels`,
      `${DIRECTIVES}/filters`,
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
    functions: [...MAIL_QUEUE_FUNCTIONS, ...USER_SERVICE_FUNCTIONS],
    tag: '@expenses',
  },

  // Rental expense entry and its room-based split grid.
  rental: {
    unit: [
      ...GROUP_STORE,
      ...MEMBER_STORE,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
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
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...EXPENSE_MODEL,
      ...ANALYTICS,
      ...LOADING,
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
    functions: [
      'src/receipt-cleanup.spec.ts',
      'src/receipt-ocr.spec.ts',
      'src/receipt-parser.spec.ts',
      'src/scan-receipt.spec.ts',
      ...MAIL_QUEUE_FUNCTIONS,
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@receipts',
  },

  // Memorized (recurring/template) expenses.
  memorized: {
    unit: [
      ...GROUP_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...SPLIT_METHOD_TOGGLE,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      `${FEATURES}/memorized`,
      ...DEFAULT_BUTTON,
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
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...GUIDED_TOUR_DIALOGS,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...DATE_SHORTCUT_KEYS,
      ...CUSTOM_DATE_ADAPTER,
      ...MEDIA_QUERY,
      ...ANALYTICS,
      ...LOADING,
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
      ...MAIL_QUEUE_FUNCTIONS,
      'src/payment-email.spec.ts',
      'src/settle-email.spec.ts',
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@summary',
  },

  // Payment/settlement history and its detail view.
  history: {
    unit: [
      ...GROUP_STORE,
      ...USER_STORE,
      ...MEMBER_STORE,
      ...CATEGORY_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...DOC_REF_COMPARE,
      ...CUSTOM_DATE_ADAPTER,
      ...ANALYTICS,
      ...LOADING,
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
    functions: [
      'src/email-formatting.spec.ts',
      ...MAIL_QUEUE_FUNCTIONS,
      'src/payment-email.spec.ts',
      ...USER_SERVICE_FUNCTIONS,
    ],
    tag: '@history',
  },

  // The standalone split calculator.
  split: {
    unit: [
      ...GROUP_STORE,
      ...DATE_UTILS,
      ...DOC_REF_EXTENSIONS,
      ...SPLIT_METHOD_TOGGLE,
      ...ANALYTICS,
      ...SNACKBAR,
      `${FEATURES}/split`,
      ...DEFAULT_BUTTON,
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
      ...USER_STORE,
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
      ...LOADING,
      ...SNACKBAR,
      `${FEATURES}/about`,
      `${FEATURES}/help`,
      ...DEFAULT_BUTTON,
      ...EMAIL_VALIDATION,
      `${SERVICES}/help.service.spec.ts`,
      `${SERVICES}/help-content.service.spec.ts`,
      ...GUIDED_TOUR,
    ],
    functions: ['src/notify-new-issue.spec.ts'],
    tag: '@help',
  },

  // Site-admin screens (email log, reports) and their backend.
  admin: {
    unit: [
      ...REPORTS_STORE,
      ...CUSTOM_DATE_ADAPTER,
      ...MEDIA_QUERY,
      `${FEATURES}/admin`,
      `${SERVICES}/admin-error-log.service.spec.ts`,
      `${SERVICES}/admin-mail.service.spec.ts`,
      `${SERVICES}/admin-reports.service.spec.ts`,
      ...ANALYTICS,
      ...LOADING,
      ...SNACKBAR,
      ...APP_CHECK_ERRORS,
      ...CONFIRM_DIALOG,
      ...DELETE_DIALOG,
    ],
    functions: [
      'src/admin-reports.spec.ts',
      'src/admin-reports-builders.spec.ts',
      'src/admin-reports-callables.spec.ts',
      'src/common.spec.ts',
      'src/sync-auth-emails.spec.ts',
    ],
    tag: '@admin',
  },
};
