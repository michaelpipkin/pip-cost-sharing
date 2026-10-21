import type { Page, Route, TestInfo } from '@playwright/test';
import type { ParsedReceipt } from '../../src/app/models/receipt-scan';

/**
 * The scanReceipt callable is always mocked in the browser, never run for
 * real: the real function downloads tesseract language data from a CDN
 * (spec §3) and OCR output isn't deterministic. Shared by the receipts spec
 * and the feature-tour screenshot capture.
 */

/** What the callable answers for a receipt it can't read (HTTP 400, details.reason). */
export interface ScanReceiptError {
  error: 'no-text-found';
}

/**
 * Answers the scanReceipt callable on whatever host the functions emulator
 * is at (callable protocol: `{ result }`, or `{ error }` with an HTTP error
 * status). The route is scoped to `page`; the CORS preflight is answered too,
 * because the app (localhost:4300) and the functions emulator are different
 * origins.
 */
export async function mockScanReceipt(
  page: Page,
  reply: ParsedReceipt | ScanReceiptError
): Promise<void> {
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
    if ('error' in reply) {
      // Same shape as HttpsError('failed-precondition', ..., { reason }).
      await route.fulfill({
        status: 400,
        headers: corsHeaders,
        json: {
          error: {
            message: 'No readable text was found in this image.',
            status: 'FAILED_PRECONDITION',
            details: { reason: reply.error },
          },
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: { result: reply },
    });
  });
}

// ---------------------------------------------------------------------------
// Synthetic receipt photo (feature-tour screenshots)
// ---------------------------------------------------------------------------

/**
 * A restaurant receipt as the scanReceipt callable would return it
 * (ParsedReceipt). subtotal 115.70 + tax 9.26 + tip 23.14 = total 148.10.
 */
export const MOCK_RECEIPT: ParsedReceipt = {
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

/** Renders the synthetic receipt (MOCK_RECEIPT) to a PNG in the test's output dir. */
export async function renderReceiptImage(
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
