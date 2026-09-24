import { signal } from '@angular/core';
import { SplitMethod } from '@utils/split-method';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildExpenseFormTourSteps,
  createExpenseFormTour,
  ExpenseFormTourHooks,
  ExpenseFormTourVariant,
} from './expense-form.tour';

describe('expense form tour', () => {
  describe('buildExpenseFormTourSteps', () => {
    let hooks: {
      [K in keyof ExpenseFormTourHooks]-?: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      vi.clearAllMocks();
      hooks = {
        loadSample: vi.fn(),
        setSplitMethod: vi.fn(),
        categoryVisible: vi.fn(() => true),
        hasRental: vi.fn(() => false),
        hasReceipt: vi.fn(() => false),
      };
    });

    const build = (variant: ExpenseFormTourVariant) =>
      buildExpenseFormTourSteps(variant, hooks as ExpenseFormTourHooks);
    const ids = (variant: ExpenseFormTourVariant) =>
      build(variant).map((s) => s.id);
    const step = (variant: ExpenseFormTourVariant, id: string) =>
      build(variant).find((s) => s.id === id)!;

    it('should walk the Add Expense form top to bottom', () => {
      expect(ids('add-expense')).toEqual([
        'intro',
        'payer',
        'date',
        'description',
        'total',
        'proportional',
        'remainder',
        'splits-amount',
        'split-method',
        'splits-percentage',
        'splits-shares',
        'add-splits',
        'receipt',
        'save',
      ]);
    });

    it('should add the rental step only to Edit Expense', () => {
      expect(ids('edit-expense')).toContain('rental');
      expect(ids('add-expense')).not.toContain('rental');
      expect(ids('edit-memorized')).not.toContain('rental');
    });

    it('should show the rental step only when the expense has a rental', () => {
      const rental = step('edit-expense', 'rental');
      expect(rental.when!()).toBe(false);
      hooks.hasRental.mockReturnValue(true);
      expect(rental.when!()).toBe(true);
    });

    it.each(['add-memorized', 'edit-memorized'] as const)(
      '%s should skip the date and receipt steps',
      (variant) => {
        expect(ids(variant)).not.toContain('date');
        expect(ids(variant)).not.toContain('receipt');
      }
    );

    it('should point Add Members at both buttons only on add pages', () => {
      expect(step('add-memorized', 'add-splits').target).toEqual([
        'add-split',
        'add-all-members',
      ]);
      expect(step('edit-expense', 'add-splits').target).toBe('add-split');
    });

    it('should describe viewing and replacing only when a receipt is attached', () => {
      expect(step('edit-expense', 'receipt').text).not.toContain(
        'View Receipt'
      );
      hooks.hasReceipt.mockReturnValue(true);
      expect(step('edit-expense', 'receipt').text).toContain('View Receipt');
    });

    it('should include View Receipt in the receipt step when editing', () => {
      expect(step('edit-expense', 'receipt').target).toEqual([
        'receipt',
        'view-receipt',
      ]);
    });

    it('should tailor the intro and save text to the page', () => {
      expect(step('add-memorized', 'intro').text).toContain('template');
      expect(step('edit-expense', 'intro').title).toBe('Editing an expense');
      expect(step('add-expense', 'save').text).toContain('Save & Add Another');
      expect(step('edit-expense', 'save').text).toContain('Delete');
      expect(step('add-memorized', 'save').text).toContain('+ button');
    });

    it('should load the sample on the intro step', async () => {
      await step('add-expense', 'intro').beforeShow!();
      expect(hooks.loadSample).toHaveBeenCalled();
    });

    it.each([
      ['splits-percentage', 'percentage'],
      ['splits-shares', 'shares'],
      ['proportional', 'amount'],
      ['add-splits', 'amount'],
    ])('%s should switch the split method to %s', async (id, method) => {
      await step('edit-memorized', id).beforeShow!();
      expect(hooks.setSplitMethod).toHaveBeenCalledWith(method);
    });

    it('should mention categories only when the category field is shown', () => {
      expect(step('add-expense', 'description').text).toContain('category');
      hooks.categoryVisible.mockReturnValue(false);
      expect(step('add-expense', 'description').text).not.toContain('category');
    });

    it('should explain the total includes tax and tip, and fractional shares', () => {
      expect(step('add-expense', 'total').text).toContain(
        'including tax and tip'
      );
      expect(step('add-expense', 'proportional').text).toContain(
        'not added on top'
      );
      expect(step('add-expense', 'splits-shares').text).toContain(
        "don't have to be whole numbers"
      );
    });
  });

  describe('createExpenseFormTour', () => {
    const split = (assignedAmount = '0.00') => ({
      assignedAmount,
      percentage: null as number | null,
      shares: null as number | null,
    });

    function setup(options: { addAll?: boolean; dirty?: boolean } = {}) {
      const model = signal({ splits: [] as ReturnType<typeof split>[] });
      const formData = signal({
        description: '',
        amount: '0.00',
        allocatedAmount: '0.00',
      });
      const splitMethod = signal<SplitMethod>('amount');
      const dirty =
        options.dirty === undefined ? undefined : signal(options.dirty);
      const recalculate = vi.fn();
      const addAllMembers = options.addAll
        ? vi.fn(() =>
            model.update((m) => ({ ...m, splits: [split(), split(), split()] }))
          )
        : undefined;
      const tour = createExpenseFormTour({
        model,
        formData,
        splitMethod,
        dirty,
        recalculate,
        addAllMembers,
        formatAmount: (value) => value.toFixed(2),
        toNumber: (value) => Number(value),
      });
      return { model, formData, splitMethod, dirty, recalculate, tour };
    }

    it('should fill a sample expense on add pages', () => {
      const { model, formData, tour } = setup({ addAll: true });
      tour.hooks.loadSample();

      expect(formData()).toEqual({
        description: 'Dinner out',
        amount: '100.00',
        allocatedAmount: '15.00',
      });
      expect(model().splits.map((s) => s.assignedAmount)).toEqual([
        '30.00',
        '25.00',
        '0.00',
      ]);
    });

    it('should not load a sample on edit pages', () => {
      const { formData, tour } = setup();
      const before = formData();
      tour.hooks.loadSample();
      expect(formData()).toBe(before);
    });

    it('should add sample percentages and shares only when none are set', () => {
      const { model, splitMethod, recalculate, tour } = setup({ addAll: true });
      tour.hooks.loadSample();

      tour.hooks.setSplitMethod('percentage');
      expect(splitMethod()).toBe('percentage');
      expect(model().splits.map((s) => s.percentage)).toEqual([40, 30, 30]);

      tour.hooks.setSplitMethod('shares');
      expect(model().splits.map((s) => s.shares)).toEqual([2, 1.5, 1]);
      expect(recalculate).toHaveBeenCalled();

      model.update((m) => ({
        ...m,
        splits: m.splits.map((s) => ({ ...s, shares: 3 })),
      }));
      tour.hooks.setSplitMethod('shares');
      expect(model().splits.map((s) => s.shares)).toEqual([3, 3, 3]);
    });

    it('should restore the form and the dirty flag exactly', () => {
      const { model, formData, splitMethod, dirty, tour } = setup({
        addAll: true,
        dirty: false,
      });
      const [m, f] = [model(), formData()];

      tour.hooks.loadSample();
      tour.hooks.setSplitMethod('shares');
      dirty!.set(true);
      tour.restore();

      expect(model()).toBe(m);
      expect(formData()).toBe(f);
      expect(splitMethod()).toBe('amount');
      expect(dirty!()).toBe(false);
    });
  });
});
