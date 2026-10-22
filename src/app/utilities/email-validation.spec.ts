import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import {
  isSingleEmailAddress,
  MAX_EMAIL_LENGTH,
  SINGLE_EMAIL_PATTERN,
  singleEmail,
} from './email-validation';

// The same table is checked against the server copy
// (functions/src/email-formatting.spec.ts) and the Firestore rules copy
// (e2e/infra/email-rules.spec.ts runs every row on the emulator).
// scripts/lint/email-pattern-agreement.test.mjs checks all three tables
// hold the same rows.
const VALID = [
  'a+b@x.co.uk',
  'alice@example.com',
  'Alice.Smith@Example.COM',
  "o'brien@x.io",
  'first.last@sub-domain.example.org',
  'a@x1.co',
  'A@X.COM',
  'user@example.xn--p1ai',
  'user@xn--80ak6aa92e.com',
];

const INVALID: [string, string][] = [
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
];

describe('SINGLE_EMAIL_PATTERN / isSingleEmailAddress', () => {
  it.each(VALID)('accepts %s', (email) => {
    expect(SINGLE_EMAIL_PATTERN.test(email)).toBe(true);
    expect(isSingleEmailAddress(email)).toBe(true);
  });

  it.each(INVALID)('rejects %s (%s)', (_label, email) => {
    expect(isSingleEmailAddress(email)).toBe(false);
  });

  it('accepts an address of exactly the maximum length and rejects one longer', () => {
    const domain = '@example.com';
    const atLimit = 'a'.repeat(MAX_EMAIL_LENGTH - domain.length) + domain;
    expect(atLimit).toHaveLength(254);
    expect(isSingleEmailAddress(atLimit)).toBe(true);
    expect(isSingleEmailAddress('a' + atLimit)).toBe(false);
    // The pattern alone would accept it: the length bound is separate.
    expect(SINGLE_EMAIL_PATTERN.test('a' + atLimit)).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isSingleEmailAddress(undefined)).toBe(false);
    expect(isSingleEmailAddress(null)).toBe(false);
    expect(isSingleEmailAddress(['a@x.com'])).toBe(false);
  });
});

describe('singleEmail (signal-forms validator)', () => {
  function emailForm(initial: string) {
    const model = signal({ email: initial });
    const f = form(
      model,
      (p) => singleEmail(p.email, { message: 'Bad email' }),
      { injector: TestBed.inject(Injector) }
    );
    return { model, f };
  }

  it('passes an empty value (requiredness is left to required())', () => {
    const { f } = emailForm('');
    expect(f.email().valid()).toBe(true);
    expect(f.email().errors()).toEqual([]);
  });

  it('passes one valid address', () => {
    const { f } = emailForm('a+b@x.co.uk');
    expect(f.email().valid()).toBe(true);
  });

  it.each(['a@b', 'a@x.com,b@y.com', 'a@x.com<b>'])(
    'reports an email error with the given message for %s',
    (email) => {
      const { f } = emailForm(email);
      expect(f.email().valid()).toBe(false);
      expect(f.email().errors()).toEqual([
        expect.objectContaining({ kind: 'email', message: 'Bad email' }),
      ]);
    }
  );

  it('re-validates when the value changes', () => {
    const { model, f } = emailForm('a@x.com');
    expect(f.email().valid()).toBe(true);
    model.set({ email: 'a@x.com,b@y.com' });
    expect(f.email().valid()).toBe(false);
    model.set({ email: '' });
    expect(f.email().valid()).toBe(true);
  });
});
