import { Router, UrlTree } from '@angular/router';

/** The login page's query parameter naming where to go after signing in. */
export const RETURN_URL_PARAM = 'returnUrl';

// Pages a user is never returned to: they redirect signed-in users away, so a
// returnUrl pointing at one would only bounce.
const NO_RETURN_PATHS = ['/auth/login', '/auth/register'];

// Control characters and backslashes have no place in an app path.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * The page a `returnUrl` names, or null when it is missing or not a safe,
 * app-internal path (so the caller falls back to its default). Only a path
 * that starts with a single `/` is accepted: `//host`, `/\host` (browsers
 * read the backslash as a slash), a scheme (`https:`, `javascript:`) and a
 * path with control characters or backslashes are refused, so a crafted
 * sign-in link can never send the user to another site (an open redirect).
 * The query string and fragment travel with the path, which is how a
 * one-time link's token survives a sign-in.
 */
export function safeReturnUrl(
  router: Router,
  raw: string | null | undefined
): UrlTree | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0] ?? '';
  if (path.startsWith('//') || UNSAFE_PATH_CHARS.test(path)) return null;
  if (NO_RETURN_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
    return null;
  }
  // Router.parseUrl never throws: a URL it cannot parse (a malformed escape)
  // comes back as the home page, which is not what the link named.
  const tree = router.parseUrl(raw);
  return path !== '/' && router.serializeUrl(tree) === '/' ? null : tree;
}
