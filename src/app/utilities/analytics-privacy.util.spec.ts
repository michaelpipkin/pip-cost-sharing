import { describe, expect, it } from 'vitest';
import { scrubAnalyticsParams, scrubEmails } from './analytics-privacy.util';

describe('scrubEmails', () => {
  it('replaces an email at the start of an error string', () => {
    expect(
      scrubEmails('alice@test.com (error: AppCheck: Requests throttled)')
    ).toBe('[email] (error: AppCheck: Requests throttled)');
  });

  it('replaces several emails, including plus-addressing and subdomains', () => {
    expect(
      scrubEmails('from a.b+tag@mail.example.co.uk to bob_1@test.org done')
    ).toBe('from [email] to [email] done');
  });

  it('leaves text without an email unchanged', () => {
    const text = 'Missing or insufficient permissions. user-agent @ 10:00';
    expect(scrubEmails(text)).toBe(text);
  });
});

describe('scrubAnalyticsParams', () => {
  it('drops an email parameter in any letter case', () => {
    expect(
      scrubAnalyticsParams({ email: 'a@b.com', Email: 'c@d.com', count: 2 })
    ).toEqual({ count: 2 });
  });

  it('scrubs emails inside string values and keeps other types as they are', () => {
    expect(
      scrubAnalyticsParams({
        error: 'bob@test.com (error: x)',
        membersLinked: 3,
        ready: 'true',
      })
    ).toEqual({ error: '[email] (error: x)', membersLinked: 3, ready: 'true' });
  });

  it('does not mutate the original object', () => {
    const original = { email: 'a@b.com', error: 'a@b.com failed' };
    scrubAnalyticsParams(original);
    expect(original).toEqual({ email: 'a@b.com', error: 'a@b.com failed' });
  });
});
