import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHistoryDetailTourSteps,
  HistoryDetailTourHooks,
} from './history-detail.tour';

describe('buildHistoryDetailTourSteps', () => {
  let hooks: { [K in keyof HistoryDetailTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      isGroupSettle: vi.fn(() => false),
      hasBreakdown: vi.fn(() => true),
      isAdmin: vi.fn(() => true),
      showView: vi.fn(),
    };
  });

  const build = () =>
    buildHistoryDetailTourSteps(hooks as HistoryDetailTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;
  const shown = () =>
    build()
      .filter((s) => s.when?.() ?? true)
      .map((s) => s.id);

  it('should walk the payment, its breakdown, and the unpay options', () => {
    expect(shown()).toEqual([
      'intro',
      'copy',
      'view',
      'splits',
      'categories',
      'unpay-split',
      'unpay-all',
    ]);
    expect(step('unpay-all').text).toContain("That's the tour!");
    expect(step('categories').text).not.toContain("That's the tour!");
  });

  it('should show the category view only for its step', async () => {
    await step('categories').beforeShow!();
    expect(hooks.showView).toHaveBeenLastCalledWith('summary');

    for (const id of ['intro', 'splits', 'unpay-split', 'unpay-all']) {
      await step(id).beforeShow!();
      expect(hooks.showView, id).toHaveBeenLastCalledWith('details');
    }
  });

  it('should leave out the unpay steps for non-admins and end on the breakdown', () => {
    hooks.isAdmin.mockReturnValue(false);

    expect(shown()).toEqual(['intro', 'copy', 'view', 'splits', 'categories']);
    expect(step('categories').text).toContain("That's the tour!");
  });

  it('should describe a group settlement, which has no single-split unpay', () => {
    hooks.isGroupSettle.mockReturnValue(true);

    expect(step('intro').text).toContain('group settlement');
    expect(step('unpay-all').title).toBe('Undo the settlement');
    expect(shown()).not.toContain('unpay-split');
  });

  it('should skip the breakdown steps for a settlement recorded without splits', () => {
    hooks.isGroupSettle.mockReturnValue(true);
    hooks.hasBreakdown.mockReturnValue(false);
    hooks.isAdmin.mockReturnValue(false);

    expect(shown()).toEqual(['intro', 'copy']);
    expect(step('copy').text).toContain("That's the tour!");
  });
});
