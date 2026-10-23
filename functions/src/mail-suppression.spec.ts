import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { buildSuppressedDelivery, isDemoProject } from './common';

describe('isDemoProject', () => {
  it('treats demo-* project IDs as demo', () =>
    expect(isDemoProject('demo-pipsplit-test')).toBe(true));

  it('treats the real project as not demo', () =>
    expect(isDemoProject('pip-cost-sharing')).toBe(false));

  it('treats a missing project ID as not demo', () =>
    expect(isDemoProject(undefined)).toBe(false));

  it('matches only the demo- prefix, not a demo- elsewhere in the ID', () =>
    expect(isDemoProject('my-demo-x')).toBe(false));
});

describe('buildSuppressedDelivery', () => {
  it('builds a SUCCESS delivery listing every recipient', () => {
    const d = buildSuppressedDelivery(
      ['a@pipsplit.test', 'b@pipsplit.test'],
      Timestamp.now()
    );
    expect(d.state).toBe('SUCCESS');
    expect(d.info.accepted).toEqual(['a@pipsplit.test', 'b@pipsplit.test']);
    expect(d.info.rejected).toEqual([]);
    expect(d.info.messageId).toBe('suppressed');
    expect(d.info.response).toBe('suppressed: demo project');
  });

  it('wraps a single recipient in an array', () =>
    expect(
      buildSuppressedDelivery('a@pipsplit.test', Timestamp.now()).info.accepted
    ).toEqual(['a@pipsplit.test']));
});
