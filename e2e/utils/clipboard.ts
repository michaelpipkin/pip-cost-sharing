import { expect, type Page } from '@playwright/test';

/** Where the recording stores the last text the page wrote. */
const RECORDED_KEY = '__e2eClipboardText';

/**
 * Records what the page writes through `navigator.clipboard.writeText`, per
 * page, from its next navigation on (an init script). The real write still
 * happens, so the app behaves as in production, but tests never read the
 * clipboard back: every context lives in the one shared browser and the
 * clipboard is the OS's, so a copy in another worker (or the owner's own
 * copy and paste during a run) could replace the text between a test's copy
 * and its read. `seededPage` calls this.
 */
export async function recordClipboardWrites(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const clipboard = navigator.clipboard;
    const write = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text: string) => {
      (window as unknown as Record<string, string>)[key] = text;
      return write(text);
    };
  }, RECORDED_KEY);
}

/**
 * The text the page last wrote to the clipboard (needs the `seededPage`
 * fixture, which records the writes). This asserts what the app handed to
 * the Clipboard API, exactly as written (no OS line-ending changes), not
 * what the OS clipboard holds. Polls until the page has written something.
 */
export async function readClipboard(page: Page): Promise<string> {
  const read = () =>
    page.evaluate(
      (key) => (window as unknown as Record<string, string | undefined>)[key],
      RECORDED_KEY
    );
  await expect
    .poll(read, { message: 'the page wrote to the clipboard' })
    .toBeDefined();
  return (await read())!;
}
