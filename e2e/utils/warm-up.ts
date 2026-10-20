import { chromium, expect } from '@playwright/test';
import { ROUTE_PATHS } from '../../src/app/constants/routes.constants';
import { SHARED } from '../seed/datasets/shared';
import { signInAs } from './session';

/**
 * Routes visited once after seeding so the ng dev server has already served
 * every main lazy chunk before any test navigates. Paths come from the app's
 * own route constants (src/app/constants/routes.constants.ts).
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
 * component to render. Fails with the route's name if one never renders.
 */
export async function warmUpDevServer(baseURL: string): Promise<void> {
  const started = Date.now();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await signInAs(page, WARM_UP_USER);

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
      `[e2e warm-up] signed in and loaded ${WARM_UP_ROUTES.length} routes in ${Date.now() - started} ms`
    );
  } finally {
    await browser.close();
  }
}
