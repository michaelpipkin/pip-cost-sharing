import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSummaryTourSteps, SummaryTourHooks } from './summary.tour';

describe('buildSummaryTourSteps', () => {
  let hooks: { [K in keyof SummaryTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      hasSettlement: vi.fn(() => true),
      showView: vi.fn(),
      expandFirst: vi.fn(),
      collapse: vi.fn(),
      openSettleGroup: vi.fn(async () => {}),
      closeDialogs: vi.fn(),
    };
  });

  const build = () => buildSummaryTourSteps(hooks as SummaryTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the member table, then the group settlement', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'member',
      'dates',
      'table',
      'breakdown',
      'request-pay',
      'settlement',
      'settlement-actions',
      'settle-group',
    ]);
  });

  it('should show the matching section on small screens', async () => {
    for (const id of ['intro', 'member', 'table', 'breakdown', 'request-pay']) {
      hooks.showView.mockClear();
      await step(id).beforeShow!();
      expect(hooks.showView, id).toHaveBeenCalledWith('individual');
    }
    for (const id of ['settlement', 'settlement-actions', 'settle-group']) {
      hooks.showView.mockClear();
      await step(id).beforeShow!();
      expect(hooks.showView, id).toHaveBeenCalledWith('settlement');
    }
  });

  it('should expand a row only for the breakdown step', async () => {
    await step('breakdown').beforeShow!();
    expect(hooks.expandFirst).toHaveBeenCalledOnce();
    expect(hooks.collapse).not.toHaveBeenCalled();

    await step('request-pay').beforeShow!();
    expect(hooks.collapse).toHaveBeenCalled();
  });

  it('should open the Settle Group confirmation only for its step', async () => {
    await step('settle-group').beforeShow!();
    expect(hooks.openSettleGroup).toHaveBeenCalledOnce();

    for (const id of ['intro', 'breakdown', 'settlement-actions']) {
      hooks.closeDialogs.mockClear();
      await step(id).beforeShow!();
      expect(hooks.closeDialogs, id).toHaveBeenCalled();
    }
  });

  it('should skip the settlement steps and end on payments with only two members', () => {
    hooks.hasSettlement.mockReturnValue(false);
    const steps = build();

    for (const id of ['settlement', 'settlement-actions', 'settle-group']) {
      expect(steps.find((s) => s.id === id)!.when!(), id).toBe(false);
    }
    expect(steps.find((s) => s.id === 'request-pay')!.text).toContain(
      "That's the tour!"
    );
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('sample');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('sample');
  });
});
