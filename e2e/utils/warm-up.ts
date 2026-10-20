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

const FIRST_ROUTE_TIMEOUT_MS = 60_000;
const ROUTE_TIMEOUT_MS = 30_000;

/**
 * Cold-start warm-up. Run once from global setup AFTER seeding finishes
 * (running it alongside the seed starves the functions emulator): signs in
 * as a shared user, then loads each main route and waits for its routed
 * component to render. Fails with the step's name if one never renders.
 *
 * Every wait here needs an explicit bound. Global setup runs outside the
 * test runner, so playwright.config.ts's `expect.timeout` (15 s) and `use`
 * timeouts don't apply: a bare expect() gets Playwright's 5 s default. This
 * is also the run's first fresh Chromium, whose first page load hits the
 * machine's ~10.5 s network stall (see FIRST_NAVIGATION_TIMEOUT_MS); with
 * signInAs's default bounds that failed 5 runs in 15 (login form not
 * visible within 5 s, or the 30 s page.goto). The login page therefore gets
 * the first-navigation bound; after it, submitLogin's short waits are
 * DOM-only (fields filled, button enabled) and its landing waits are 30 s.
 */
export async function warmUpDevServer(baseURL: string): Promise<void> {
  const started = Date.now();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    const authPage = new AuthPage(page);
    try {
      await authPage.gotoLogin({ timeout: FIRST_NAVIGATION_TIMEOUT_MS });
      await authPage.submitLogin(
        WARM_UP_USER.email,
        WARM_UP_USER.password,
        `warm-up sign-in (${WARM_UP_USER.email})`
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
      const timeout = first ? FIRST_ROUTE_TIMEOUT_MS : ROUTE_TIMEOUT_MS;
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
