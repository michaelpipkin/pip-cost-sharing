import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMemorizedTourSteps, MemorizedTourHooks } from './memorized.tour';

describe('buildMemorizedTourSteps', () => {
  let hooks: { [K in keyof MemorizedTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      expandFirst: vi.fn(),
      collapse: vi.fn(),
    };
  });

  const build = () => buildMemorizedTourSteps(hooks as MemorizedTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk search, new, the table, splits, and create', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'search',
      'memorize-new',
      'table',
      'splits',
      'create',
    ]);
  });

  it('should expand a row only for the splits step', async () => {
    await step('splits').beforeShow!();
    expect(hooks.expandFirst).toHaveBeenCalled();

    for (const id of ['intro', 'search', 'memorize-new', 'table', 'create']) {
      hooks.collapse.mockClear();
      await step(id).beforeShow!();
      expect(hooks.collapse, id).toHaveBeenCalled();
    }
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('samples');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('samples');
  });
});
