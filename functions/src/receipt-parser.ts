/**
 * Heuristic parsing of OCR'd receipt text into total/tax/tip/line-items.
 * No maintained npm package does structured receipt parsing on top of raw
 * OCR output, so this is hand-rolled — see .claude/future-ideas.md for
 * background. Kept separate from receipt-ocr.ts so the parsing logic can be
 * unit tested without a real Tesseract worker/image.
 */

export interface OcrLine {
  text: string;
  confidence: number; // 0-100, as reported by Tesseract
}

export interface ReceiptLineItem {
  description: string;
  amount: number;
  confidence: number;
}

export interface ParsedReceipt {
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  lineItems: ReceiptLineItem[];
  rawText: string;
}

// Trailing currency amount, e.g. "12.99", "$12.99", "1,234.56", "-3.00".
// Also tolerates a trailing single-letter tax-status code with no
// backtracking-prone adjacent \s* pair, as commonly printed on grocery
// receipts (e.g. "5.99F", "14.99 T").
const AMOUNT_RE = /(-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2})(?:\s?[A-Z])?\s*$/;

// Checked in this order — most specific first — so a generic "total" match
// doesn't steal a line that's really the subtotal/tax/tip.
const SUBTOTAL_RE = /\bsub[\s-]?total\b/i;
const TAX_RE = /\btax\b/i;
const TIP_RE = /\b(tip|gratuity)\b/i;
// "balance" alone (no "total" anywhere) is a common way receipts state
// what's owed - e.g. "**** BALANCE 150.47" with no "total" line at all.
const TOTAL_RE = /\b(grand\s+total|total\s+due|amount\s+due|balance|total)\b/i;

// Lines that commonly contain a trailing number but aren't line items.
// A list (checked in a loop) rather than one big alternation, both to keep
// the regex complexity down and to make it easy to add/remove keywords.
const NOISE_KEYWORDS = [
  /\bthank you\b/i,
  /\bcashier\b/i,
  /\bserver\b/i,
  /\btable\b/i,
  /\bguests?\b/i,
  /\border\s*#/i,
  /\breceipt\s*#/i,
  /\binvoice\s*#/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bamex\b/i,
  /\bdiscover\b/i,
  /\bcard\s*(?:ending|#)/i,
  /\bauth(?:orization)?\s*code\b/i,
  /\bchange\s+due\b/i,
  /\bcash\s+tendered\b/i,
  /\bcustomer\s+copy\b/i,
  /\bmerchant\s+copy\b/i,
  /\bsurcharge\b/i,
];
const isNoise = (text: string): boolean =>
  NOISE_KEYWORDS.some((re) => re.test(text));

// Pre-computed tip-suggestion lines (e.g. "18% $10.98") - not line items.
const TIP_SUGGESTION_RE = /^\s*\d{1,3}\s*%/;

function extractAmount(text: string): number | null {
  const match = text.match(AMOUNT_RE);
  if (!match) return null;
  const numeric = match[1].replace(/[$,\s]/g, '');
  const value = parseFloat(numeric);
  return Number.isFinite(value) ? value : null;
}

function stripAmount(text: string): string {
  return text.replace(AMOUNT_RE, '').trim();
}

/**
 * Parse OCR'd receipt lines into a structured result. Lines with no
 * trailing currency amount are ignored (addresses, dates, phone numbers,
 * etc. all lack one); everything else is bucketed into subtotal/tax/tip/
 * total by keyword, with unmatched amount-bearing lines treated as line
 * items.
 */
export function parseReceiptLines(lines: OcrLine[]): ParsedReceipt {
  const result: ParsedReceipt = {
    total: null,
    subtotal: null,
    tax: null,
    tip: null,
    lineItems: [],
    rawText: lines.map((line) => line.text).join('\n'),
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const amount = extractAmount(text);
    if (amount === null) continue;

    if (SUBTOTAL_RE.test(text)) {
      result.subtotal = amount;
      continue;
    }
    if (TAX_RE.test(text)) {
      result.tax = amount;
      continue;
    }
    if (TIP_RE.test(text)) {
      result.tip = amount;
      continue;
    }
    if (TOTAL_RE.test(text)) {
      result.total = amount;
      continue;
    }
    if (isNoise(text) || TIP_SUGGESTION_RE.test(text)) {
      continue;
    }

    const description = stripAmount(text);
    if (!description) continue;

    result.lineItems.push({ description, amount, confidence: line.confidence });
  }

  return result;
}
