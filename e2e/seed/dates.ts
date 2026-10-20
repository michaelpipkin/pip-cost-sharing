const SEED_TODAY_ENV = 'E2E_SEED_TODAY';

/** Local YYYY-MM-DD, the same format as the app's toIsoFormat (date-utils.ts). */
function toIsoDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Remembered before anything here can publish, so global setup can tell an
// ambient value (a leftover shell export from an earlier run) from its own.
const AMBIENT_SEED_TODAY = process.env[SEED_TODAY_ENV];

/**
 * The seed run's "today", captured once per process: the run's published
 * value when this is a worker (which inherits the environment global setup
 * published), otherwise now.
 */
export const SEED_TODAY: string = AMBIENT_SEED_TODAY ?? toIsoDate(new Date());

/**
 * Called once by global setup: publishes SEED_TODAY through the environment so
 * Playwright workers see the same dates even if the run crosses midnight.
 * Refuses a value that was already set when this module loaded, as a stale one
 * would silently shift every relative seed date (cf. the E2E_TARGET guard).
 */
export function publishSeedToday(): void {
  if (AMBIENT_SEED_TODAY !== undefined) {
    throw new Error(
      `${SEED_TODAY_ENV} is set (${AMBIENT_SEED_TODAY}) - global setup publishes it for the workers; unset it before running pnpm e2e.`
    );
  }
  process.env[SEED_TODAY_ENV] = SEED_TODAY;
}

/**
 * SEED_TODAY minus `days`, for data a test needs to be "recent" (e.g. inside
 * the Expenses page's default 90-day or History's 30-day window). Use fixed
 * date strings for anything else.
 */
export function seedDaysAgo(days: number): string {
  const [year, month, day] = SEED_TODAY.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return toIsoDate(new Date(year, month - 1, day - days));
}
