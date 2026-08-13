import { describe, expect, it } from 'vitest';
import { deriveEmailLower, normalizeEmail } from './index';

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Alex@Example.com')).toBe('alex@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  alex@example.com  ')).toBe('alex@example.com');
  });

  it('is idempotent', () => {
    expect(normalizeEmail(normalizeEmail('Alex@Example.com'))).toBe(
      'alex@example.com'
    );
  });
});

describe('deriveEmailLower', () => {
  it('normalizes a real email', () => {
    expect(deriveEmailLower('Alex@Example.com')).toBe('alex@example.com');
  });

  it('returns null for a blank email (placeholder member)', () => {
    expect(deriveEmailLower('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(deriveEmailLower(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(deriveEmailLower(null)).toBeNull();
  });
});
