import { describe, expect, it } from 'vitest';
import { buildHistoryTourSteps } from './history.tour';

describe('buildHistoryTourSteps', () => {
  const build = (usingSample = false) =>
    buildHistoryTourSteps({ usingSample: () => usingSample });

  it('should walk the member select, dates, table, and payment type', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'member-select',
      'dates',
      'table',
      'type',
    ]);
  });

  it('should explain the payment type icons', () => {
    const type = build().find((s) => s.id === 'type')!;
    expect(type.text).toContain('person icon');
    expect(type.text).toContain('group icon');
  });

  it('should mention the samples only when showing them', () => {
    expect(build()[0]!.text).not.toContain('samples');
    expect(build(true)[0]!.text).toContain('samples');
  });
});
