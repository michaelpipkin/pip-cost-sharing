const SEED_TODAY_ENV = 'E2E_SEED_TODAY';

/** Local YYYY-MM-DD, the same format as the app's toIsoFormat (date-utils.ts). */
function toIsoDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The seed run's "today", captured once per run. Global setup evaluates this
 * first and publishes it through the environment, which Playwright workers
 * inherit - so a run that crosses midnight still sees the dates it seeded.
 */
export const SEED_TODAY: string = (process.env[SEED_TODAY_ENV] ??= toIsoDate(
  new Date()
));

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
