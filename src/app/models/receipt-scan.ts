/** Mirrors functions/src/receipt-parser.ts's ParsedReceipt - the scanReceipt callable's response shape. */
export interface ParsedReceiptLineItem {
  description: string;
  amount: number;
  confidence: number;
}

export interface ParsedReceipt {
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  lineItems: ParsedReceiptLineItem[];
  rawText: string;
}
