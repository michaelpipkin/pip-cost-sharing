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
