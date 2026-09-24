import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExpensesTourSteps, ExpensesTourHooks } from './expenses.tour';

describe('buildExpensesTourSteps', () => {
  let hooks: { [K in keyof ExpensesTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      isAdmin: vi.fn(() => true),
      expandFirst: vi.fn(),
      collapse: vi.fn(),
      openAddExpenseOptions: vi.fn(async () => {}),
      closeDialogs: vi.fn(),
    };
  });

  const build = () => buildExpensesTourSteps(hooks as ExpensesTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk search, adding, the table, and the split details', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'search',
      'add-expense',
      'add-expense-options',
      'table',
      'column-filters',
      'splits',
      'mark-paid',
    ]);
  });

  it('should open the Add New Expense options only for that step', async () => {
    await step('add-expense-options').beforeShow!();
    expect(hooks.openAddExpenseOptions).toHaveBeenCalledOnce();

    for (const id of ['intro', 'search', 'add-expense', 'table', 'column-filters']) {
      hooks.closeDialogs.mockClear();
      await step(id).beforeShow!();
      expect(hooks.closeDialogs, id).toHaveBeenCalled();
    }
  });

  it('should expand a row only for the split steps', async () => {
    for (const id of ['splits', 'mark-paid']) {
      hooks.expandFirst.mockClear();
      await step(id).beforeShow!();
      expect(hooks.expandFirst, id).toHaveBeenCalled();
    }
    for (const id of ['intro', 'search', 'table', 'column-filters']) {
      hooks.collapse.mockClear();
      await step(id).beforeShow!();
      expect(hooks.collapse, id).toHaveBeenCalled();
    }
  });

  it('should explain that marking a split paid is not a recorded payment', () => {
    expect(step('mark-paid').text).toContain("doesn't record a payment");
    hooks.isAdmin.mockReturnValue(false);
    expect(step('mark-paid').when!()).toBe(false);
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('samples');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('samples');
  });
});
