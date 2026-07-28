import { describe, expect, it } from 'vitest';
import { OcrLine, parseReceiptLines } from './receipt-parser';

function lines(...texts: string[]): OcrLine[] {
  return texts.map((text) => ({ text, confidence: 90 }));
}

describe('parseReceiptLines', () => {
  it('parses a typical receipt into subtotal/tax/tip/total and line items', () => {
    const result = parseReceiptLines(
      lines(
        'COFFEE SHOP',
        '123 Main St',
        'Latte                 4.50',
        'Bagel                 3.25',
        'Subtotal              7.75',
        'Tax                   0.68',
        'Tip                   1.50',
        'Total                 9.93',
        'Thank you!'
      )
    );

    expect(result.subtotal).toBe(7.75);
    expect(result.tax).toBe(0.68);
    expect(result.tip).toBe(1.5);
    expect(result.total).toBe(9.93);
    expect(result.lineItems).toEqual([
      { description: 'Latte', amount: 4.5, confidence: 90 },
      { description: 'Bagel', amount: 3.25, confidence: 90 },
    ]);
  });

  it('recognizes "grand total" / "amount due" / "balance due" as total', () => {
    for (const label of ['Grand Total', 'Amount Due', 'Balance Due']) {
      const result = parseReceiptLines(lines(`${label}   15.00`));
      expect(result.total).toBe(15);
    }
  });

  it('does not mistake "subtotal" for "total"', () => {
    const result = parseReceiptLines(lines('Subtotal   10.00'));
    expect(result.subtotal).toBe(10);
    expect(result.total).toBeNull();
  });

  it('recognizes "gratuity" as tip', () => {
    const result = parseReceiptLines(lines('Gratuity   2.00'));
    expect(result.tip).toBe(2);
  });

  it('ignores lines with no trailing currency amount', () => {
    const result = parseReceiptLines(
      lines('123 Main St', 'Phone: 555-123-4567', '07/27/2026')
    );
    expect(result.lineItems).toEqual([]);
    expect(result.total).toBeNull();
  });

  it('filters known noise lines even when they have a trailing amount', () => {
    const result = parseReceiptLines(
      lines('Cash Tendered         20.00', 'Change Due             5.00')
    );
    expect(result.lineItems).toEqual([]);
  });

  it('handles a comma thousands separator and a leading dollar sign', () => {
    const result = parseReceiptLines(lines('Total   $1,234.56'));
    expect(result.total).toBe(1234.56);
  });

  it('joins all input lines into rawText regardless of parsing outcome', () => {
    const result = parseReceiptLines(lines('foo', 'bar 1.00'));
    expect(result.rawText).toBe('foo\nbar 1.00');
  });

  it('returns an all-null, empty-items result for an empty input', () => {
    const result = parseReceiptLines([]);
    expect(result).toEqual({
      total: null,
      subtotal: null,
      tax: null,
      tip: null,
      lineItems: [],
      rawText: '',
    });
  });

  // The cases below were found by running real scanned receipt photos
  // through the parser — see .claude/future-ideas.md.

  it('recognizes "balance" alone as the total when there is no "total" line', () => {
    const result = parseReceiptLines(lines('**** BALANCE     150.47'));
    expect(result.total).toBe(150.47);
  });

  it('parses a grocery-style amount with a trailing tax-status letter and no space', () => {
    const result = parseReceiptLines(lines('OGVAL MILK 2%          5.99F'));
    expect(result.lineItems).toEqual([
      { description: 'OGVAL MILK 2%', amount: 5.99, confidence: 90 },
    ]);
  });

  it('parses a grocery-style amount with a trailing tax-status letter and a space', () => {
    const result = parseReceiptLines(lines('CLNCLT LNDRY SHEET     14.99 T'));
    expect(result.lineItems).toEqual([
      { description: 'CLNCLT LNDRY SHEET', amount: 14.99, confidence: 90 },
    ]);
  });

  it('filters a card-surcharge line even though it has a trailing amount', () => {
    const result = parseReceiptLines(lines('Credit Card Surcharge   1.99'));
    expect(result.lineItems).toEqual([]);
  });

  it('filters pre-computed tip-suggestion lines', () => {
    const result = parseReceiptLines(
      lines('18%   $10.98', '20%   $12.20', '25%   $15.25')
    );
    expect(result.lineItems).toEqual([]);
  });
});
