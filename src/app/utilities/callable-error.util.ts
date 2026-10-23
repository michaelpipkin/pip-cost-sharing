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
