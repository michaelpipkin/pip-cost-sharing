import { chromium, expect } from '@playwright/test';
import { ROUTE_PATHS } from '../../src/app/constants/routes.constants';
import { FIRST_NAVIGATION_TIMEOUT_MS } from '../constants';
import { AuthPage } from '../pages/auth.page';
import { SHARED } from '../seed/datasets/shared';

/**
 * Routes visited once after seeding so the ng dev server has already served
 * every main lazy chunk and its dependencies (and cold callables such as
 * linkInvitedMembers have started) before any test navigates. Paths come
 * from the app's own route constants (src/app/constants/routes.constants.ts).
 */
const WARM_UP_ROUTES = [
  ROUTE_PATHS.HOME,
  ROUTE_PATHS.EXPENSES_ROOT,
  ROUTE_PATHS.EXPENSES_ADD,
  ROUTE_PATHS.MEMORIZED_ROOT,
  ROUTE_PATHS.ANALYSIS_SUMMARY,
  ROUTE_PATHS.ANALYSIS_HISTORY,
  ROUTE_PATHS.ADMIN_GROUPS,
  ROUTE_PATHS.ADMIN_MEMBERS,
  ROUTE_PATHS.ADMIN_CATEGORIES,
  ROUTE_PATHS.SPLIT,
  ROUTE_PATHS.HELP,
];

// Carol is effectively read-only here: signing in rewrites her user doc's
// defaultGroupRef, but to the value she is seeded with (a content no-op; see
// the shared.ts header), and no spec signs in as her.
const WARM_UP_USER = SHARED.users.carol;

const ROUTE_TIMEOUT_MS = 30_000;

/**
 * Cold-start warm-up. Run once from global setup AFTER seeding finishes
 * (running it alongside the seed starves the functions emulator), in the
 * run's shared browser (`wsEndpoint`: launched by global setup, reused by
 * every worker): signs in as a shared user, then loads each main route and
 * waits for its routed component to render. Fails with the step's name if
 * one never renders.
 *
 * Every wait here needs an explicit bound. Global setup runs outside the
 * test runner, so playwright.config.ts's `expect.timeout` (15 s) and `use`
 * timeouts don't apply: a bare expect() gets Playwright's 5 s default. This
 * is also the shared browser's first page load, which sets off the
 * machine's stall (whole ~10 s units, up to 61.5 s measured; see
 * FIRST_NAVIGATION_TIMEOUT_MS). With signInAs's default bounds that failed
 * 5 runs in 15 (Task 6c), and with only the login page on the long bound
 * the stall still outlasted the 30 s sign-in landing (Task 11). So the login
 * page, the sign-in landing and the first route all get the first-navigation
 * bound; submitLogin's other waits are DOM-only (fields filled, button
 * enabled).
 */
export async function warmUpDevServer(
  baseURL: string,
  wsEndpoint: string
): Promise<void> {
  const started = Date.now();
  const browser = await chromium.connect(wsEndpoint);
  try {
    const page = await browser.newPage({ baseURL });
    const authPage = new AuthPage(page);
    try {
      await authPage.gotoLogin({ timeout: FIRST_NAVIGATION_TIMEOUT_MS });
      await authPage.submitLogin(
        WARM_UP_USER.email,
        WARM_UP_USER.password,
        `warm-up sign-in (${WARM_UP_USER.email})`,
        { landingTimeout: FIRST_NAVIGATION_TIMEOUT_MS }
      );
    } catch (error) {
      throw new Error(
        `Dev-server warm-up failed to sign in after ${Date.now() - started} ms: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
    const signedIn = Date.now();

    let first = true;
    for (const route of WARM_UP_ROUTES) {
      const timeout = first ? FIRST_NAVIGATION_TIMEOUT_MS : ROUTE_TIMEOUT_MS;
      first = false;
      try {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout });
        // The routed component is rendered as a sibling of <router-outlet>.
        // A group guard may redirect a full reload before the group has been
        // re-selected; the lazy chunk was already fetched by then (children
        // load before canActivate runs), so any rendered route is enough.
        await expect(
          page
            .getByTestId('main-content')
            .locator(':scope > :not(router-outlet)')
            .first()
        ).toBeVisible({ timeout });
        await expect(page.getByTestId('loading-spinner-container')).toBeHidden({
          timeout,
        });
      } catch (error) {
        throw new Error(
          `Dev-server warm-up failed on route "${route}" (as ${WARM_UP_USER.email}): ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }
    console.log(
      `[e2e warm-up] signed in in ${signedIn - started} ms, loaded ${WARM_UP_ROUTES.length} routes in ${Date.now() - signedIn} ms`
    );
  } finally {
    await browser.close();
  }
}
