import { describe, expect, it } from 'vitest';
import {
  buildCategoryBreakdownHtml,
  buildEmailHtml,
  buildPaymentMethodLines,
  buildPaymentMethodsHtml,
  escapeHtml,
  formatAmount,
} from './index';
import {
  isSingleEmailAddress,
  MAX_EMAIL_LENGTH,
  SINGLE_EMAIL_PATTERN,
} from './email-builders';

// The same table as the app copy's spec (src/app/utilities/
// email-validation.spec.ts); the rules copy is checked by
// e2e/infra/email-rules.spec.ts.
describe('isSingleEmailAddress', () => {
  it.each([
    'a+b@x.co.uk',
    'alice@example.com',
    'Alice.Smith@Example.COM',
    "o'brien@x.io",
    'first.last@sub-domain.example.org',
    'a@x1.co',
    'A@X.COM',
    'user@example.xn--p1ai',
    'user@xn--80ak6aa92e.com',
  ])('accepts %s', (email) => {
    expect(isSingleEmailAddress(email)).toBe(true);
  });

  it.each([
    ['no dot in the domain', 'a@b'],
    ['a comma list', 'a@x.com,b@y.com'],
    ['a semicolon list', 'a@x.com;b'],
    ['a space before the @', 'a @x.com'],
    ['angle brackets', 'a@x.com<b>'],
    ['a quoted local part', '"a"@x.com'],
    ['two @', 'a@b@x.com'],
    ['no local part', '@x.com'],
    ['a leading dot', '.a@x.com'],
    ['a doubled dot', 'a..b@x.com'],
    ['a trailing dot in the local part', 'a.@x.com'],
    ['a one-letter TLD', 'a@x.c'],
    ['a numeric TLD', 'a@x.123'],
    ['a label starting with a hyphen', 'a@-x.com'],
    ['a label ending with a hyphen', 'a@x-.com'],
    ['an empty label', 'a@x..com'],
    ['a trailing newline', 'a@x.com\n'],
    ['a display name', 'Al <a@x.com>'],
    ['an empty string', ''],
    ['a non-ASCII local part', 'ü@x.com'],
    ['a non-ASCII domain', 'a@bücher.de'],
    ['an unfinished punycode TLD', 'a@x.xn--'],
  ])('rejects %s (%s)', (_label, email) => {
    expect(isSingleEmailAddress(email)).toBe(false);
  });

  it('rejects non-strings, arrays included', () => {
    expect(isSingleEmailAddress(undefined)).toBe(false);
    expect(isSingleEmailAddress(['a@x.com'])).toBe(false);
  });

  it('enforces the 254-character bound separately from the pattern', () => {
    const domain = '@example.com';
    const atLimit = 'a'.repeat(MAX_EMAIL_LENGTH - domain.length) + domain;
    expect(isSingleEmailAddress(atLimit)).toBe(true);
    expect(isSingleEmailAddress('a' + atLimit)).toBe(false);
    expect(SINGLE_EMAIL_PATTERN.test('a' + atLimit)).toBe(true);
  });
});

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
