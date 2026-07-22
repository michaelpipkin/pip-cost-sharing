import { describe, expect, it } from 'vitest';
import {
  buildCategoryBreakdownHtml,
  buildEmailHtml,
  buildPaymentMethodLines,
  buildPaymentMethodsHtml,
  escapeHtml,
  formatAmount,
} from './index';

describe('formatAmount', () => {
  it('formats a standard ISO currency using Intl.NumberFormat', () => {
    expect(formatAmount(12.5, 'USD', '$', 2)).toBe('$12.50');
  });

  it('respects the group decimal places setting', () => {
    expect(formatAmount(12.5, 'USD', '$', 0)).toBe('$13');
  });

  it('falls back to symbol + toFixed for the OTH pseudo-currency', () => {
    expect(formatAmount(5, 'OTH', '¤', 2)).toBe('¤5.00');
  });

  it('falls back to symbol + toFixed for the OT2 pseudo-currency', () => {
    expect(formatAmount(5, 'OT2', '¤', 2)).toBe('¤5.00');
  });

  it('omits the symbol for OTH when no symbol is configured', () => {
    expect(formatAmount(5, 'OTH', '', 2)).toBe('5.00');
  });

  it('falls back to plain formatting when the currency code is invalid', () => {
    expect(formatAmount(5, 'NOTACODE', '#', 2)).toBe('#5.00');
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >, and "', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;'
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('nothing special')).toBe('nothing special');
  });
});

describe('buildEmailHtml', () => {
  it('wraps content in the standard shell with the default footer', () => {
    const html = buildEmailHtml('<p>hello</p>');
    expect(html).toContain('<p>hello</p>');
    expect(html).toContain('member of a PipSplit group');
  });

  it('uses a custom footer when provided', () => {
    const html = buildEmailHtml('<p>hello</p>', 'Admin-only notice');
    expect(html).toContain('Admin-only notice');
    expect(html).not.toContain('member of a PipSplit group');
  });
});

describe('buildCategoryBreakdownHtml', () => {
  it('returns an empty string for blank input', () => {
    expect(buildCategoryBreakdownHtml('   ')).toBe('');
  });

  it('converts each "Category: Amount" line into a table row', () => {
    const html = buildCategoryBreakdownHtml(
      '  Groceries: $12.50\n  Utilities: $30.00'
    );
    expect(html).toContain('Groceries');
    expect(html).toContain('$12.50');
    expect(html).toContain('Utilities');
    expect(html).toContain('$30.00');
    expect(html.match(/<tr/g)?.length).toBe(3); // header row + 2 data rows
  });
});

describe('buildPaymentMethodsHtml', () => {
  it('renders the italic fallback message as-is', () => {
    const html = buildPaymentMethodsHtml('(No payment methods on file)');
    expect(html).toContain('font-style:italic');
    expect(html).toContain('(No payment methods on file)');
  });

  it('renders each line as its own paragraph', () => {
    const html = buildPaymentMethodsHtml('Venmo: @foo\nPayPal: bar@baz.com');
    expect(html.match(/<p /g)?.length).toBe(2);
    expect(html).toContain('Venmo: @foo');
    expect(html).toContain('PayPal: bar@baz.com');
  });
});

describe('buildPaymentMethodLines', () => {
  it('returns the fallback message when no payment methods are set', () => {
    expect(buildPaymentMethodLines({})).toBe('(No payment methods on file)');
  });

  it('includes every configured payment method, stripping a leading @ from venmoId', () => {
    const lines = buildPaymentMethodLines({
      venmoId: '@jane',
      paypalId: 'jane@example.com',
      cashAppId: 'jane123',
      zelleId: 'jane@example.com',
    });
    expect(lines).toBe(
      'Venmo: @jane\nPayPal: jane@example.com\nCash App: $jane123\nZelle: jane@example.com'
    );
  });

  it('only includes the methods that are actually set', () => {
    expect(buildPaymentMethodLines({ zelleId: 'jane@example.com' })).toBe(
      'Zelle: jane@example.com'
    );
  });
});
