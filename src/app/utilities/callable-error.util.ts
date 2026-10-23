/**
 * A Cloud Functions callable refusal as the app maps it: its code
 * (`functions/<code>`) and the server's own message. The Functions SDK builds
 * the client error as `new FunctionsError(code, `${message} [${httpStatus}]`)`,
 * so the trailing ` [400]`-style status is stripped to get back the server's
 * stable message (e.g. functions/src/member-email.ts). Found by the B19 e2e
 * journey: matching the raw message never succeeds.
 */
export function callableError(error: unknown): {
  code: string | undefined;
  message: string;
} {
  const code = (error as { code?: unknown } | null)?.code;
  const raw = error instanceof Error ? error.message : '';
  return {
    code: typeof code === 'string' ? code : undefined,
    message: raw.replace(/ \[\d{3}\]$/, ''),
  };
}

/**
 * The member-email callables' refusal of an unverified login email
 * (functions/src/member-email.ts VERIFY_LOGIN_EMAIL), shown as is.
 */
export const VERIFY_LOGIN_EMAIL = 'Verify your login email first.';

/** Whether `error` is that refusal (permission-denied, VERIFY_LOGIN_EMAIL). */
export function isUnverifiedLoginRefusal(error: unknown): boolean {
  const { code, message } = callableError(error);
  return code === 'functions/permission-denied' && message === VERIFY_LOGIN_EMAIL;
}

/**
 * updateMemberEmails' refusal of a verified login email that is not one
 * valid address (functions/src/member-email.ts LOGIN_EMAIL_INVALID): a legacy
 * account. Retrying can't help.
 */
export const LOGIN_EMAIL_INVALID =
  'Your login email is not a single valid email address.';

/** What the app shows for that refusal. */
export const LOGIN_EMAIL_INVALID_MESSAGE =
  "Your login email is not a single valid email address, so it can't be used as a group email. Change your login email first.";

/** Whether `error` is that refusal (failed-precondition, LOGIN_EMAIL_INVALID). */
export function isInvalidLoginEmailRefusal(error: unknown): boolean {
  const { code, message } = callableError(error);
  return (
    code === 'functions/failed-precondition' && message === LOGIN_EMAIL_INVALID
  );
}

/**
 * The group-mail callables' refusal once the caller has reached their daily
 * allowance (functions/src/mail-allowance.ts GROUP_MAIL_LIMIT_REACHED),
 * shown as is. Payment requests, unpay notices and invites share it.
 */
export const GROUP_MAIL_LIMIT_REACHED =
  "You've reached today's limit for group emails. Try again tomorrow.";

/** Whether `error` is that refusal (resource-exhausted, GROUP_MAIL_LIMIT_REACHED). */
export function isGroupMailLimitRefusal(error: unknown): boolean {
  const { code, message } = callableError(error);
  return (
    code === 'functions/resource-exhausted' &&
    message === GROUP_MAIL_LIMIT_REACHED
  );
}

/**
 * requestMemberEmailChange's refusal of an address that got a confirmation
 * mail within the hour, from any account (functions/src/member-email.ts
 * CONFIRMATION_RECENTLY_SENT), shown as is.
 */
export const CONFIRMATION_RECENTLY_SENT =
  'A confirmation email was sent to that address recently. Try again in an hour.';

/** Whether `error` is that refusal (resource-exhausted, CONFIRMATION_RECENTLY_SENT). */
export function isConfirmationCooldownRefusal(error: unknown): boolean {
  const { code, message } = callableError(error);
  return (
    code === 'functions/resource-exhausted' &&
    message === CONFIRMATION_RECENTLY_SENT
  );
}
