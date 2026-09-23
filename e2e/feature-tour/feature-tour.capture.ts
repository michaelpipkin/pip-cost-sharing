/**
 * Feature-tour screenshot capture
 * ===============================
 *
 * Generates the screenshots shown in the home page's "See what PipSplit can
 * do" feature-tour dialog (a 6-slide carousel). Each slide is captured at
 * desktop and phone width.
 *
 * Output:
 *   src/assets/images/feature-tour/{slideId}-{desktop|mobile}.png
 *   slideIds: proportional, split-methods, receipt-scan, vacation-rental,
 *             settle-up, and-more
 *   (existing files are overwritten; commit the regenerated PNGs)
 *
 * Prerequisites:
 *   1. Firebase emulators running WITH functions (createTestUser calls the
 *      verifyUserEmail function):   pnpm emu:data
 *   2. Dev server:                   pnpm start
 *      (the config's webServer will start it if it isn't already running)
 *   3. Playwright browsers installed: pnpm e2e:install
 *
 * Run:
 *   pnpm screenshots:feature-tour
 *   pnpm screenshots:feature-tour --project=desktop     (one form factor)
 *   pnpm screenshots:feature-tour -g "receipt"          (one slide)
 *   pnpm screenshots:feature-tour --headed              (watch it work)
 *
 * Uses e2e/feature-tour/playwright.feature-tour.config.ts, which (unlike the
 * main e2e config) has NO globalSetup, so emulator data is NOT wiped. The
 * logged-in slides create their own uniquely-named user
 * (screenshots-<project>-<timestamp>@test.com) and "Beach Weekend" group
 * per project, each run.
 *
 * Notes:
 *   - Slides 1, 2, 4 use the public /split calculator (no login).
 *   - Slides 3, 5, 6 need a signed-in user with a populated group. Setup runs
 *     once per project in beforeAll, always in a desktop-sized context so
 *     the (desktop-oriented) page objects work, then each test signs in with
 *     the project's own device settings.
 *   - The receipt-scan slide never hits the real scanReceipt Function: the
 *     callable is mocked with page.route(), and the uploaded "photo" is a
 *     synthetic receipt rendered from HTML that matches the mocked result.
 *   - Light theme is forced; the loading overlay, snackbars, tooltips and
 *     any ad containers are hidden before each capture.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  devices,
  type Locator,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';
import { configureFirebaseEmulators } from '../utils/firebase';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

type SlideId =
  | 'proportional'
  | 'split-methods'
  | 'receipt-scan'
  | 'vacation-rental'
  | 'settle-up'
  | 'and-more';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUTPUT_DIR = path.join(
  REPO_ROOT,
  'src',
  'assets',
  'images',
  'feature-tour'
);

/** 'desktop' | 'mobile' - taken from the config's project names. */
function formFactor(testInfo: TestInfo): string {
  return testInfo.project.name;
}

function isMobile(testInfo: TestInfo): boolean {
  return formFactor(testInfo) === 'mobile';
}

// ---------------------------------------------------------------------------
// Capture helpers
// ---------------------------------------------------------------------------

/** Transient UI that should never appear in a marketing screenshot. */
const HIDE_TRANSIENT_UI_CSS = `
  mat-snack-bar-container,
  .mat-mdc-snack-bar-container,
  app-custom-snackbar,
  .mat-mdc-tooltip-panel,
  .mdc-tooltip,
  ins.adsbygoogle,
  .adsbygoogle,
  .google-auto-placed,
  iframe[id^="aswift"],
  iframe[id^="google_ads"],
  [data-testid="loading-spinner-container"] {
    display: none !important;
    visibility: hidden !important;
  }
  *, *::before, *::after {
    caret-color: transparent !important;
  }
`;

/**
 * App chrome that would only shrink the feature in the dialog's image frame.
 * Hiding the toolbar and footer also lets the routed page fill the viewport,
 * so table pages (which size their tables to the available height) show more
 * rows.
 */
const HIDE_APP_CHROME_CSS = `
  mat-toolbar.nav,
  footer[data-testid="main-footer"] {
    display: none !important;
  }
`;

/** Force the light theme before any app code runs. */
async function forceLightTheme(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('app-theme-preference', 'light');
    } catch {
      // Storage unavailable - colorScheme: 'light' in the config still applies
    }
  });
}

/** Wait for the LoadingService overlay (if it appeared at all) to go away. */
async function waitForLoadingOverlay(page: Page): Promise<void> {
  const spinner = page.getByTestId('loading-spinner-container');
  await spinner.waitFor({ state: 'visible', timeout: 750 }).catch(() => {});
  await spinner.waitFor({ state: 'hidden', timeout: 30_000 });
}

/** Choose an option in an open (or about-to-open) mat-select overlay. */
async function chooseOption(page: Page, select: Locator, optionText: string) {
  await select.click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
  await expect(
    page.locator('.cdk-overlay-pane mat-option').first()
  ).toBeHidden();
}

/**
 * New groups normally have a single category (field hidden, auto-selected);
 * if there are several, the form stays invalid until one is picked.
 */
async function ensureCategory(page: Page, form: Locator): Promise<void> {
  const field = form.locator('[id="category-select"]');
  if (!(await field.isVisible())) return;
  const select = field.locator('mat-select');
  if ((await select.innerText()).trim()) return;
  await select.click();
  await page.locator('.cdk-overlay-pane mat-option').first().click();
  await expect(
    page.locator('.cdk-overlay-pane mat-option').first()
  ).toBeHidden();
}

/** Fill a text input and tab out so blur handlers (formatting/allocation) run. */
async function fillAndBlur(input: Locator, value: string): Promise<void> {
  await input.fill(value);
  await input.press('Tab');
}

interface CaptureOptions {
  /** Scrolled into view (within any scroll container) before capturing. */
  focus?: Locator;
  block?: ScrollLogicalPosition;
  /**
   * Crop to this element's visible content (the union of its rendered leaf
   * elements, padded, clamped to the viewport) instead of the whole viewport,
   * trimming the side margins and empty space the dialog would otherwise
   * shrink the feature to fit.
   */
  region?: Locator;
}

const CLIP_PADDING = 24;

async function contentClip(region: Locator) {
  return region.evaluate((root, pad) => {
    let top = Infinity;
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const el of root.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      top = Math.min(top, rect.top);
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (!Number.isFinite(top)) {
      throw new Error('capture region has no visible content');
    }
    const x = Math.max(0, Math.floor(left - pad));
    const y = Math.max(0, Math.floor(top - pad));
    return {
      x,
      y,
      width: Math.min(innerWidth, Math.ceil(right + pad)) - x,
      height: Math.min(innerHeight, Math.ceil(bottom + pad)) - y,
    };
  }, CLIP_PADDING);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  slideId: SlideId,
  options: CaptureOptions = {}
): Promise<void> {
  await waitForLoadingOverlay(page);
  await page.addStyleTag({ content: HIDE_TRANSIENT_UI_CSS });
  await page.addStyleTag({ content: HIDE_APP_CHROME_CSS });

  // Drop focus rings / hover states / tooltips left over from interaction.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  await page.mouse.move(0, 0);

  if (options.focus) {
    const block = options.block ?? 'nearest';
    await options.focus.evaluate(
      (el, b) => el.scrollIntoView({ block: b, inline: 'nearest' }),
      block
    );
  }

  // Let ripples, expand animations and late renders settle.
  await page.waitForTimeout(500);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${slideId}-${formFactor(testInfo)}.png`);
  await page.screenshot({
    path: file,
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
    clip: options.region ? await contentClip(options.region) : undefined,
  });
  console.log(`  captured ${path.relative(REPO_ROOT, file)}`);
}

// ---------------------------------------------------------------------------
// /split helpers (public calculator, no login)
// ---------------------------------------------------------------------------

async function gotoSplit(page: Page): Promise<void> {
  await page.goto('/split');
  await expect(page.getByTestId('split-expense-form')).toBeVisible();
  await waitForLoadingOverlay(page);
}

function splitForm(page: Page): Locator {
  return page.getByTestId('split-expense-form');
}

async function setSplitTotal(page: Page, amount: string): Promise<void> {
  await fillAndBlur(
    splitForm(page).getByRole('textbox', { name: /^Total Amount/ }),
    amount
  );
}

/** Adds one split row per name (Amount mode) and fills in the names. */
async function addSplitPeople(page: Page, names: string[]): Promise<void> {
  const nameInputs = splitForm(page).locator('[id="split-member"] input');
  for (const [i, name] of names.entries()) {
    await page.getByRole('button', { name: 'Add New Split' }).click();
    await expect(nameInputs).toHaveCount(i + 1);
    await fillAndBlur(nameInputs.nth(i), name);
  }
}

// ---------------------------------------------------------------------------
// Signed-in data (slides 3, 5, 6)
// ---------------------------------------------------------------------------

const GROUP_NAME = 'Beach Weekend';
/** The signed-in user's display name in the group (the group creator). */
const SELF = 'Alice';
const OTHER_MEMBERS = ['Bob', 'Charlie'];

/**
 * Paid by different people so the Summary shows real back-and-forth: three
 * pairwise balances that Fewest Transfers collapses into two payments.
 */
const EXPENSES = [
  { description: 'Groceries', amount: '184.62', payer: 'Alice' },
  { description: 'Dinner out', amount: '142.80', payer: 'Bob' },
  { description: 'Gas', amount: '63.45', payer: 'Charlie' },
  { description: 'Boat rental', amount: '275.00', payer: 'Bob' },
  { description: 'Beach parking', amount: '24.00', payer: 'Charlie' },
];

const MEMORIZED = [
  { description: 'Rent', amount: '1800.00', payer: 'Alice' },
  { description: 'Internet', amount: '79.99', payer: 'Bob' },
];

/**
 * Add Expense / Add Memorized apply their defaults (payer, auto-added member
 * splits, sole category) once, right after first render, from whatever the
 * stores hold at that moment. A page.goto() reloads the app and those stores
 * are still empty then, so these helpers navigate in-app like a real user
 * does, keeping the already-loaded member/category stores.
 */
async function openAddExpenseForm(page: Page): Promise<void> {
  await page.getByTestId('nav-expenses').click();
  await expect(page).toHaveURL(/\/expenses$/);
  await waitForLoadingOverlay(page);
  await page.getByTestId('add-expense-button').click();
  await page.getByTestId('manual-expense-button').click();
  await expect(page).toHaveURL(/\/expenses\/add$/);
  await waitForLoadingOverlay(page);
}

async function openAddMemorizedForm(page: Page): Promise<void> {
  await page.getByTestId('nav-memorized').click();
  await expect(page).toHaveURL(/\/memorized$/);
  await waitForLoadingOverlay(page);
  await page.getByTestId('memorize-new-expense-button').click();
  await expect(page).toHaveURL(/\/memorized\/add$/);
  await waitForLoadingOverlay(page);
}

async function addExpense(
  page: Page,
  expense: { description: string; amount: string; payer: string }
): Promise<void> {
  await openAddExpenseForm(page);
  const form = page.getByTestId('add-expense-form');
  await expect(form).toBeVisible();

  // The group has autoAddMembers on, so all three members get a split
  // (evenly shared remainder) once members finish loading.
  await expect(form.locator('[id="split-member"]')).toHaveCount(
    OTHER_MEMBERS.length + 1
  );

  await chooseOption(page, page.getByTestId('payer-select'), expense.payer);
  await fillAndBlur(page.getByTestId('description-input'), expense.description);
  await ensureCategory(page, form);
  await fillAndBlur(
    form.getByRole('textbox', { name: /^Total Amount/ }),
    expense.amount
  );

  const save = page.getByTestId('save-button');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/expenses$/);
  await waitForLoadingOverlay(page);
}

async function addMemorized(
  page: Page,
  memorized: { description: string; amount: string; payer: string }
): Promise<void> {
  await openAddMemorizedForm(page);
  const form = page.getByTestId('add-memorized-form');
  await expect(form).toBeVisible();

  await expect(form.locator('[id="split-member"]')).toHaveCount(
    OTHER_MEMBERS.length + 1
  );

  await chooseOption(
    page,
    form.locator('[id="paid-by-select"] mat-select'),
    memorized.payer
  );
  await fillAndBlur(
    form.locator('[id="description"] input'),
    memorized.description
  );
  await ensureCategory(page, form);
  await fillAndBlur(
    form.getByRole('textbox', { name: /^Total Amount/ }),
    memorized.amount
  );

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/memorized$/);
  await waitForLoadingOverlay(page);
}

/**
 * Signs in through the login form. Deliberately not
 * AuthPage.loginOrCreateTestUser(): its isLoggedIn() check looks for the
 * desktop-only toolbar buttons, which don't render at phone width.
 */
async function signIn(page: Page, email: string, password: string) {
  const authPage = new AuthPage(page);
  await authPage.gotoLogin();
  await authPage.login(email, password);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // The group is auto-selected (it's the user's only one) and cached in
  // localStorage, which later full-page navigations restore it from.
  await page.waitForFunction(() => !!localStorage.getItem('currentGroup'));
  await waitForLoadingOverlay(page);
}

// ---------------------------------------------------------------------------
// Mocked receipt scan (slide 3)
// ---------------------------------------------------------------------------

/**
 * Mirrors ParsedReceipt (src/app/models/receipt-scan.ts, itself mirroring
 * functions/src/receipt-parser.ts) - the scanReceipt callable's `data`.
 * subtotal 115.70 + tax 9.26 + tip 23.14 = total 148.10.
 */
const MOCK_RECEIPT = {
  total: 148.1,
  subtotal: 115.7,
  tax: 9.26,
  tip: 23.14,
  lineItems: [
    { description: 'Crispy Calamari', amount: 13.5, confidence: 96 },
    { description: 'Fish Tacos', amount: 16.75, confidence: 94 },
    { description: 'Grilled Salmon', amount: 24.95, confidence: 97 },
    { description: 'Lobster Roll', amount: 28.5, confidence: 95 },
    { description: 'Pitcher of Margaritas', amount: 32.0, confidence: 92 },
  ],
  // First line becomes the guessed expense description.
  rawText: [
    'Seaside Grill',
    '12 Harbor Way, Cape May NJ',
    'Crispy Calamari 13.50',
    'Fish Tacos 16.75',
    'Grilled Salmon 24.95',
    'Lobster Roll 28.50',
    'Pitcher of Margaritas 32.00',
    'Subtotal 115.70',
    'Tax 9.26',
    'Tip 23.14',
    'Total 148.10',
  ].join('\n'),
};

/** Line item index -> member; the rest stay "Shared / No one". */
const RECEIPT_ASSIGNMENTS: Record<number, string> = {
  1: 'Alice',
  2: 'Bob',
  3: 'Charlie',
};

const money = (n: number) => n.toFixed(2);

function receiptHtml(): string {
  const rows = MOCK_RECEIPT.lineItems
    .map(
      (item) =>
        `<div class="row"><span>${item.description}</span><span>${money(item.amount)}</span></div>`
    )
    .join('');
  return `<!doctype html>
<html><head><style>
  body { margin: 0; background: #d9d4cc; font-family: 'Courier New', monospace; }
  .receipt { width: 360px; margin: 24px; padding: 28px 24px; background: #fffdf7;
             color: #222; box-shadow: 0 2px 8px rgba(0,0,0,.25); font-size: 15px; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 4px; letter-spacing: 2px; }
  .center { text-align: center; font-size: 13px; }
  .row { display: flex; justify-content: space-between; margin: 6px 0; }
  hr { border: none; border-top: 1px dashed #777; margin: 14px 0; }
  .total { font-weight: bold; font-size: 17px; }
</style></head><body>
  <div class="receipt">
    <h1>SEASIDE GRILL</h1>
    <div class="center">12 Harbor Way, Cape May NJ</div>
    <div class="center">Table 7 &middot; Server: Jess</div>
    <hr />
    ${rows}
    <hr />
    <div class="row"><span>Subtotal</span><span>${money(MOCK_RECEIPT.subtotal)}</span></div>
    <div class="row"><span>Tax</span><span>${money(MOCK_RECEIPT.tax)}</span></div>
    <div class="row"><span>Tip</span><span>${money(MOCK_RECEIPT.tip)}</span></div>
    <hr />
    <div class="row total"><span>TOTAL</span><span>${money(MOCK_RECEIPT.total)}</span></div>
    <hr />
    <div class="center">Thank you!</div>
  </div>
</body></html>`;
}

/** Renders the synthetic receipt to a PNG in the test's output dir. */
async function renderReceiptImage(
  page: Page,
  testInfo: TestInfo
): Promise<string> {
  const file = testInfo.outputPath('seaside-grill-receipt.png');
  const receiptPage = await page.context().newPage();
  try {
    await receiptPage.setContent(receiptHtml());
    await receiptPage.locator('.receipt').screenshot({ path: file });
  } finally {
    await receiptPage.close();
  }
  return file;
}

/** Answers the scanReceipt callable with MOCK_RECEIPT (callable protocol: { result }). */
async function mockScanReceipt(page: Page): Promise<void> {
  await page.route('**/scanReceipt', async (route: Route) => {
    const request = route.request();
    const origin = (await request.headerValue('origin')) ?? '*';
    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers':
        (await request.headerValue('access-control-request-headers')) ?? '*',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: { result: MOCK_RECEIPT },
    });
  });
}

// ---------------------------------------------------------------------------
// Slides 1, 2, 4 - public /split page
// ---------------------------------------------------------------------------

test.describe('Feature tour - Split calculator', () => {
  let page: Page;

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    page = preserveDataFirebasePage;
    await forceLightTheme(page);
    await gotoSplit(page);
  });

  test('proportional', async ({}, testInfo) => {
    await setSplitTotal(page, '65.33');
    await fillAndBlur(
      splitForm(page).getByRole('textbox', { name: /^Proportional Amount/ }),
      '17.44'
    );

    const people = [
      { name: 'Alice', amount: '12.55' },
      { name: 'Bob', amount: '13.37' },
      { name: 'Charlie', amount: '14.02' },
    ];
    await addSplitPeople(
      page,
      people.map((p) => p.name)
    );
    const memberAmounts = splitForm(page).getByRole('textbox', {
      name: /^Member Amount/,
    });
    for (const [i, person] of people.entries()) {
      await fillAndBlur(memberAmounts.nth(i), person.amount);
    }

    const generate = page.getByRole('button', { name: 'Generate Summary' });
    await expect(generate).toBeEnabled();
    await generate.click();

    const summary = page.locator('.summary-container');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Proportional');

    await capture(page, testInfo, 'proportional', {
      focus: summary,
      block: 'start',
      region: summary,
    });
  });

  test('split-methods', async ({}, testInfo) => {
    await setSplitTotal(page, '96.00');
    await addSplitPeople(page, ['Alice', 'Bob', 'Charlie']);

    await page.getByTestId('split-by-shares-toggle').click();
    const shareInputs = splitForm(page).getByRole('textbox', {
      name: /^Shares/,
    });
    await expect(shareInputs).toHaveCount(3);
    for (const [i, shares] of ['2', '1', '1'].entries()) {
      await fillAndBlur(shareInputs.nth(i), shares);
    }
    // Effective percentage suffix next to each Shares input.
    await expect(splitForm(page)).toContainText('50.00%');

    // Crop to the whole page (heading included) rather than just the form -
    // the crop padding above the form would otherwise cut through the heading.
    await capture(page, testInfo, 'split-methods', {
      region: page.getByTestId('split-expense-container'),
    });
  });

  test('vacation-rental', async ({}, testInfo) => {
    await setSplitTotal(page, '1450.00');
    await page.getByTestId('vacation-rental-button').click();

    // Set the night count BEFORE adding people: new participants start out
    // present for every existing night.
    // Three nights keeps the whole grid visible at phone width (a fourth
    // night column pushes it into horizontal scrolling).
    await fillAndBlur(page.getByTestId('split-night-count-input'), '3');

    const participants = ['Alice', 'Bob', 'Charlie', 'Dana'];
    const nameInput = page.getByTestId('add-participant-input');
    for (const name of participants) {
      await nameInput.fill(name);
      await nameInput.press('Enter');
    }
    await expect(page.getByTestId('participant-row')).toHaveCount(
      participants.length
    );

    // Partial occupancy (0-based participant/night indices):
    //   Alice all three nights; Bob leaves before night 3;
    //   Charlie arrives for night 2; Dana only night 1.
    const absences: [participant: number, night: number][] = [
      [1, 2],
      [2, 0],
      [3, 1],
      [3, 2],
    ];
    const grid = page.getByTestId('split-occupancy-table');
    for (const [participant, night] of absences) {
      await grid
        .locator('.occupancy-scroll tbody tr')
        .nth(participant)
        .locator('td')
        .nth(night)
        .locator('input[type="checkbox"]')
        .uncheck();
    }
    await expect(page.getByTestId('split-empty-nights-warning')).toHaveCount(0);

    // Clicking checkboxes can leave the grid scrolled sideways; start from
    // the first night column.
    await grid
      .locator('.occupancy-scroll')
      .evaluate((el) => el.scrollTo({ left: 0 }));

    await capture(page, testInfo, 'vacation-rental', {
      // On a phone the grid is taller than the screen - show it down to the
      // Apply Shares / Cancel buttons.
      focus: isMobile(testInfo)
        ? page.getByTestId('cancel-rental-button')
        : page.getByTestId('split-rental-grid'),
      block: isMobile(testInfo) ? 'end' : 'nearest',
      region: page.getByTestId('split-expense-container'),
    });
  });
});

// ---------------------------------------------------------------------------
// Slides 3, 5, 6 - signed-in group features
// ---------------------------------------------------------------------------

test.describe.serial('Feature tour - Group features', () => {
  const user = { email: '', password: 'password123' };
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);
    // Unique per project run (desktop and mobile each build their own data).
    user.email = `screenshots-${formFactor(testInfo)}-${Date.now()}@test.com`;

    // Always build data at desktop size - the page objects (and some of
    // their desktop-only checks) assume the full toolbar/table layout.
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
      baseURL: testInfo.project.use.baseURL,
    });
    const setupPage = await context.newPage();
    try {
      await configureFirebaseEmulators(setupPage);

      // Creates the user via createTestUser (Auth emulator + verifyUserEmail)
      // and signs in.
      await new AuthPage(setupPage).loginOrCreateTestUser(
        user.email,
        user.password,
        { assumeNew: true }
      );

      const groupsPage = new GroupsPage(setupPage);
      await groupsPage.goto();
      await groupsPage.createGroup(GROUP_NAME, SELF, true);
      await groupsPage.selectGroup(GROUP_NAME);

      const membersPage = new MembersPage(setupPage);
      await membersPage.goto();
      for (const name of OTHER_MEMBERS) {
        await membersPage.addMember(
          name,
          `${name.toLowerCase()}-${Date.now()}@example.com`
        );
      }

      for (const expense of EXPENSES) {
        await addExpense(setupPage, expense);
      }
      for (const memorized of MEMORIZED) {
        await addMemorized(setupPage, memorized);
      }
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ preserveDataFirebasePage }) => {
    page = preserveDataFirebasePage;
    await forceLightTheme(page);
    await signIn(page, user.email, user.password);
  });

  test('receipt-scan', async ({}, testInfo) => {
    const receiptImage = await renderReceiptImage(page, testInfo);
    await mockScanReceipt(page);

    await page.goto('/expenses/scan-receipt');
    await expect(page.getByTestId('select-photo-placeholder')).toBeVisible();
    await waitForLoadingOverlay(page);

    // Straight to the (hidden) file input - skips the receipt-policy and
    // source-picker dialogs that the "Select Receipt Photo" button opens.
    await page.getByTestId('file-input').setInputFiles(receiptImage);

    const rows = page.getByTestId('line-item-row');
    await expect(rows).toHaveCount(MOCK_RECEIPT.lineItems.length);
    await waitForLoadingOverlay(page);

    for (const [index, member] of Object.entries(RECEIPT_ASSIGNMENTS)) {
      await chooseOption(
        page,
        page.getByTestId(`line-item-assignee-${index}`),
        member
      );
    }
    await expect(page.getByTestId('member-subtotal')).toHaveCount(
      Object.keys(RECEIPT_ASSIGNMENTS).length
    );

    await capture(page, testInfo, 'receipt-scan', {
      // On a phone the list is taller than the screen - end on the running
      // totals so the per-member and tax/tip split is visible.
      focus: isMobile(testInfo)
        ? page.getByTestId('running-totals')
        : page.getByTestId('scanned-file-info'),
      block: isMobile(testInfo) ? 'end' : 'start',
      region: page.getByTestId('scan-receipt-container'),
    });
  });

  test('settle-up', async ({}, testInfo) => {
    await page.goto('/analysis/summary');
    await expect(page.getByTestId('summary-main-container')).toBeVisible();
    await waitForLoadingOverlay(page);

    // Phone layout shows one section at a time - switch to Fewest Transfers.
    const settlementToggle = page.getByTestId('summary-view-settlement-toggle');
    if (await settlementToggle.isVisible()) {
      await settlementToggle.click();
    }
    await expect(page.getByTestId('least-transfers-table')).toBeVisible();

    await capture(page, testInfo, 'settle-up', {
      region: page.getByTestId('summary-main-container'),
    });
  });

  test('and-more', async ({}, testInfo) => {
    await page.goto('/memorized');
    await expect(page.getByTestId('memorized-main-container')).toBeVisible();
    await waitForLoadingOverlay(page);

    await expect(
      page.locator('tr.mat-mdc-row').filter({ hasText: 'Rent' })
    ).toBeVisible();

    // Expand the first memorized expense to show its splits.
    await page.getByRole('button', { name: 'expand row' }).first().click();
    await expect(page.locator('.detail-table-container')).toBeVisible();

    await capture(page, testInfo, 'and-more', {
      region: page.getByTestId('memorized-main-container'),
    });
  });
});
