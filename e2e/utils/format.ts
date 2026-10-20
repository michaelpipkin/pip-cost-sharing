/**
 * An amount as the app's currency pipe renders it for a USD group (symbol,
 * space, two decimals), e.g. "$ 33.34". The seeded groups are all USD.
 */
export function formatMoney(amount: number): string {
  const digits = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}$ ${digits}`;
}

/** A date as the Expenses table (desktop) and the date input show it. */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
