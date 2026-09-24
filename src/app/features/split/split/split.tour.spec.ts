import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSplitTourSteps, SplitTourHooks } from './split.tour';

describe('buildSplitTourSteps', () => {
  let hooks: { [K in keyof SplitTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      loadSample: vi.fn(),
      showForm: vi.fn(),
      showRental: vi.fn(),
      showSummary: vi.fn(),
    };
  });

  const build = () => buildSplitTourSteps(hooks as SplitTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the form, the split methods, the rental grid, and the summary', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'currency',
      'total',
      'proportional',
      'remainder',
      'add-split',
      'splits-amount',
      'split-method',
      'splits-percentage',
      'splits-shares',
      'rental-button',
      'rental-grid',
      'generate',
      'summary',
    ]);
  });

  it('should load the sample on the first step', async () => {
    await step('intro').beforeShow!();
    expect(hooks.loadSample).toHaveBeenCalledOnce();
    expect(hooks.showForm).toHaveBeenCalledWith('amount');
  });

  it('should switch split methods for the percentage and shares steps', async () => {
    await step('splits-percentage').beforeShow!();
    expect(hooks.showForm).toHaveBeenLastCalledWith('percentage');
    await step('splits-shares').beforeShow!();
    expect(hooks.showForm).toHaveBeenLastCalledWith('shares');
    await step('generate').beforeShow!();
    expect(hooks.showForm).toHaveBeenLastCalledWith('amount');
  });

  it('should open the rental grid and the summary only for their steps', async () => {
    await step('rental-grid').beforeShow!();
    expect(hooks.showRental).toHaveBeenCalledOnce();
    await step('summary').beforeShow!();
    expect(hooks.showSummary).toHaveBeenCalledOnce();
  });

  it('should explain that the total includes tax and tip, and shares can be fractional', () => {
    expect(step('total').text).toContain('including tax and tip');
    expect(step('proportional').text).toContain('not added on top');
    expect(step('splits-shares').text).toContain(
      "don't have to be whole numbers"
    );
  });
});
