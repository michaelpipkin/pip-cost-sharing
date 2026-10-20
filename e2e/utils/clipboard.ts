import { type Page } from '@playwright/test';

/**
 * The page's clipboard text (the page needs clipboard-read permission: use
 * the `seededPage` fixture). Line endings are normalized to \n: on Windows,
 * Chromium stores clipboard text with \r\n, so text the app wrote with \n
 * reads back with \r\n.
 */
export async function readClipboard(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replaceAll('\r\n', '\n');
}
